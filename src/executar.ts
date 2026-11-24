// Orquestra a execução: cópia da branch → app no ar → banco zerado → fluxo → repetição → vizinhos.
// Princípio: só dizer "passou" ou "falhou" quando tivermos certeza de QUAL código foi testado.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arquivosMudados, branchAtual, criarCopia } from './git.ts';
import { globParaRegex } from './fontes.ts';
import type { AlvoCard } from './fontes.ts';
import type { Bloco } from './blocos.ts';
import { comRepeticao } from './repeticao.ts';
import { classificarRegressao } from './comparacao.ts';
import { verificarAlvo } from './seguranca.ts';
import { descrever } from './descricao.ts';
import type { Registro } from './eventos.ts';
import type { EntradaFluxo } from './runtime/fluxo.ts';
import type { Artefato, CardAvaliado, Certeza, Resultado, Sistema } from './tipos.ts';
import type { Modo } from './plano.ts';

export interface FalhaPasso {
  passo: number;
  descricao: string;
  erro: string;
  motivo: string;
  print?: string;
  url?: string;
}

export interface ResultadoVizinho {
  card: string;
  resultado: 'ok' | 'quebrou_nesta_branch' | 'ja_quebrado_na_base' | 'nao_rodou';
  motivo?: string;
  falha?: FalhaPasso;
}

export interface ResultadoCard {
  card: string;
  branch: string | null;
  sha?: string;
  resultado: Resultado;
  certeza?: Certeza;
  tentativas: number;
  /** O banco foi zerado (seed) antes de cada tentativa? */
  bancoZerado: boolean;
  falha?: FalhaPasso;
  avisos: { regra: string; mensagem: string }[];
  motivo?: string;
  pasta: string;
  vizinhos: ResultadoVizinho[];
}

export interface OpcoesExecucao {
  repo: string;
  artefato: Artefato;
  blocos: Bloco[];
  aoVivo: boolean;
  modo: Modo;
  registro: Registro;
  pasta: string;
  timeoutPassoMs?: number;
  /** Para testes: troca o executor do fluxo. */
  executorFluxo?: (e: EntradaFluxo, aoEvento: (ev: Record<string, unknown>) => void) => Promise<number>;
}

/** Roda os blocos em ordem. Cada bloco sobe o app da branch uma vez e testa seus cards em ondas. */
export async function executar(o: OpcoesExecucao): Promise<ResultadoCard[]> {
  const { sistema } = o.artefato;
  const total = o.blocos.reduce((n, b) => n + b.ondas.flat().length, 0);
  const aoVivo = o.aoVivo && total === 1; // com mais de um card, nunca ao vivo
  o.registro.emitir('execucao_inicio', { blocos: o.blocos.map((b) => ({ branch: b.branch, ondas: b.ondas.map((on) => on.map((c) => c.card.id)) })), modo: o.modo, aoVivo, paralelo: sistema.paralelo });
  const resultados = new Map<string, ResultadoCard>();
  for (const [i, bloco] of o.blocos.entries()) await executarBloco(o, bloco, i + 1, aoVivo, resultados);
  const lista = [...resultados.values()];
  o.registro.emitir('execucao_fim', { resumo: lista.map((r) => ({ card: r.card, resultado: r.resultado })) });
  writeFileSync(join(o.pasta, 'resultado.json'), JSON.stringify(lista, null, 2));
  return lista;
}

