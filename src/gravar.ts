// Gravador: você faz o fluxo no navegador e o liveflow escreve o passo a passo do card.
// Grava pelo que a pessoa vê (texto do botão, rótulo do campo), nunca por seletor de CSS.
// Senhas nunca são gravadas: viram {{segredo:senha}}.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parseDocument } from 'yaml';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { caminhoArtefato } from './artefato.ts';

export interface PassoGravado {
  [acao: string]: unknown;
}

/** Roda dentro da página: escuta cliques e mudanças e manda cada ação para o liveflow. */
const ESCUTA = `(() => {
  if (window.__liveflowEscutando) return;
  window.__liveflowEscutando = true;
  const nome = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ');
  const rotulo = (el) => {
    if (el.labels && el.labels[0]) return el.labels[0].innerText.trim();
    return (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').trim();
  };
  const enviar = (p) => window.__liveflowPasso && window.__liveflowPasso(p);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [role=button], [role=link], [role=tab], [role=menuitem], input[type=checkbox], input[type=radio], input[type=submit]');
    if (!el) return;
    if (el.matches('input[type=checkbox], input[type=radio]')) enviar({ marcar: rotulo(el) });
    else if (nome(el)) enviar({ clicar: nome(el) });
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.matches) return;
    if (el.matches('select')) enviar({ selecionar: { campo: rotulo(el), opcao: el.options[el.selectedIndex].text.trim() } });
    else if (el.matches('input[type=file]')) enviar({ enviar_arquivo: { campo: rotulo(el), arquivos: Array.from(el.files).map((f) => '.liveflow/arquivos/' + f.name) } });
    else if (el.matches('input[type=password]')) enviar({ preencher: { campo: rotulo(el), valor: '{{segredo:senha}}' } });
    else if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=submit]), textarea')) enviar({ preencher: { campo: rotulo(el), valor: el.value } });
  }, true);
})();`;

/** Junta ações seguidas no mesmo campo (só vale o último valor). */
export function limparGravacao(passos: PassoGravado[]): PassoGravado[] {
  const saida: PassoGravado[] = [];
  for (const p of passos) {
    const ant = saida[saida.length - 1];
    const campo = (x: PassoGravado | undefined) => (x && 'preencher' in x ? (x.preencher as { campo: string }).campo : undefined);
    if (ant && campo(p) !== undefined && campo(p) === campo(ant)) saida[saida.length - 1] = p;
    else saida.push(p);
  }
  return saida;
}

export interface Gravacao {
  /** Página do navegador (para testes dirigirem a gravação). */
  page: unknown;
  /** Termina e devolve os passos, começando por "abrir". */
  parar(): Promise<PassoGravado[]>;
  /** Resolve quando a pessoa fecha o navegador. */
  fechado: Promise<void>;
}

export async function gravar(o: { projeto: string; baseUrl: string; caminho: string; visivel: boolean }): Promise<Gravacao> {
  const req = createRequire(join(o.projeto, 'package.json'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pw: any;
  for (const nome of ['playwright', '@playwright/test']) {
    try { pw = req(nome); break; } catch { /* próximo */ }
  }
  if (!pw) throw new Error('Playwright não está instalado no projeto. Rode: npm i -D playwright');
  const opcoes = { headless: !o.visivel };
  const browser = await pw.chromium.launch(opcoes).catch(() => pw.chromium.launch({ ...opcoes, channel: 'chrome' }));
  const context = await browser.newContext({ baseURL: o.baseUrl, viewport: { width: 1280, height: 800 } });
  const passos: PassoGravado[] = [{ abrir: o.caminho }];
  await context.exposeFunction('__liveflowPasso', (p: PassoGravado) => void passos.push(p));
  await context.addInitScript(ESCUTA);
  const page = await context.newPage();
  await page.goto(o.caminho);
  let fechar!: () => void;
  const fechado = new Promise<void>((ok) => (fechar = ok));
  page.on('close', () => fechar());
  browser.on('disconnected', () => fechar());
  return {
    page,
    fechado,
    async parar() {
      await page.waitForTimeout(150).catch(() => undefined); // deixa o último evento chegar
      await browser.close().catch(() => undefined);
      return limparGravacao(passos);
    },
  };
}

/** Grava os passos no card, mantendo comentários e o resto do arquivo como estão. */
export function salvarPassos(raiz: string, cardId: string, passos: PassoGravado[]): void {
  const arq = caminhoArtefato(raiz);
  const doc = parseDocument(readFileSync(arq, 'utf8'));
  const cards = doc.get('cards', true) as { items: { get(k: string): unknown }[] } | undefined;
  const i = cards?.items.findIndex((c) => c.get('id') === cardId) ?? -1;
  if (i < 0) throw new Error(`Card ${cardId} não existe no artefato.`);
  doc.setIn(['cards', i, 'como_testar'], doc.createNode(passos));
  writeFileSync(arq, doc.toString());
}

