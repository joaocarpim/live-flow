// Abre as telas da extensão num navegador com dados reais de um repositório e tira print de cada uma.
// Uso: node teste/prints.mjs <repo> <pasta-de-saida> [claro]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const [repo, saida, tema] = process.argv.slice(2);
const ext = resolve(new URL('..', import.meta.url).pathname);
const cli = (...a) => JSON.parse(execFileSync('node', [join(ext, 'dist/cli/cli.js'), ...a, '--repo', repo, '--json'], { encoding: 'utf8', env: { ...process.env, LIVEFLOW_SEGREDO_SENHA: 'certa' } }));
mkdirSync(saida, { recursive: true });

const cards = cli('cards');
const ambiente = (() => { try { return cli('ambiente'); } catch (e) { return JSON.parse(e.stdout); } })();
const historico = cli('historico');
const prontos = cards.filter((c) => c.estado === 'pronto').map((c) => c.card.id);
const plano = cli('plano', prontos[0]);
const blocos = cli('blocos', ...prontos);
const execs = join(repo, '.liveflow/execucoes');
const dirs = readdirSync(execs).filter((d) => existsSync(join(execs, d, 'resultado.json'))).sort();
// resultado com falha para Resultados/Problema; execução ao vivo para Execução
let resultados = [];
for (const d of dirs) resultados = resultados.concat(JSON.parse(readFileSync(join(execs, d, 'resultado.json'), 'utf8')));
const porCard = new Map(resultados.map((r) => [r.card, r]));
resultados = [...porCard.values()];
const aoVivo = dirs.map((d) => join(execs, d)).reverse().find((d) => readFileSync(join(d, 'events.ndjson'), 'utf8').includes('"quadro"'));
const eventosVivo = aoVivo ? readFileSync(join(aoVivo, 'events.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const branches = cli('branches');
const nomes = branches.filter((b) => !/main|master/.test(b.nome)).map((b) => b.nome);
const mapa = cli('mapear', '--branches', nomes.join(','));
const promptResolver = execFileSync('node', [join(ext, 'dist/cli/cli.js'), 'prompt', 'resolver', resultados.find((r) => r.resultado === 'falhou')?.card ?? prontos[0], '--repo', repo], { encoding: 'utf8' }).trim();
const arquivo = (p) => (p && existsSync(p) ? 'file://' + p : undefined);

const dados = {
  estado: { cards, ambiente, historico, segredos: [{ nome: 'senha', definido: true }, { nome: 'token_pix', definido: false }], repo, erro: '' },
  plano: { id: prontos[0], dados: plano },
  blocos: { ids: prontos, dados: blocos },
  resultados: resultados.map((r) => ({ ...r, printUri: arquivo(r.falha?.print) })),
  eventosVivo: eventosVivo.map((e) => ({ ...e, imagem: arquivo(e.arquivo) })),
  branches: { branches, mapa, erro: '' },
  promptResolver,
};

const claro = tema === 'claro';
const vars = claro
  ? '--vscode-editor-background:#ffffff;--vscode-sideBar-background:#f3f3f3;--vscode-editorWidget-background:#f8f8f8;--vscode-panel-border:#e2e4e8;--vscode-foreground:#1f2328;--vscode-descriptionForeground:#5f6670;--vscode-input-background:#ffffff;'
  : '--vscode-editor-background:#1e1f22;--vscode-sideBar-background:#181a1f;--vscode-editorWidget-background:#25272c;--vscode-panel-border:#34373d;--vscode-foreground:#e3e5e8;--vscode-descriptionForeground:#9aa0a8;--vscode-input-background:#17181b;';
for (const modo of ['principal', 'lateral']) {
  writeFileSync(join(saida, `${modo}.html`), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="file://${ext}/media/app.css">
<style>:root{${vars}--vscode-font-family:Inter,system-ui,sans-serif}</style></head>
<body data-modo="${modo}" data-logo="file://${ext}/media/logo-liveflow.svg"><div id="app"></div>
<script>
const DADOS = ${JSON.stringify(dados)};
function acquireVsCodeApi(){ return { postMessage(m){ setTimeout(()=>responder(m),0); } }; }
function msg(d){ window.dispatchEvent(new MessageEvent('message',{data:d})); }
function responder(m){
  if (m.tipo==='pronto'||m.tipo==='recarregar') msg({tipo:'estado',dados:DADOS.estado});
  if (m.tipo==='plano') msg({tipo:'plano',id:m.id,dados:DADOS.plano.dados});
  if (m.tipo==='blocos') msg({tipo:'blocos',ids:m.ids,dados:DADOS.blocos.dados});
  if (m.tipo==='branches') msg({tipo:'branches',dados:DADOS.branches});
  if (m.tipo==='prompt') msg({tipo:'prompt',qual:m.qual,id:m.id,dados:DADOS.promptResolver});
}
</script>
<script src="file://${ext}/media/app.js"></script></body></html>`);
}

const req = createRequire(join(process.env.LIVEFLOW_PW_NODE_MODULES, 'x.js'));
const { chromium } = req('playwright');
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const tirar = async (nome, acao, alturaTotal = false) => {
  await page.goto('file://' + join(saida, 'principal.html'));
  await page.waitForTimeout(150);
  await page.evaluate(acao);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(saida, `${nome}${claro ? '-claro' : ''}.png`), fullPage: alturaTotal });
};
await tirar('01-cards', `(() => { const L = window.__liveflow; L.S.sel.add(DADOS.blocos.ids[0]); L.S.sel.add(DADOS.blocos.ids[1]); L.render(); })()`, true);
await tirar('02-card', `(() => { const L = window.__liveflow; L.ir('card', { cardAberto: DADOS.plano.id }); msg({tipo:'plano', id: DADOS.plano.id, dados: DADOS.plano.dados}); })()`, true);
await tirar('03-blocos', `(() => { const L = window.__liveflow; DADOS.blocos.ids.forEach((i) => L.S.sel.add(i)); L.ir('blocos'); })()`, true);
await tirar('04-execucao-ao-vivo', `(() => { const L = window.__liveflow; const ids = [...new Set(DADOS.eventosVivo.map((e) => e.card).filter(Boolean))]; msg({tipo:'execucao_comecou', ids, aoVivo: true}); const evs = DADOS.eventosVivo; const corte = evs.findIndex((e) => e.tipo === 'quadro' && e.n === 6); evs.slice(0, corte + 2).forEach((e) => L.aplicarEvento(e)); L.render(); })()`);
await tirar('05-execucao-varios', `(() => { const L = window.__liveflow; const ids = DADOS.blocos.ids.slice(0, 5); msg({tipo:'execucao_comecou', ids, aoVivo: false}); const ev = (o) => L.aplicarEvento(o); ev({tipo:'app_no_ar', url:'http://127.0.0.1:41873'}); ev({tipo:'card_fim', card: ids[0], resultado:'passou'}); ['tentativa','passo_inicio'].forEach(()=>0); ev({tipo:'tentativa', card: ids[1], n: 2}); ev({tipo:'passo_ok', card: ids[1], n: 1, ms: 300}); ev({tipo:'passo_inicio', card: ids[1], n: 2, descricao: 'clicar em \\"Enviar link\\"'}); ev({tipo:'tentativa', card: ids[2], n: 1}); ev({tipo:'passo_ok', card: ids[2], n:1}); ev({tipo:'passo_falhou', card: ids[2], n:2, erro:'x'}); ev({tipo:'aviso', card: ids[1], mensagem:'Usando o Google Chrome instalado (o Chromium do Playwright não está instalado).'}); L.render(); })()`);
await tirar('06-resultados', `(() => { const L = window.__liveflow; msg({tipo:'execucao_terminou', resultados: DADOS.resultados}); L.ir('resultados'); })()`, true);
await tirar('07-problema', `(() => { const L = window.__liveflow; msg({tipo:'execucao_terminou', resultados: DADOS.resultados}); const r = DADOS.resultados.find((x) => x.resultado === 'falhou'); L.ir('problema', { problema: { modo: 'resolver', card: r.card, resultado: r } }); msg({tipo:'prompt', qual:'resolver', id: r.card, dados: DADOS.promptResolver}); })()`, true);
await tirar('08-criar', `(() => { const L = window.__liveflow; L.ir('criar'); })()`, true);
await tirar('09-ambiente', `(() => { const L = window.__liveflow; L.ir('ambiente'); })()`, true);
await tirar('10-historico', `(() => { const L = window.__liveflow; L.ir('historico'); })()`, true);
const lat = await browser.newPage({ viewport: { width: 300, height: 760 } });
await lat.goto('file://' + join(saida, 'lateral.html'));
await lat.waitForTimeout(300);
await lat.screenshot({ path: join(saida, `11-barra-lateral${claro ? '-claro' : ''}.png`) });
await browser.close();
console.log('prints em', saida);
