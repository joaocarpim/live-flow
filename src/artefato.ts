// Lê e valida o artefato de cards (.liveflow/cards.yaml).
// Regra: um card só é selecionável se tiver o passo a passo ("como_testar") válido.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ACOES } from './tipos.ts';
import type { Artefato, Card, CardAvaliado, PassoCard, PerfilCard, Sistema } from './tipos.ts';

export const CAMINHO_ARTEFATO = '.liveflow/cards.yaml';

export function caminhoArtefato(raiz: string): string {
  return join(raiz, CAMINHO_ARTEFATO);
}

export function carregarArtefato(raiz: string): Artefato {
  const arq = caminhoArtefato(raiz);
  if (!existsSync(arq)) {
    return { versao: 1, sistema: sistemaPadrao({}), variaveis: {}, cards: [], problemas: [`Não existe ${CAMINHO_ARTEFATO} neste projeto.`] };
  }
  return lerArtefato(readFileSync(arq, 'utf8'));
}

export function lerArtefato(texto: string): Artefato {
  const problemas: string[] = [];
  let bruto: unknown;
  try {
    bruto = parse(texto);
  } catch (e) {
    return { versao: 1, sistema: sistemaPadrao({}), variaveis: {}, cards: [], problemas: [`O YAML não abre: ${(e as Error).message}`] };
  }
  const raiz = obj(bruto);
  if (raiz.versao !== undefined && raiz.versao !== 1) problemas.push(`versao ${String(raiz.versao)} não é suportada (use 1).`);
  const sistema = sistemaPadrao(obj(raiz.sistema), problemas);
  const variaveis: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(raiz.variaveis))) {
    if (typeof v === 'string' || typeof v === 'number') variaveis[k] = String(v);
    else problemas.push(`variaveis.${k} precisa ser texto.`);
  }
  const listas = Array.isArray(raiz.cards) ? raiz.cards : [];
  if (!Array.isArray(raiz.cards)) problemas.push('Falta a lista "cards".');
  const ids = new Set<string>();
  const cards = listas.map((c, i) => avaliarCard(c, i, ids));
  resolverReferencias(cards);
  return { versao: 1, sistema, variaveis, cards, problemas };
}

function sistemaPadrao(s: Record<string, unknown>, problemas: string[] = []): Sistema {
  const lista = (v: unknown, padrao: string[]) => (Array.isArray(v) ? v.map(String) : padrao);
  const paralelo = typeof s.paralelo === 'number' && s.paralelo >= 1 ? Math.floor(s.paralelo) : 1;
  const sistema: Sistema = {
    url: typeof s.url === 'string' ? s.url : 'http://localhost:3000',
    permitidos: lista(s.permitidos, ['localhost', '127.0.0.1']),
    producao: lista(s.producao, []),
    base: typeof s.base === 'string' ? s.base : 'main',
    saude: typeof s.saude === 'string' ? s.saude : '/',
    paralelo,
  };
  if (typeof s.preparar === 'string') sistema.preparar = s.preparar;
  if (typeof s.iniciar === 'string') sistema.iniciar = s.iniciar;
  if (typeof s.seed === 'string') sistema.seed = s.seed;
  if (sistema.iniciar && !sistema.iniciar.includes('{{porta}}')) problemas.push('sistema.iniciar deve usar {{porta}} para cada branch subir na sua porta.');
  if (sistema.paralelo > 1 && !(sistema.iniciar && sistema.seed?.includes('{{execucao}}'))) {
    problemas.push('paralelo maior que 1 precisa de app próprio por execução (iniciar com {{porta}}) e banco próprio (seed com {{execucao}}). Vou rodar 1 por vez.');
    sistema.paralelo = 1;
  }
  return sistema;
}