async function executarBloco(o: OpcoesExecucao, bloco: Bloco, n: number, aoVivo: boolean, resultados: Map<string, ResultadoCard>): Promise<void> {
  const { sistema } = o.artefato;
  const cards = bloco.ondas.flat();
  o.registro.emitir('bloco_inicio', { bloco: n, branch: bloco.branch, cards: cards.map((c) => c.card.id) });
  const novo = (c: CardAvaliado): ResultadoCard => {
    const pasta = join(o.pasta, c.card.id);
    mkdirSync(pasta, { recursive: true });
    const r: ResultadoCard = { card: c.card.id, branch: bloco.branch, resultado: 'nao_rodou', tentativas: 0, bancoZerado: !!sistema.seed, avisos: [], pasta, vizinhos: [] };
    resultados.set(c.card.id, r);
    return r;
  };
  const todosNaoRodaram = (motivo: string) => {
    for (const c of cards) {
      o.registro.emitir('card_inicio', { card: c.card.id, branch: bloco.branch, bloco: n });
      fim(o, novo(c), motivo);
    }
  };

  const bloqueio = verificarAlvo(sistema.url.replace('{{porta}}', '1'), sistema);
  if (bloqueio) return todosNaoRodaram(bloqueio);

  let app: AppNoAr | null = null;
  try {
    if (sistema.iniciar) {
      try {
        app = await subirBranch(o, sistema, bloco.branch ?? 'HEAD', `bloco ${n}`);
      } catch (e) {
        return todosNaoRodaram((e as Error).message);
      }
    } else if (bloco.branch) {
      const atual = await branchAtual(o.repo);
      const semRemoto = bloco.branch.replace(/^[^/]+\//, '');
      if (atual !== bloco.branch && atual !== semRemoto) {
        return todosNaoRodaram(`O sistema em ${sistema.url} roda o seu checkout atual (${atual ?? 'sem branch'}), não ${bloco.branch}. Configure sistema.iniciar para o liveflow subir a branch certa, ou faça checkout de ${bloco.branch}.`);
      }
    }
    const url = app?.url ?? sistema.url;
    for (const onda of bloco.ondas) {
      const fila = [...onda];
      const largura = Math.min(sistema.paralelo, fila.length) || 1;
      const trabalhador = async () => {
        for (let c = fila.shift(); c; c = fila.shift()) {
          const r = novo(c);
          if (app) r.sha = app.sha;
          o.registro.emitir('card_inicio', { card: c.card.id, branch: bloco.branch, bloco: n });
          const pendente = c.card.depende_de.find((d) => resultados.get(d)?.resultado !== 'passou');
          if (pendente) {
            const rd = resultados.get(pendente);
            fim(o, r, `depende de ${pendente}, que ${rd ? ({ falhou: 'falhou', instavel: 'ficou instável', nao_rodou: 'não rodou', nao_se_aplica: 'não se aplica', passou: 'passou' } as const)[rd.resultado] : 'não rodou antes'}.`);
            continue;
          }
          await testarCardNoApp(o, c, r, url, app, aoVivo);
        }
      };
      await Promise.all(Array.from({ length: largura }, trabalhador));
    }
  } finally {
    await app?.parar();
  }
}

async function testarCardNoApp(o: OpcoesExecucao, alvo: CardAvaliado, r: ResultadoCard, url: string, app: AppNoAr | null, aoVivo: boolean): Promise<void> {
  const { card } = alvo;
  const { sistema } = o.artefato;
  try {
    const veredito = await comRepeticao(async (n) => {
      r.tentativas = n;
      o.registro.emitir('tentativa', { card: card.id, n });
      await zerarBanco(sistema, app?.dir ?? o.repo, `${card.id}-${n}`);
      const s = await rodarFluxo(o, card.id, card.como_testar, url, aoVivo && n === 1, join(r.pasta, `tentativa-${n}`), r);
      if (s.codigo === 2) throw new ErroAmbiente(s.erroAmbiente ?? 'ambiente');
      return s.codigo === 0;
    });
    r.resultado = veredito.resultado;
    if (veredito.resultado === 'falhou') r.certeza = 'confirmado';
    o.registro.emitir('camada_fim', { card: card.id, camada: 'fluxo', resultado: r.resultado, tentativas: veredito.tentativas });
    if (o.modo !== 'rapido' && card.perfil.vizinhos !== 'nao') r.vizinhos = await testarVizinhos(o, { card: alvo, branch: r.branch }, url, app, r.pasta);
    fim(o, r);
  } catch (e) {
    fim(o, r, e instanceof ErroAmbiente ? e.message : `Erro do liveflow: ${(e as Error).message}`);
  }
}

function fim(o: OpcoesExecucao, r: ResultadoCard, motivo?: string): ResultadoCard {
  if (motivo) {
    r.resultado = 'nao_rodou';
    r.motivo = motivo;
  }
  o.registro.emitir('card_fim', { card: r.card, resultado: r.resultado, certeza: r.certeza, motivo: r.motivo, tentativas: r.tentativas });
  return r;
}

class ErroAmbiente extends Error {}

async function rodarFluxo(o: OpcoesExecucao, cardId: string, passos: EntradaFluxo['passos'], url: string, aoVivo: boolean, pasta: string, r: ResultadoCard) {
  const entrada: EntradaFluxo = { card: cardId, passos, baseUrl: url, aoVivo, pastaSaida: pasta, projeto: o.repo, timeoutPassoMs: o.timeoutPassoMs ?? 10000, variaveis: o.artefato.variaveis };
  let erroAmbiente: string | undefined;
  const aoEvento = (ev: Record<string, unknown>) => {
    const { tipo, ...resto } = ev;
    if (tipo === 'ambiente') erroAmbiente = String(ev.erro);
    if (tipo === 'aviso' && !r.avisos.some((a) => a.mensagem === ev.mensagem)) r.avisos.push({ regra: String(ev.regra), mensagem: String(ev.mensagem) });
    if (tipo === 'passo_falhou') {
      const p = passos.find((x) => x.n === ev.n);
      r.falha = { passo: Number(ev.n), descricao: p ? `${descrever(p)}${p.etapa ? ` (etapa ${p.etapa})` : ''}` : 'tempo limite do fluxo', erro: String(ev.erro), motivo: String(ev.motivo) };
      if (typeof ev.print === 'string') r.falha.print = ev.print;
      if (typeof ev.url === 'string') r.falha.url = ev.url;
    }
    o.registro.emitir(tipo as never, { card: cardId, ...resto });
  };
  delete r.falha; // cada tentativa recomeça do zero
  const codigo = await (o.executorFluxo ?? executorPadrao)(entrada, aoEvento);
  return { codigo, erroAmbiente };
}

function caminhoRuntime(): string {
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  return fileURLToPath(new URL(`./runtime/fluxo${ext}`, import.meta.url));
}

/** Executa o runtime num processo separado, com tempo limite total. */
export function executorPadrao(e: EntradaFluxo, aoEvento: (ev: Record<string, unknown>) => void): Promise<number> {
  mkdirSync(e.pastaSaida, { recursive: true });
  const arq = join(e.pastaSaida, 'entrada.json');
  writeFileSync(arq, JSON.stringify(e));
  const limite = e.timeoutPassoMs * (e.passos.length + 3) + 30000;
  return new Promise((resolve) => {
    const filho = spawn(process.execPath, [caminhoRuntime(), arq], { stdio: ['ignore', 'pipe', 'pipe'] });
    const relogio = setTimeout(() => {
      aoEvento({ tipo: 'passo_falhou', n: 0, erro: `O fluxo passou do tempo limite (${Math.round(limite / 1000)} s).`, motivo: 'tempo' });
      filho.kill('SIGKILL');
    }, limite);
    let resto = '';
    filho.stdout.on('data', (b: Buffer) => {
      resto += b.toString();
      const linhas = resto.split('\n');
      resto = linhas.pop() ?? '';
      for (const l of linhas) if (l.startsWith('@@liveflow ')) aoEvento(JSON.parse(l.slice(11)));
    });
    let erro = '';
    filho.stderr.on('data', (b: Buffer) => (erro += b.toString()));
    filho.on('close', (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0 && codigo !== 1 && codigo !== 2) {
        aoEvento({ tipo: 'ambiente', erro: `O executor do navegador parou: ${erro.split('\n').find((x) => x.trim()) ?? `código ${codigo}`}` });
        resolve(2);
      } else resolve(codigo);
    });
  });
}

