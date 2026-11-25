// Orquestra a execução: cópia da branch → app no ar → banco zerado → fluxo → repetição → vizinhos.
// Princípio: só dizer "passou" ou "falhou" quando tivermos certeza de QUAL código foi testado.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchAtual, criarCopia, git, shaDe } from './git.ts';
import { arquivosDaBranch, branchesAtuais, lerRaiz, reposComBranch, SEM_GIT, type Raiz } from './repositorios.ts';
import { globParaRegex } from './fontes.ts';
import type { AlvoCard } from './fontes.ts';
import type { Bloco } from './blocos.ts';
import { comRepeticao } from './repeticao.ts';
import { classificarRegressao } from './comparacao.ts';
import { verificarAlvo } from './seguranca.ts';
import { descrever } from './descricao.ts';
import type { Registro } from './eventos.ts';
import type { EntradaFluxo } from './runtime/fluxo.ts';
import type { Artefato, CardAvaliado, Certeza, Resultado, Servico, Sistema } from './tipos.ts';
import type { Modo } from './plano.ts';

export interface FalhaPasso {
  passo: number;
  descricao: string;
  erro: string;
  motivo: string;
  print?: string;
  url?: string;
  /** Elementos parecidos que existem na tela (quando o alvo não foi encontrado). */
  sugestoes?: string[];
}

/** Qual código cada serviço usou. Fica no resultado para ninguém ter dúvida do que foi testado. */
export interface CodigoUsado {
  servico: string;
  repo: string;
  ref: string;
  sha: string;
  observacao?: string;
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
  /** Conferências que só uma pessoa pode fazer (conferir_manual). */
  pendencias: string[];
  codigo?: CodigoUsado[];
  motivo?: string;
  pasta: string;
  vizinhos: ResultadoVizinho[];
}

/** O que precisa ser desligado se a execução for interrompida (Parar, Ctrl+C). */
const limpezas = new Set<() => Promise<void>>();

/** Desliga apps, navegadores e cópias em andamento. Chamado pela CLI ao receber SIGINT/SIGTERM. */
export async function pararTudo(): Promise<void> {
  const lista = [...limpezas];
  limpezas.clear();
  await Promise.allSettled(lista.map((f) => f()));
}

/** Mata um processo e os filhos dele (o app sobe em grupo próprio). */
export function matarArvore(p: ReturnType<typeof spawn>, sinal: NodeJS.Signals = 'SIGTERM'): void {
  if (!p.pid || p.exitCode !== null) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-p.pid, sinal);
  } catch {
    try { p.kill(sinal); } catch { /* já parou */ }
  }
}

