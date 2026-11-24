// Processo filho que executa o passo a passo de UM card num navegador.
// Roda isolado: se travar, o liveflow mata pelo tempo limite sem derrubar o resto.
// Saída: uma linha "@@liveflow {json}" por evento no stdout.
// Código de saída: 0 passou · 1 falhou · 2 ambiente (Playwright ou navegador ausente).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { globParaRegex } from '../fontes.ts';
import { descrever } from '../descricao.ts';
import { buscarEmail } from '../email.ts';
import { sugerirParecidos } from '../sugestoes.ts';
import type { Conta, PassoCard } from '../tipos.ts';

export interface EntradaFluxo {
  card: string;
  passos: PassoCard[];
  baseUrl: string;
  aoVivo: boolean;
  pastaSaida: string;
  /** Pasta do projeto, de onde o Playwright é carregado e os arquivos de upload são lidos. */
  projeto: string;
  timeoutPassoMs: number;
  variaveis: Record<string, string>;
  contas?: Record<string, Conta>;
  /** Onde as sessões reaproveitáveis do bloco ficam guardadas. */
  pastaSessoes?: string;
  dispositivo?: 'desktop' | 'celular';
  mailpit?: string;
}

// Tipos mínimos do Playwright que usamos (o pacote é do projeto testado, não do liveflow).
export interface Loc {
  count(): Promise<number>;
  click(o?: object): Promise<void>;
  fill(v: string): Promise<void>;
  check(): Promise<void>;
  selectOption(v: { label: string }): Promise<unknown>;
  setInputFiles?(f: string[]): Promise<void>;
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
  tipo: 'nao_encontrado' | 'ambiguo' | 'texto' | 'url' | 'api' | 'tempo' | 'email' | 'login' | 'seguranca';
  sugestoes: string[] = [];
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

/** Valor num caminho com pontos: "dados.itens.0.id". */
export function lerCaminho(obj: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Troca {{nome}} pelas variáveis (do artefato e guardadas no fluxo) e {{segredo:nome}} por LIVEFLOW_SEGREDO_NOME. */
export function preencherTexto(t: string, variaveis: Record<string, string>, env: NodeJS.ProcessEnv = process.env): string {
  return t.replace(/\{\{\s*(segredo:)?([a-zA-Z0-9_]+)\s*\}\}/g, (_, seg: string | undefined, nome: string) => {
    if (seg) {
      const v = env[`LIVEFLOW_SEGREDO_${nome.toUpperCase()}`];
      if (v === undefined) throw new ErroPasso('nao_encontrado', `Segredo "${nome}" não configurado (LIVEFLOW_SEGREDO_${nome.toUpperCase()}).`);
      return v;
    }
    const v = variaveis[nome];
    if (v === undefined) throw new ErroPasso('nao_encontrado', `Variável "${nome}" não existe (nem em "variaveis", nem guardada por um passo anterior).`);
    return v;
  });
}

/** Um endereço só pode ir para o próprio sistema em teste. Devolve o caminho relativo. */
export function caminhoNoSistema(destino: string, baseUrl: string): string {
  if (!/^[a-z]+:\/\//i.test(destino)) return destino;
  const d = new URL(destino);
  const b = new URL(baseUrl);
  if (d.host !== b.host) throw new ErroPasso('seguranca', `O endereço ${d.host} não é o sistema em teste (${b.host}). O liveflow não abre outros sites.`);
  return d.pathname + d.search + d.hash;
}

/** Arquivo de upload: precisa existir e estar dentro do projeto. */
export function arquivoDoProjeto(projeto: string, arq: string): string {
  const cheio = resolve(projeto, arq);
  const rel = relative(projeto, cheio);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new ErroPasso('seguranca', `O arquivo ${arq} está fora do projeto.`);
  if (!existsSync(cheio)) throw new ErroPasso('nao_encontrado', `O arquivo ${arq} não existe no projeto.`);
  return cheio;
}

function emitir(ev: Record<string, unknown>): void {
  process.stdout.write(`@@liveflow ${JSON.stringify({ ts: new Date().toISOString(), ...ev })}\n`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sessao = { context: any; page: any; trace: string };

async function principal(): Promise<void> {
  const entrada = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as EntradaFluxo;
  mkdirSync(entrada.pastaSaida, { recursive: true });
  const inicio = new Date();
  const req = createRequire(join(entrada.projeto, 'package.json'));
  let pw: any;
  for (const nome of ['playwright', '@playwright/test']) {
    try { pw = req(nome); break; } catch { /* tenta o próximo */ }
  }
  if (!pw) {
    emitir({ tipo: 'ambiente', erro: 'Playwright não está instalado no projeto. Rode: npm i -D playwright && npx playwright install chromium' });
    process.exit(2);
  }
  const opcoes = { headless: !entrada.aoVivo, slowMo: entrada.aoVivo ? 300 : 0 };
  let browser: any;
  try {
    browser = await pw.chromium.launch(opcoes);
  } catch (e) {
    try {
      browser = await pw.chromium.launch({ ...opcoes, channel: 'chrome' });
      emitir({ tipo: 'aviso', regra: 'navegador', mensagem: 'Usando o Google Chrome instalado (o Chromium do Playwright não está instalado).' });
    } catch {
      emitir({ tipo: 'ambiente', erro: `Não consegui abrir o navegador: ${String((e as Error).message).split('\n')[0]}. Rode: npx playwright install chromium` });
      process.exit(2);
    }
  }

  let tela: Record<string, unknown> = { viewport: { width: 1280, height: 800 } };
  if (entrada.dispositivo === 'celular') {
    const { defaultBrowserType: _ignorado, ...cel } = pw.devices?.['iPhone 13'] ?? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
    tela = cel;
  }
  const vars: Record<string, string> = { ...entrada.variaveis };
  const t = (s: string) => preencherTexto(s, vars);
  const sessoes = new Map<string, Sessao>();

  const novaSessao = async (nome: string, estado?: string): Promise<Sessao> => {
    const context = await browser.newContext({ ...tela, baseURL: entrada.baseUrl, recordVideo: { dir: join(entrada.pastaSaida, 'video', nome || 'visitante') }, ...(estado ? { storageState: estado } : {}) });
    const trace = join(entrada.pastaSaida, sessoes.size === 0 ? 'trace.zip' : `trace-${nome || 'visitante'}.zip`);
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    page.setDefaultTimeout(entrada.timeoutPassoMs);
    page.on('response', (r: any) => {
      if (r.status() >= 500) emitir({ tipo: 'aviso', regra: 'erro_500', mensagem: `${r.request().method()} ${new URL(r.url()).pathname} respondeu ${r.status()}` });
    });
    page.on('pageerror', (er: Error) => emitir({ tipo: 'aviso', regra: 'erro_js', mensagem: String(er.message).split('\n')[0] }));
    return { context, page, trace };
  };

  /** A sessão da conta do passo. Login acontece uma vez por conta, na primeira vez que ela aparece. */
  const sessaoDe = async (conta?: string): Promise<Sessao> => {
    const chave = conta ?? '';
    const pronta = sessoes.get(chave);
    if (pronta) return pronta;
    if (!conta) {
      const s = await novaSessao('');
      sessoes.set('', s);
      return s;
    }
    const c = entrada.contas?.[conta];
    if (!c) throw new ErroPasso('login', `A conta "${conta}" não existe em "contas".`);
    const arq = entrada.pastaSessoes ? join(entrada.pastaSessoes, `${conta}.json`) : null;
    if (c.reaproveitar && c.verificar && arq && existsSync(arq)) {
      const s = await novaSessao(conta, arq);
      try {
        for (const p of c.verificar) await executarPasso(s, p);
        sessoes.set(chave, s);
        emitir({ tipo: 'sessao', conta, reaproveitada: true });
        return s;
      } catch {
        await s.context.close().catch(() => undefined);
      }
    }
    const s = await novaSessao(conta);
    sessoes.set(chave, s);
    for (const p of c.entrar) {
      try {
        await executarPasso(s, p);
      } catch (e) {
        const er = e instanceof ErroPasso ? e : new ErroPasso('tempo', String((e as Error).message).split('\n')[0] ?? 'erro');
        const novo = new ErroPasso('login', `Login da conta "${conta}" falhou no passo ${p.n} (${descrever(p)}): ${er.message}`);
        novo.sugestoes = er.sugestoes;
        throw novo;
      }
    }
    if (c.reaproveitar && arq) {
      mkdirSync(entrada.pastaSessoes!, { recursive: true });
      await s.context.storageState({ path: arq });
    }
    emitir({ tipo: 'sessao', conta, reaproveitada: false });
    return s;
  };

  const executarPasso = async (s: Sessao, p: PassoCard): Promise<string | undefined> => {
    const { page, context } = s;
    switch (p.acao) {
      case 'abrir': await page.goto(caminhoNoSistema(t(p.caminho), entrada.baseUrl)); return;
      case 'clicar': await (await localizarClicavel(page, t(p.alvo))).click(); return;
      case 'preencher': await (await localizarCampo(page, t(p.campo))).fill(t(p.valor)); return;
      case 'selecionar': await (await localizarCampo(page, t(p.campo))).selectOption({ label: t(p.opcao) }); return;
      case 'marcar': await (await localizarClicavel(page, t(p.campo))).check(); return;
      case 'enviar_arquivo': {
        const arquivos = p.arquivos.map((a) => arquivoDoProjeto(entrada.projeto, t(a)));
        const loc = await localizarCampo(page, t(p.campo));
        await loc.setInputFiles!(arquivos);
        return;
      }
      case 'ver_texto':
        await page.getByText(t(p.texto)).first().waitFor({ state: 'visible' }).catch(() => {
          throw new ErroPasso('texto', `O texto "${t(p.texto)}" não apareceu em ${entrada.timeoutPassoMs / 1000} s.`);
        });
        return;
      case 'nao_ver_texto':
        await page.getByText(t(p.texto)).first().waitFor({ state: 'hidden' }).catch(() => {
          throw new ErroPasso('texto', `O texto "${t(p.texto)}" continua na tela.`);
        });
        return;
      case 'ver_url': {
        const re = globParaRegex(t(p.padrao));
        await page.waitForURL((u: URL) => re.test(u.pathname + u.search) || re.test(u.pathname)).catch(() => {
          throw new ErroPasso('url', `Esperava estar em ${p.padrao}, mas a página está em ${new URL(page.url()).pathname}.`);
        });
        return;
      }
      case 'guardar': {
        const fonte = p.da_url !== undefined ? page.url() : await page.locator('body').innerText();
        const m = new RegExp(p.da_url ?? p.do_texto!).exec(fonte);
        if (!m?.[1]) throw new ErroPasso('texto', `Não achei ${p.da_url ? 'na URL' : 'na tela'} um valor para "${p.nome}" (expressão ${p.da_url ?? p.do_texto}).`);
        vars[p.nome] = m[1];
        return p.nome;
      }
      case 'api': {
        const corpo = p.corpo === undefined ? undefined : JSON.parse(t(JSON.stringify(p.corpo)));
        const r = await context.request.fetch(caminhoNoSistema(t(p.rota), entrada.baseUrl), { method: p.metodo, data: corpo });
        if (r.status() !== p.status) throw new ErroPasso('api', `${p.metodo} ${p.rota}: esperado ${p.status}, veio ${r.status()}.`);
        const json = p.contem || p.guardar ? await r.json().catch(() => undefined) : undefined;
        if (p.contem) {
          const dif = contem(JSON.parse(t(JSON.stringify(p.contem))), json);
          if (dif) throw new ErroPasso('api', `${p.metodo} ${p.rota}: ${dif}.`);
        }
        for (const [nome, caminho] of Object.entries(p.guardar ?? {})) {
          const v = lerCaminho(json, caminho);
          if (v === undefined || v === null || typeof v === 'object') throw new ErroPasso('api', `${p.metodo} ${p.rota}: a resposta não tem "${caminho}" para guardar em ${nome}.`);
          vars[nome] = String(v);
        }
        return p.guardar ? Object.keys(p.guardar).join(', ') : undefined;
      }
      case 'ver_email': {
        if (!entrada.mailpit) throw new ErroPasso('email', 'Configure sistema.email.mailpit para ler e-mails de teste.');
        const email = await buscarEmail(entrada.mailpit, t(p.para), p.assunto ? t(p.assunto) : undefined, inicio, entrada.timeoutPassoMs * 3).catch((e: Error) => {
          throw new ErroPasso('email', e.message);
        });
        if (p.guardar_link) {
          const link = email.links.find((l) => !p.guardar_link!.contem || l.includes(t(p.guardar_link!.contem)));
          if (!link) throw new ErroPasso('email', `O e-mail "${email.assunto}" chegou, mas não tem link${p.guardar_link.contem ? ` com "${p.guardar_link.contem}"` : ''}.`);
          const b = new URL(entrada.baseUrl);
          const l = new URL(link);
          vars[p.guardar_link.nome] = l.host === b.host ? l.pathname + l.search + l.hash : link;
          return p.guardar_link.nome;
        }
        return;
      }
      case 'conferir_manual':
        emitir({ tipo: 'manual_pendente', n: p.n, texto: p.texto });
        return;
      case 'esperar_ms': await page.waitForTimeout(p.ms); return;
    }
  };

  let falhou = false;
  for (const p of entrada.passos) {
    const comeco = Date.now();
    emitir({ tipo: 'passo_inicio', n: p.n, descricao: descrever(p), criterio: p.criterio, etapa: p.etapa });
    let s: Sessao | undefined;
    try {
      s = await sessaoDe(p.como);
      const guardou = await executarPasso(s, p);
      emitir({ tipo: 'passo_ok', n: p.n, ms: Date.now() - comeco, ...(guardou ? { guardou } : {}) });
      if (entrada.aoVivo) {
        // quadro para a extensão mostrar a tela ao vivo dentro do painel
        const quadro = join(entrada.pastaSaida, `quadro-${p.n}.jpg`);
        await s.page.screenshot({ path: quadro, type: 'jpeg', quality: 60 }).then(() => emitir({ tipo: 'quadro', n: p.n, arquivo: quadro, url: s!.page.url(), como: p.como }), () => undefined);
      }
    } catch (e) {
      const erro = e instanceof ErroPasso ? e : new ErroPasso('tempo', String((e as Error).message).split('\n')[0] ?? 'erro');
      const pagina = s?.page ?? sessoes.get(p.como ?? '')?.page;
      if (erro.tipo === 'nao_encontrado' && pagina && ('alvo' in p || 'campo' in p)) {
        const alvo = 'alvo' in p ? p.alvo : 'campo' in p ? p.campo : '';
        const candidatos: string[] = await pagina.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a, [role=button], [role=link], [role=tab], [role=menuitem], label, input[placeholder], input[type=submit]'));
          return els
            .filter((el) => (el as HTMLElement).offsetParent !== null || el.getClientRects().length > 0)
            .map((el) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || (el as HTMLInputElement).value || '').trim())
            .filter(Boolean);
        }).catch(() => []);
        erro.sugestoes = sugerirParecidos(alvo, candidatos);
        if (erro.sugestoes.length) erro.message += ` Na tela existe: ${erro.sugestoes.map((x) => `"${x}"`).join(', ')}. Se o texto mudou de propósito, atualize o passo.`;
      }
      const print = join(entrada.pastaSaida, `falha-passo-${p.n}.png`);
      if (pagina) await pagina.screenshot({ path: print, fullPage: true }).catch(() => undefined);
      emitir({ tipo: 'passo_falhou', n: p.n, erro: erro.message, motivo: erro.tipo, sugestoes: erro.sugestoes, print, url: pagina?.url() });
      falhou = true;
      break;
    }
  }
  for (const s of sessoes.values()) {
    await s.context.tracing.stop({ path: s.trace }).catch(() => undefined);
    await s.context.close().catch(() => undefined);
  }
  await browser.close();
  process.exit(falhou ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) {
  await principal();
}