// ---------- App da branch ----------

interface AppNoAr {
  url: string;
  dir: string;
  sha: string;
  parar: () => Promise<void>;
}

async function subirBranch(o: OpcoesExecucao, sistema: Sistema, ref: string, cardId: string): Promise<AppNoAr> {
  const copia = await criarCopia(o.repo, ref);
  o.registro.emitir('copia_pronta', { card: cardId, ref, sha: copia.sha });
  try {
    if (sistema.preparar) await comando(sistema.preparar, copia.dir, {}, 15 * 60_000);
    const porta = await portaLivre();
    const url = sistema.url.replace('{{porta}}', String(porta));
    const proc = spawn(sistema.iniciar!.replaceAll('{{porta}}', String(porta)), { cwd: copia.dir, shell: true, detached: process.platform !== 'win32', stdio: 'ignore', env: { ...process.env, PORT: String(porta) } });
    const parar = async () => {
      try {
        if (proc.pid && process.platform !== 'win32') process.kill(-proc.pid, 'SIGTERM');
        else proc.kill();
      } catch { /* já parou */ }
      await copia.remover();
    };
    try {
      await esperarSaude(new URL(sistema.saude, url).href, 120_000);
    } catch (e) {
      await parar();
      throw new ErroAmbiente(`O app da branch ${ref} não respondeu em ${sistema.saude} em 2 minutos (comando: ${sistema.iniciar}).`);
    }
    o.registro.emitir('app_no_ar', { card: cardId, url, sha: copia.sha });
    return { url, dir: copia.dir, sha: copia.sha, parar };
  } catch (e) {
    await copia.remover();
    throw e instanceof ErroAmbiente ? e : new ErroAmbiente(`Não consegui preparar a branch ${ref}: ${(e as Error).message}`);
  }
}

