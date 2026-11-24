// Processo filho que executa o passo a passo de UM card num navegador.
// Roda isolado: se travar, o liveflow mata pelo tempo limite sem derrubar o resto.
// Saída: uma linha "@@liveflow {json}" por evento no stdout.
// Código de saída: 0 passou · 1 falhou · 2 ambiente (Playwright ou navegador ausente).
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { globParaRegex } from '../fontes.ts';
import { descrever } from '../descricao.ts';
import type { PassoCard } from '../tipos.ts';

export interface EntradaFluxo {
  card: string;
  passos: PassoCard[];
  baseUrl: string;
  aoVivo: boolean;
  pastaSaida: string;
  /** Pasta do projeto, de onde o Playwright é carregado. */
  projeto: string;
  timeoutPassoMs: number;
  variaveis: Record<string, string>;
}

// Tipos mínimos do Playwright que usamos (o pacote é do projeto testado, não do liveflow).
export interface Loc {
  count(): Promise<number>;
  click(o?: object): Promise<void>;
  fill(v: string): Promise<void>;
  check(): Promise<void>;
  selectOption(v: { label: string }): Promise<unknown>;
  waitFor(o: { state: 'visible' | 'hidden'; timeout?: number }): Promise<void>;
  first(): Loc;
}
export interface Pagina {
  getByRole(role: string, o: { name: string; exact: boolean }): Loc;
  getByLabel(t: string, o: { exact: boolean }): Loc;
  getByPlaceholder(t: string, o: { exact: boolean }): Loc;
  getByText(t: string, o?: { exact: boolean }): Loc;
}

export class ErroPasso extends Error {
  tipo: 'nao_encontrado' | 'ambiguo' | 'texto' | 'url' | 'api' | 'tempo';
  constructor(tipo: ErroPasso['tipo'], msg: string) {
    super(msg);
    this.tipo = tipo;
  }
}

const PAPEIS_CLICAVEIS = ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 'option'];

/**
 * Acha o elemento pelo texto que a pessoa vê, na ordem: papel acessível, rótulo, texto exato.
 * Se mais de um elemento bate, falha em vez de chutar: um teste certeiro não clica no botão errado.
 */
export async function localizarClicavel(p: Pagina, texto: string): Promise<Loc> {
  const tentativas: [string, Loc][] = [
    ...PAPEIS_CLICAVEIS.map((r) => [`papel ${r}`, p.getByRole(r, { name: texto, exact: true })] as [string, Loc]),
    ['rótulo', p.getByLabel(texto, { exact: true })],
    ['texto exato', p.getByText(texto, { exact: true })],
  ];
  return primeiroUnico(tentativas, texto);
}

export async function localizarCampo(p: Pagina, rotulo: string): Promise<Loc> {
  return primeiroUnico(
    [
      ['rótulo', p.getByLabel(rotulo, { exact: true })],
      ['placeholder', p.getByPlaceholder(rotulo, { exact: true })],
      ['caixa de texto', p.getByRole('textbox', { name: rotulo, exact: true })],
      ['lista', p.getByRole('combobox', { name: rotulo, exact: true })],
    ],
    rotulo,
  );
}

async function primeiroUnico(tentativas: [string, Loc][], texto: string): Promise<Loc> {
  for (const [como, loc] of tentativas) {
    const n = await loc.count();
    if (n === 1) return loc;
    if (n > 1) throw new ErroPasso('ambiguo', `"${texto}" bate com ${n} elementos (${como}). Use um texto mais específico no passo.`);
  }
  throw new ErroPasso('nao_encontrado', `Não encontrei "${texto}" na tela (procurei por papel, rótulo e texto exato).`);
}

/** O objeto obtido contém tudo o que o esperado pede (comparação parcial e profunda). */
export function contem(esperado: unknown, obtido: unknown, caminho = ''): string | null {
  if (esperado === null || typeof esperado !== 'object') {
    return Object.is(esperado, obtido) ? null : `${caminho || 'valor'}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`;
  }
  if (Array.isArray(esperado)) {
    if (!Array.isArray(obtido)) return `${caminho}: esperado lista`;
    for (let i = 0; i < esperado.length; i++) {
      const e = contem(esperado[i], obtido[i], `${caminho}[${i}]`);
      if (e) return e;
    }
    return null;
  }
  if (!obtido || typeof obtido !== 'object') return `${caminho || 'resposta'}: esperado objeto`;
  for (const [k, v] of Object.entries(esperado)) {
    const e = contem(v, (obtido as Record<string, unknown>)[k], caminho ? `${caminho}.${k}` : k);
    if (e) return e;
  }
  return null;
}

/** Troca {{nome}} pelas variáveis do artefato e {{segredo:nome}} por LIVEFLOW_SEGREDO_NOME do ambiente. */
export function preencherTexto(t: string, variaveis: Record<string, string>, env: NodeJS.ProcessEnv = process.env): string {
  return t.replace(/\{\{\s*(segredo:)?([a-zA-Z0-9_]+)\s*\}\}/g, (_, seg: string | undefined, nome: string) => {
    if (seg) {
      const v = env[`LIVEFLOW_SEGREDO_${nome.toUpperCase()}`];
      if (v === undefined) throw new ErroPasso('nao_encontrado', `Segredo "${nome}" não configurado (LIVEFLOW_SEGREDO_${nome.toUpperCase()}).`);
      return v;
    }
    const v = variaveis[nome];
    if (v === undefined) throw new ErroPasso('nao_encontrado', `Variável "${nome}" não existe em "variaveis" do artefato.`);
    return v;
  });
}