export interface OpcoesExecucao {
  /** Pasta raiz (onde fica .liveflow/). Pode ser o repositório ou uma pasta que junta repositórios. */
  repo: string;
  /** Preenchido pelo executar: onde estão os repositórios. */
  raiz?: Raiz;
  /** O artefato ainda é o exemplo do "liveflow iniciar": nada roda. */
  ehExemplo?: boolean;
  artefato: Artefato;
  blocos: Bloco[];
  aoVivo: boolean;
  /** Cards que a pessoa escolheu ver ao vivo. Rodam um por vez; dependências incluídas sozinhas rodam escondidas antes deles. */
  aoVivoCards?: string[];
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
  // Ao vivo: os cards escolhidos rodam um por vez, cada um mostrando a tela. Sem a escolha, todos são ao vivo.
  const vivo = o.aoVivo ? new Set(o.aoVivoCards?.length ? o.aoVivoCards : o.blocos.flatMap((b) => b.ondas.flat().map((c) => c.card.id))) : undefined;
  const aoVivo = !!vivo?.size;
  void total;
  o.registro.emitir('execucao_inicio', { blocos: o.blocos.map((b) => ({ branch: b.branch, ondas: b.ondas.map((on) => on.map((c) => c.card.id)) })), modo: o.modo, aoVivo, paralelo: aoVivo ? 1 : sistema.paralelo });
  const resultados = new Map<string, ResultadoCard>();
  // sem git não dá para saber qual código foi testado: nenhum card roda, e o motivo diz o que fazer
  o.raiz = await lerRaiz(o.repo);
  const impedimento = o.ehExemplo
    ? 'O artefato .liveflow/cards.yaml ainda é o exemplo do "liveflow iniciar": o sistema (npm run dev) e os cards (feat/login, feat/aceite...) são de mentira. Abra a aba "Criar artefato", cole os seus cards e passe o texto para o Claude: ele escreve o sistema do seu projeto e o passo a passo de cada card.'
    : !o.raiz.repos.length ? SEM_GIT(o.repo) : '';
  if (impedimento) {
    for (const [i, bloco] of o.blocos.entries()) {
      for (const c of bloco.ondas.flat()) {
        const pasta = join(o.pasta, c.card.id);
        mkdirSync(pasta, { recursive: true });
        const r: ResultadoCard = { card: c.card.id, branch: bloco.branch, resultado: 'nao_rodou', tentativas: 0, bancoZerado: !!sistema.seed, avisos: [], pendencias: [], pasta, vizinhos: [] };
        resultados.set(c.card.id, r);
        o.registro.emitir('card_inicio', { card: c.card.id, branch: bloco.branch, bloco: i + 1 });
        fim(o, r, impedimento);
      }
    }
  } else {
    // cópias de execuções interrompidas (Ctrl+C, máquina desligada) somem do registro do git
    for (const rep of o.raiz.repos) await git(resolve(o.repo, rep), ['worktree', 'prune']).catch(() => undefined);
    for (const [i, bloco] of o.blocos.entries()) await executarBloco(o, bloco, i + 1, vivo, resultados);
  }
  const lista = [...resultados.values()];
  o.registro.emitir('execucao_fim', { resumo: lista.map((r) => ({ card: r.card, resultado: r.resultado })) });
  writeFileSync(join(o.pasta, 'resultado.json'), JSON.stringify(lista, null, 2));
  return lista;
}