function avaliarCard(bruto: unknown, i: number, ids: Set<string>): CardAvaliado {
  const c = obj(bruto);
  const problemas: string[] = [];
  const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `#${i + 1}`;
  if (id.startsWith('#')) problemas.push('Falta o id do card.');
  else if (ids.has(id)) problemas.push(`O id ${id} aparece mais de uma vez.`);
  ids.add(id);
  const titulo = typeof c.titulo === 'string' ? c.titulo : '';
  if (!titulo) problemas.push('Falta o título.');
  const criterios = Array.isArray(c.criterios) ? c.criterios.map(String) : [];

  const listaIds = (v: unknown, campo: string) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
      problemas.push(`"${campo}" precisa ser uma lista de textos.`);
      return [];
    }
    return v as string[];
  };
  const tipo = c.tipo === 'jornada' ? 'jornada' : 'card';
  if (c.tipo !== undefined && c.tipo !== 'card' && c.tipo !== 'jornada') problemas.push(`tipo "${String(c.tipo)}" não existe (use card ou jornada).`);
  const card: Card = {
    id, titulo, tipo, criterios, como_testar: [], perfil: perfil(c.testes, problemas),
    altera: listaIds(c.altera, 'altera'),
    depende_de: listaIds(c.depende_de, 'depende_de'),
    exclusivo: c.exclusivo === true || c.exclusivo === 'sim',
  };
  if (tipo === 'jornada') {
    card.etapas = listaIds(c.etapas, 'etapas');
    if (card.etapas.length < 2) problemas.push('Jornada precisa de pelo menos 2 etapas (ids de cards).');
    if (c.como_testar !== undefined) problemas.push('Jornada não tem "como_testar" próprio: os passos vêm das etapas.');
  }
  if (typeof c.descricao === 'string') card.descricao = c.descricao;
  if (typeof c.branch === 'string' && c.branch.trim()) {
    card.branch = c.branch.trim();
    if (card.branch.startsWith('-')) problemas.push('Nome de branch inválido.');
  }
  if (Array.isArray(c.arquivos)) card.arquivos = c.arquivos.map(String);

  const passosBrutos = c.como_testar;
  let semPassos = false;
  if (tipo === 'jornada') {
    // os passos são montados depois, em resolverReferencias
  } else if (passosBrutos === undefined || passosBrutos === null || (Array.isArray(passosBrutos) && passosBrutos.length === 0)) {
    semPassos = true;
  } else if (!Array.isArray(passosBrutos)) {
    problemas.push('"como_testar" precisa ser uma lista de passos.');
  } else {
    passosBrutos.forEach((p, j) => {
      const r = lerPasso(p, j + 1, criterios.length);
      if (typeof r === 'string') problemas.push(`Passo ${j + 1}: ${r}`);
      else card.como_testar.push(r);
    });
    if (card.como_testar.length && card.como_testar[0]?.acao !== 'abrir' && card.como_testar[0]?.acao !== 'api') {
      problemas.push('O primeiro passo precisa ser "abrir" (ou "api"), para o teste começar sempre do mesmo lugar.');
    }
  }
  const estado = problemas.length ? 'invalido' : semPassos ? 'sem_passos' : 'pronto';
  if (estado === 'sem_passos') problemas.push('Falta o passo a passo ("como_testar"). Sem ele o card não pode ser testado.');
  return { card, estado, problemas };
}

/** Depois de ler todos: valida depende_de, detecta ciclos e monta os passos das jornadas. */
function resolverReferencias(cards: CardAvaliado[]): void {
  const porId = new Map(cards.map((c) => [c.card.id, c]));
  const invalidar = (c: CardAvaliado, msg: string) => {
    c.problemas = c.problemas.filter((p) => !p.startsWith('Falta o passo a passo'));
    c.problemas.push(msg);
    c.estado = 'invalido';
  };
  for (const c of cards) {
    for (const d of c.card.depende_de) {
      if (d === c.card.id) invalidar(c, 'O card não pode depender de si mesmo.');
      else if (!porId.has(d)) invalidar(c, `depende_de: ${d} não existe no artefato.`);
    }
  }
  // ciclos em depende_de
  const estado = new Map<string, 'visitando' | 'feito'>();
  const visitar = (id: string, caminho: string[]): string[] | null => {
    if (estado.get(id) === 'feito') return null;
    if (estado.get(id) === 'visitando') return [...caminho.slice(caminho.indexOf(id)), id];
    estado.set(id, 'visitando');
    for (const d of porId.get(id)?.card.depende_de ?? []) {
      const ciclo = visitar(d, [...caminho, id]);
      if (ciclo) return ciclo;
    }
    estado.set(id, 'feito');
    return null;
  };
  for (const c of cards) {
    const ciclo = visitar(c.card.id, []);
    if (ciclo) for (const id of new Set(ciclo)) {
      const alvo = porId.get(id);
      if (alvo && !alvo.problemas.some((p) => p.startsWith('Dependência circular'))) invalidar(alvo, `Dependência circular: ${ciclo.join(' → ')}.`);
    }
  }
  // jornadas
  for (const j of cards.filter((c) => c.card.tipo === 'jornada')) {
    if (j.estado === 'invalido') continue;
    const passos: PassoCard[] = [];
    const branches = new Set<string>();
    let erro = '';
    for (const id of j.card.etapas ?? []) {
      const e = porId.get(id);
      if (!e) { erro = `etapa ${id} não existe no artefato.`; break; }
      if (e.card.tipo === 'jornada') { erro = `etapa ${id} é outra jornada (jornada dentro de jornada não é suportada).`; break; }
      if (e.estado !== 'pronto') { erro = `etapa ${id} não está pronta: ${e.problemas[0] ?? ''}`; break; }
      if (e.card.branch) branches.add(e.card.branch);
      for (const p of e.card.como_testar) {
        const { criterio: _c, ...resto } = p;
        passos.push({ ...resto, n: passos.length + 1, etapa: id } as PassoCard);
      }
    }
    if (!erro && !j.card.branch && branches.size > 1) erro = `as etapas estão em branches diferentes (${[...branches].join(', ')}). Declare "branch" na jornada.`;
    if (erro) { invalidar(j, `Jornada: ${erro}`); continue; }
    j.card.como_testar = passos;
    if (!j.card.branch && branches.size === 1) j.card.branch = [...branches][0]!;
    j.problemas = [];
    j.estado = 'pronto';
  }
}