function emitir(ev: Record<string, unknown>): void {
  process.stdout.write(`@@liveflow ${JSON.stringify({ ts: new Date().toISOString(), ...ev })}\n`);
}

async function principal(): Promise<void> {
  const entrada = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as EntradaFluxo;
  mkdirSync(entrada.pastaSaida, { recursive: true });
  const req = createRequire(join(entrada.projeto, 'package.json'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any;
  for (const nome of ['playwright', '@playwright/test']) {
    try { pw = req(nome); break; } catch { /* tenta o próximo */ }
  }
  if (!pw) {
    emitir({ tipo: 'ambiente', erro: 'Playwright não está instalado no projeto. Rode: npm i -D playwright && npx playwright install chromium' });
    process.exit(2);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  const opcoes = { headless: !entrada.aoVivo, slowMo: entrada.aoVivo ? 300 : 0 };
  try {
    browser = await pw.chromium.launch(opcoes);
  } catch (e) {
    // Sem o Chromium do Playwright, usa o Google Chrome instalado na máquina.
    try {
      browser = await pw.chromium.launch({ ...opcoes, channel: 'chrome' });
      emitir({ tipo: 'aviso', regra: 'navegador', mensagem: 'Usando o Google Chrome instalado (o Chromium do Playwright não está instalado).' });
    } catch {
      emitir({ tipo: 'ambiente', erro: `Não consegui abrir o navegador: ${String((e as Error).message).split('\n')[0]}. Rode: npx playwright install chromium` });
      process.exit(2);
    }
  }
  const context = await browser.newContext({ baseURL: entrada.baseUrl, viewport: { width: 1280, height: 800 }, recordVideo: { dir: join(entrada.pastaSaida, 'video') } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  page.setDefaultTimeout(entrada.timeoutPassoMs);
  page.on('response', (r: { status(): number; url(): string; request(): { method(): string } }) => {
    if (r.status() >= 500) emitir({ tipo: 'aviso', regra: 'erro_500', mensagem: `${r.request().method()} ${new URL(r.url()).pathname} respondeu ${r.status()}` });
  });
  page.on('pageerror', (e: Error) => emitir({ tipo: 'aviso', regra: 'erro_js', mensagem: String(e.message).split('\n')[0] }));

  const t = (s: string) => preencherTexto(s, entrada.variaveis);
  let falhou = false;
  for (const p of entrada.passos) {
    const inicio = Date.now();
    emitir({ tipo: 'passo_inicio', n: p.n, descricao: descrever(p), criterio: p.criterio });
    try {
      switch (p.acao) {
        case 'abrir': await page.goto(t(p.caminho)); break;
        case 'clicar': await (await localizarClicavel(page, t(p.alvo))).click(); break;
        case 'preencher': await (await localizarCampo(page, t(p.campo))).fill(t(p.valor)); break;
        case 'selecionar': await (await localizarCampo(page, t(p.campo))).selectOption({ label: t(p.opcao) }); break;
        case 'marcar': await (await localizarClicavel(page, t(p.campo))).check(); break;
        case 'ver_texto':
          await page.getByText(t(p.texto)).first().waitFor({ state: 'visible' }).catch(() => {
            throw new ErroPasso('texto', `O texto "${t(p.texto)}" não apareceu em ${entrada.timeoutPassoMs / 1000} s.`);
          });
          break;
        case 'nao_ver_texto':
          await page.getByText(t(p.texto)).first().waitFor({ state: 'hidden' }).catch(() => {
            throw new ErroPasso('texto', `O texto "${t(p.texto)}" continua na tela.`);
          });
          break;
        case 'ver_url': {
          const re = globParaRegex(t(p.padrao));
          await page.waitForURL((u: URL) => re.test(u.pathname + u.search) || re.test(u.pathname)).catch(() => {
            throw new ErroPasso('url', `Esperava estar em ${p.padrao}, mas a página está em ${new URL(page.url()).pathname}.`);
          });
          break;
        }
        case 'api': {
          const corpo = p.corpo === undefined ? undefined : JSON.parse(t(JSON.stringify(p.corpo)));
          const r = await context.request.fetch(t(p.rota), { method: p.metodo, data: corpo });
          if (r.status() !== p.status) throw new ErroPasso('api', `${p.metodo} ${p.rota}: esperado ${p.status}, veio ${r.status()}.`);
          if (p.contem) {
            const json = await r.json().catch(() => undefined);
            const dif = contem(JSON.parse(t(JSON.stringify(p.contem))), json);
            if (dif) throw new ErroPasso('api', `${p.metodo} ${p.rota}: ${dif}.`);
          }
          break;
        }
        case 'esperar_ms': await page.waitForTimeout(p.ms); break;
      }
      emitir({ tipo: 'passo_ok', n: p.n, ms: Date.now() - inicio });
    } catch (e) {
      const erro = e instanceof ErroPasso ? e : new ErroPasso('tempo', String((e as Error).message).split('\n')[0] ?? 'erro');
      const print = join(entrada.pastaSaida, `falha-passo-${p.n}.png`);
      await page.screenshot({ path: print, fullPage: true }).catch(() => undefined);
      emitir({ tipo: 'passo_falhou', n: p.n, erro: erro.message, motivo: erro.tipo, print, url: page.url() });
      falhou = true;
      break;
    }
  }
  await context.tracing.stop({ path: join(entrada.pastaSaida, 'trace.zip') }).catch(() => undefined);
  await context.close();
  await browser.close();
  process.exit(falhou ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) {
  await principal();
}