async function executarBloco(o: OpcoesExecucao, bloco: Bloco, n: number, vivo: Set<string> | undefined, resultados: Map<string, ResultadoCard>): Promise<void> {
  const { sistema } = o.artefato;
  const cards = bloco.ondas.flat();
  o.registro.emitir('bloco_inicio', { bloco: n, branch: bloco.branch, cards: cards.map((c) => c.card.id) });
  const novo = (c: CardAvaliado): ResultadoCard => {
    const pasta = join(o.pasta, c.card.id);
    mkdirSync(pasta, { recursive: true });
    const r: ResultadoCard = { card: c.card.id, branch: bloco.branch, resultado: 'nao_rodou', tentativas: 0, bancoZerado: !!sistema.seed, avisos: [], pendencias: [], pasta, vizinhos: [] };
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
    if (sistema.servicos.length) {
      try {
        app = await subirServicos(o, sistema, bloco.branch ?? 'HEAD', `bloco ${n}`);
      } catch (e) {
        return todosNaoRodaram((e as Error).message);
      }
    } else if (bloco.branch) {
      const atuais = o.raiz?.raizEhRepo === false ? await branchesAtuais(o.repo) : [await branchAtual(o.repo)].filter((b): b is string => !!b);
      const semRemoto = bloco.branch.replace(/^[^/]+\//, '');
      const atual = atuais.join(', ') || undefined;
      if (!atuais.some((a) => a === bloco.branch || a === semRemoto)) {
        return todosNaoRodaram(`O sistema em ${sistema.url} roda o seu checkout atual (${atual ?? 'sem branch'}), não ${bloco.branch}. Configure sistema.iniciar para o liveflow subir a branch certa, ou faça checkout de ${bloco.branch}.`);
      }
    }
    const url = app?.url ?? sistema.url;
    for (const onda of bloco.ondas) {
      const fila = [...onda];
      const largura = vivo ? 1 : Math.min(sistema.paralelo, fila.length) || 1;
      const trabalhador = async () => {
        for (let c = fila.shift(); c; c = fila.shift()) {
          const r = novo(c);
          if (app) {
            r.sha = app.sha;
            r.codigo = app.codigo;
          }
          o.registro.emitir('card_inicio', { card: c.card.id, branch: bloco.branch, bloco: n });
          const pendente = c.card.depende_de.find((d) => resultados.get(d)?.resultado !== 'passou');
          if (pendente) {
            const rd = resultados.get(pendente);
            fim(o, r, `depende de ${pendente}, que ${rd ? ({ falhou: 'falhou', instavel: 'ficou instável', nao_rodou: 'não rodou', nao_se_aplica: 'não se aplica', passou: 'passou' } as const)[rd.resultado] : 'não rodou antes'}.`);
            continue;
          }
          await testarCardNoApp(o, c, r, url, app, !!vivo?.has(c.card.id));
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
      await zerarBanco(sistema, app?.dir ?? o.repo, `${card.id}-${n}`, url);
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
  const card = o.artefato.cards.find((c) => c.card.id === cardId)?.card;
  const entrada: EntradaFluxo = {
    card: cardId, passos, baseUrl: url, aoVivo, pastaSaida: pasta, projeto: o.repo, timeoutPassoMs: o.timeoutPassoMs ?? 10000,
    variaveis: o.artefato.variaveis, contas: o.artefato.contas, pastaSessoes: join(o.pasta, '.sessoes', r.branch ?? 'checkout'),
    dispositivo: card?.dispositivo ?? 'desktop',
    ...(o.artefato.sistema.email ? { mailpit: o.artefato.sistema.email.mailpit.replace('{{url}}', url.replace(/\/$/, '')) } : {}),
  };
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
      if (Array.isArray(ev.sugestoes) && ev.sugestoes.length) r.falha.sugestoes = ev.sugestoes.map(String);
    }
    if (tipo === 'manual_pendente' && !r.pendencias.includes(String(ev.texto))) r.pendencias.push(String(ev.texto));
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
    // SIGTERM deixa o Playwright fechar o navegador antes de sair
    const desligar = async () => void filho.kill('SIGTERM');
    limpezas.add(desligar);
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
      limpezas.delete(desligar);
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
  /** Pasta da cópia do primeiro serviço (onde o seed roda). */
  dir: string;
  sha: string;
  codigo: CodigoUsado[];
  parar: () => Promise<void>;
}

/** Em outro repositório: a branch de mesmo nome, se existir; senão a base dele (e fica anotado). */
export async function refNoOutroRepo(repoDir: string, ref: string, base: string): Promise<{ ref: string; observacao?: string }> {
  if (ref === 'HEAD') return { ref: 'HEAD' };
  const nome = ref.replace(/^origin\//, '');
  for (const candidato of [nome, `origin/${nome}`]) {
    if (await shaDe(repoDir, candidato).then(() => true, () => false)) return { ref: candidato };
  }
  return { ref: base, observacao: `não existe ${nome} neste repositório; usei ${base}` };
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb'];

/** Reaproveita node_modules do seu checkout quando o lockfile é idêntico; senão roda o "preparar". */
export async function prepararCopia(repoDir: string, copiaDir: string, preparar: string | undefined, reaproveitar: boolean): Promise<'reaproveitadas' | 'preparado' | 'nada'> {
  const lock = LOCKFILES.find((l) => existsSync(join(copiaDir, l)));
  if (reaproveitar && lock && existsSync(join(repoDir, lock)) && existsSync(join(repoDir, 'node_modules')) && !existsSync(join(copiaDir, 'node_modules'))) {
    if (readFileSync(join(repoDir, lock)).equals(readFileSync(join(copiaDir, lock)))) {
      symlinkSync(join(repoDir, 'node_modules'), join(copiaDir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      return 'reaproveitadas';
    }
  }
  if (!preparar) return 'nada';
  await comando(preparar, copiaDir, {}, 15 * 60_000);
  return 'preparado';
}

export function trocarPortas(texto: string, eu: string | null, portas: Map<string, number>): string {
  return texto
    .replace(/\{\{porta\.([a-z][a-z0-9_]*)\}\}/g, (_, n: string) => String(portas.get(n) ?? `{{porta.${n}}}`))
    .replace(/\{\{url\.([a-z][a-z0-9_]*)\}\}/g, (_, n: string) => (portas.has(n) ? `http://127.0.0.1:${portas.get(n)}` : `{{url.${n}}}`))
    .replaceAll('{{porta}}', String(eu ? portas.get(eu) : [...portas.values()][0]));
}

/** usarPasta: sobe direto na pasta da pessoa, sem cópia (só a gravação usa, quando não há git). */
async function subirServicos(o: OpcoesExecucao, sistema: Sistema, ref: string, rotulo: string, usarPasta = false): Promise<AppNoAr> {
  const copias: { remover: () => Promise<void> }[] = [];
  const procs: ReturnType<typeof spawn>[] = [];
  let parado = false;
  const parar = async () => {
    if (parado) return;
    parado = true;
    limpezas.delete(parar);
    for (const p of [...procs].reverse()) matarArvore(p);
    for (const c of copias) await c.remover();
  };
  limpezas.add(parar);
  try {
    const portas = new Map<string, number>();
    for (const sv of sistema.servicos) portas.set(sv.nome, await portaLivre());
    const preparados: { sv: Servico; dir: string }[] = [];
    const codigo: CodigoUsado[] = [];
    const raiz = o.raiz ?? (await lerRaiz(o.repo));
    // raiz que só junta repositórios: cada serviço roda no repositório dele
    const pastaDeRepos = !raiz.raizEhRepo && !usarPasta;
    const comBranch = pastaDeRepos && ref !== 'HEAD' ? await reposComBranch(o.repo, raiz, ref) : [];
    for (const sv of sistema.servicos) {
      let repoRel = sv.repo;
      if (pastaDeRepos && !repoRel) {
        if (raiz.repos.length === 1) repoRel = raiz.repos[0]!;
        else if (comBranch.length === 1) repoRel = comBranch[0]!;
        else throw new ErroAmbiente(`O serviço ${sv.nome} não diz em qual repositório roda. A pasta ${o.repo} junta ${raiz.repos.length} repositórios (${raiz.repos.join(', ')})${comBranch.length > 1 ? ` e ${ref} existe em ${comBranch.join(', ')}` : ''}. Coloque "repo: <pasta>" no serviço em sistema.servicos.`);
      }
      const repoDir = repoRel ? resolve(o.repo, repoRel) : o.repo;
      if (usarPasta) {
        codigo.push({ servico: sv.nome, repo: sv.repo ?? '.', ref: 'pasta atual', sha: 'sem-git', observacao: 'sem git: usei o código da pasta como está' });
        preparados.push({ sv, dir: repoDir });
        continue;
      }
      const alvo = repoRel ? await refNoOutroRepo(repoDir, ref, sv.base ?? sistema.base) : { ref };
      const copia = await criarCopia(repoDir, alvo.ref);
      copias.push(copia);
      codigo.push({ servico: sv.nome, repo: repoRel ?? '.', ref: alvo.ref, sha: copia.sha, ...(alvo.observacao ? { observacao: alvo.observacao } : {}) });
      const dep = await prepararCopia(repoDir, copia.dir, sv.preparar ?? (sv.repo ? undefined : sistema.preparar), sistema.reaproveitarDependencias);
      o.registro.emitir('copia_pronta', { bloco: rotulo, servico: sv.nome, ref: alvo.ref, sha: copia.sha, dependencias: dep, ...(alvo.observacao ? { observacao: alvo.observacao } : {}) });
      preparados.push({ sv, dir: copia.dir });
    }
    // pasta de repositórios: se nenhum serviço achou a branch do card, o teste seria só da base. Não roda.
    if (pastaDeRepos && ref !== 'HEAD' && ref !== sistema.base && codigo.every((c) => c.observacao)) {
      throw new ErroAmbiente(`A branch ${ref} não existe em nenhum dos repositórios usados (${[...new Set(codigo.map((c) => c.repo))].join(', ')}). Sem ela, o teste seria só do código da base. Confira o "branch:" do card ou faça git fetch nesses repositórios.`);
    }
    const env: Record<string, string> = {};
    for (const [n, p] of portas) {
      env[`LIVEFLOW_PORTA_${n.toUpperCase()}`] = String(p);
      env[`LIVEFLOW_URL_${n.toUpperCase()}`] = `http://127.0.0.1:${p}`;
    }
    for (const { sv, dir } of preparados) {
      const porta = portas.get(sv.nome)!;
      const proc = spawn(trocarPortas(sv.iniciar, sv.nome, portas), { cwd: dir, shell: true, detached: process.platform !== 'win32', stdio: 'ignore', env: { ...process.env, ...env, PORT: String(porta) } });
      procs.push(proc);
      try {
        await esperarSaude(`http://127.0.0.1:${porta}${sv.saude.startsWith('/') ? sv.saude : `/${sv.saude}`}`, 120_000);
      } catch {
        throw new ErroAmbiente(`O serviço ${sv.nome} (${ref}) não respondeu em ${sv.saude} em 2 minutos (comando: ${sv.iniciar}).`);
      }
    }
    const url = trocarPortas(sistema.url, null, portas);
    o.registro.emitir('app_no_ar', { bloco: rotulo, url, sha: codigo[0]!.sha, codigo });
    return { url, dir: preparados[0]!.dir, sha: codigo[0]!.sha, codigo, parar };
  } catch (e) {
    await parar();
    throw e instanceof ErroAmbiente ? e : new ErroAmbiente(`Não consegui preparar ${ref}: ${(e as Error).message}`);
  }
}

async function zerarBanco(sistema: Sistema, dir: string, execucao: string, url?: string): Promise<void> {
  if (!sistema.seed) return;
  try {
    await comando(sistema.seed.replaceAll('{{execucao}}', execucao), dir, { LIVEFLOW_EXECUCAO: execucao, ...(url ? { LIVEFLOW_URL: url } : {}) }, 5 * 60_000);
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
  const arquivos = await arquivosDaBranch(o.repo, sistema.base, ref);
  const vizinhos = acharVizinhos(alvo.card.card.id, arquivos, o.artefato.cards);
  const saida: ResultadoVizinho[] = [];
  for (const v of vizinhos) {
    const rv: ResultadoCard = { card: v.card.id, branch: ref, resultado: 'nao_rodou', tentativas: 0, bancoZerado: !!sistema.seed, avisos: [], pendencias: [], pasta, vizinhos: [] };
    const naBranch = await comRepeticao(async (n) => {
      await zerarBanco(sistema, app?.dir ?? o.repo, `${v.card.id}-viz-${n}`, url);
      return (await rodarFluxo(o, v.card.id, v.card.como_testar, url, false, join(pasta, `vizinho-${v.card.id}-${n}`), rv)).codigo === 0;
    });
    if (naBranch.resultado !== 'falhou') {
      saida.push({ card: v.card.id, resultado: 'ok' });
      continue;
    }
    if (!sistema.servicos.length) {
      saida.push({ card: v.card.id, resultado: 'nao_rodou', motivo: 'falhou nesta branch; para saber se já falhava na base, configure sistema.iniciar', ...(rv.falha ? { falha: rv.falha } : {}) });
      continue;
    }
    const base = await subirServicos(o, sistema, sistema.base, v.card.id);
    try {
      await zerarBanco(sistema, base.dir, `${v.card.id}-base`, base.url);
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

/** Sobe o sistema de uma branch para uso fora de um teste (ex.: gravar o passo a passo). */
export async function subirParaUso(repo: string, artefato: Artefato, ref: string, registro: Registro): Promise<{ url: string; parar: () => Promise<void>; aviso?: string }> {
  if (!artefato.sistema.servicos.length) return { url: artefato.sistema.url, parar: async () => undefined };
  const o = { repo, artefato, blocos: [], aoVivo: false, modo: 'rapido', registro, pasta: '' } as OpcoesExecucao;
  // gravar não afirma resultado: sem git, sobe o app direto na pasta (e avisa)
  o.raiz = await lerRaiz(repo);
  const semGit = !o.raiz.repos.length;
  const app = await subirServicos(o, artefato.sistema, ref, 'gravação', semGit);
  await zerarBanco(artefato.sistema, app.dir, 'gravacao', app.url);
  return { url: app.url, parar: app.parar, ...(semGit ? { aviso: 'Não achei repositório git nesta pasta nem nas subpastas: o app subiu com o código da pasta como está, não com a branch do card.' } : {}) };
}