async function zerarBanco(sistema: Sistema, dir: string, execucao: string): Promise<void> {
  if (!sistema.seed) return;
  try {
    await comando(sistema.seed.replaceAll('{{execucao}}', execucao), dir, { LIVEFLOW_EXECUCAO: execucao }, 5 * 60_000);
  } catch (e) {
    throw new ErroAmbiente(`O seed falhou, então não dá para garantir o banco zerado: ${(e as Error).message}`);
  }
}

/** Comandos escritos pelo próprio time no artefato (preparar, iniciar, seed). */
function comando(cmd: string, cwd: string, env: Record<string, string>, limite: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, { cwd, shell: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...env } });
    let erro = '';
    p.stderr.on('data', (b: Buffer) => (erro += b.toString()));
    const t = setTimeout(() => p.kill('SIGKILL'), limite);
    p.on('close', (c) => {
      clearTimeout(t);
      c === 0 ? resolve() : reject(new Error(`"${cmd}" saiu com código ${c}${erro ? `: ${erro.trim().split('\n').slice(-1)[0]}` : ''}`));
    });
  });
}

export function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (a && typeof a === 'object' ? resolve(a.port) : reject(new Error('sem porta'))));
    });
  });
}

export async function esperarSaude(url: string, limite: number): Promise<void> {
  const fim = Date.now() + limite;
  while (Date.now() < fim) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch { /* ainda subindo */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error('sem resposta');
}

// ---------- Vizinhos ----------

/** Cards prontos, diferentes deste, cujos arquivos foram mexidos pela branch. */
export function acharVizinhos(cardId: string, arquivosDaBranch: string[], todos: CardAvaliado[]): CardAvaliado[] {
  return todos.filter((c) => c.card.id !== cardId && c.estado === 'pronto' && c.card.arquivos?.some((g) => arquivosDaBranch.some((a) => globParaRegex(g).test(a))));
}

async function testarVizinhos(o: OpcoesExecucao, alvo: AlvoCard, url: string, app: AppNoAr | null, pasta: string): Promise<ResultadoVizinho[]> {
  const { sistema } = o.artefato;
  const ref = alvo.branch ?? 'HEAD';
  const arquivos = (await arquivosMudados(o.repo, sistema.base, ref)).map((a) => a.caminho);
  const vizinhos = acharVizinhos(alvo.card.card.id, arquivos, o.artefato.cards);
  const saida: ResultadoVizinho[] = [];
  for (const v of vizinhos) {
    const rv: ResultadoCard = { card: v.card.id, branch: ref, resultado: 'nao_rodou', tentativas: 0, bancoZerado: !!sistema.seed, avisos: [], pasta, vizinhos: [] };
    const naBranch = await comRepeticao(async (n) => {
      await zerarBanco(sistema, app?.dir ?? o.repo, `${v.card.id}-viz-${n}`);
      return (await rodarFluxo(o, v.card.id, v.card.como_testar, url, false, join(pasta, `vizinho-${v.card.id}-${n}`), rv)).codigo === 0;
    });
    if (naBranch.resultado !== 'falhou') {
      saida.push({ card: v.card.id, resultado: 'ok' });
      continue;
    }
    if (!sistema.iniciar) {
      saida.push({ card: v.card.id, resultado: 'nao_rodou', motivo: 'falhou nesta branch; para saber se já falhava na base, configure sistema.iniciar', ...(rv.falha ? { falha: rv.falha } : {}) });
      continue;
    }
    const base = await subirBranch(o, sistema, sistema.base, v.card.id);
    try {
      await zerarBanco(sistema, base.dir, `${v.card.id}-base`);
      const rb: ResultadoCard = { ...rv, falha: undefined } as ResultadoCard;
      const passouBase = (await rodarFluxo(o, v.card.id, v.card.como_testar, base.url, false, join(pasta, `vizinho-${v.card.id}-base`), rb)).codigo === 0;
      const resultado = classificarRegressao(false, passouBase);
      saida.push({ card: v.card.id, resultado, ...(rv.falha ? { falha: rv.falha } : {}) });
    } finally {
      await base.parar();
    }
  }
  o.registro.emitir('camada_fim', { card: alvo.card.card.id, camada: 'vizinhos', vizinhos: saida });
  return saida;
}