function perfil(bruto: unknown, problemas: string[]): PerfilCard {
  const t = obj(bruto);
  const sim = (v: unknown) => v === true || v === 'sim';
  const nao = (v: unknown) => v === false || v === 'nao' || v === 'não';
  const p: PerfilCard = {};
  for (const k of ['interface', 'upload', 'migracao'] as const) {
    if (sim(t[k])) p[k] = true;
    else if (nao(t[k])) p[k] = false;
  }
  if (Array.isArray(t.perfis)) p.perfis = t.perfis.map(String);
  const carga = obj(t.carga);
  if (typeof carga.usuarios === 'number' && typeof carga.p95_ms === 'number') p.carga = { usuarios: carga.usuarios, p95_ms: carga.p95_ms };
  else if (t.carga !== undefined) problemas.push('testes.carga precisa de usuarios e p95_ms (números).');
  if (t.vizinhos === 'auto' || t.vizinhos === 'nao') p.vizinhos = t.vizinhos;
  else if (Array.isArray(t.vizinhos)) p.vizinhos = t.vizinhos.map(String);
  return p;
}

/** Converte um passo do YAML. Devolve texto quando há erro. */
export function lerPasso(bruto: unknown, n: number, nCriterios: number): PassoCard | string {
  const p = obj(bruto);
  const chaves = Object.keys(p).filter((k) => k !== 'criterio');
  const acoes = chaves.filter((k) => (ACOES as readonly string[]).includes(k));
  const desconhecidas = chaves.filter((k) => !(ACOES as readonly string[]).includes(k));
  if (desconhecidas.length) return `ação desconhecida "${desconhecidas[0]}". Use uma de: ${ACOES.join(', ')}.`;
  if (acoes.length !== 1) return acoes.length ? 'cada passo tem uma ação só.' : 'passo vazio.';
  const acao = acoes[0]!;
  const v = p[acao];
  const extra: { n: number; criterio?: number } = { n };
  if (p.criterio !== undefined) {
    if (typeof p.criterio !== 'number' || !Number.isInteger(p.criterio) || p.criterio < 1 || p.criterio > nCriterios) {
      return `"criterio: ${String(p.criterio)}" não existe (o card tem ${nCriterios} critério(s)).`;
    }
    extra.criterio = p.criterio;
  }
  const txt = (x: unknown) => (typeof x === 'string' && x.trim() ? x : null);
  switch (acao) {
    case 'abrir': {
      const c = txt(v);
      if (!c) return '"abrir" precisa de um caminho, ex.: /orcamentos/1042';
      if (/^[a-z]+:\/\//i.test(c)) return '"abrir" usa caminho relativo ao sistema (ex.: /login), nunca endereço completo.';
      return { acao, caminho: c, ...extra };
    }
    case 'clicar': {
      const a = txt(v);
      return a ? { acao, alvo: a, ...extra } : '"clicar" precisa do texto visível do botão ou link.';
    }
    case 'marcar': {
      const a = txt(v);
      return a ? { acao, campo: a, ...extra } : '"marcar" precisa do rótulo da caixa.';
    }
    case 'ver_texto':
    case 'nao_ver_texto': {
      const a = txt(v);
      return a ? { acao, texto: a, ...extra } : `"${acao}" precisa do texto.`;
    }
    case 'ver_url': {
      const a = txt(v);
      return a ? { acao, padrao: a, ...extra } : '"ver_url" precisa do caminho esperado, ex.: /orcamentos/*';
    }
    case 'esperar_ms': {
      if (typeof v !== 'number' || v <= 0 || v > 30000) return '"esperar_ms" precisa de 1 a 30000. Prefira ver_texto, que espera o que importa.';
      return { acao, ms: v, ...extra };
    }
    case 'preencher': {
      const o = obj(v);
      const campo = txt(o.campo);
      if (!campo || (typeof o.valor !== 'string' && typeof o.valor !== 'number')) return '"preencher" precisa de campo e valor.';
      return { acao, campo, valor: String(o.valor), ...extra };
    }
    case 'selecionar': {
      const o = obj(v);
      const campo = txt(o.campo);
      const opcao = txt(o.opcao);
      return campo && opcao ? { acao, campo, opcao, ...extra } : '"selecionar" precisa de campo e opcao.';
    }
    case 'api': {
      const o = obj(v);
      const metodo = typeof o.metodo === 'string' ? o.metodo.toUpperCase() : 'GET';
      const rota = txt(o.rota);
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo)) return `método "${metodo}" não suportado.`;
      if (!rota || !rota.startsWith('/')) return '"api" precisa de rota começando com /';
      if (typeof o.status !== 'number') return '"api" precisa do status esperado (ex.: 200).';
      const passo: PassoCard = { acao, metodo, rota, status: o.status, ...extra };
      if (o.corpo !== undefined) passo.corpo = o.corpo;
      if (o.contem !== undefined) passo.contem = obj(o.contem);
      return passo;
    }
  }
  return 'ação não tratada.';
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
