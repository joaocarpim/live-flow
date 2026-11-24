// Ponta a ponta com navegador de verdade: duas pessoas, guardar valor, foto, celular, e-mail, sugestão e gravador.
// Precisa do Playwright: defina LIVEFLOW_PW_NODE_MODULES com a pasta node_modules onde ele está.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { commit, escrever, g } from './ajuda.ts';
import { gravar, salvarPassos } from '../src/gravar.ts';
import { lerArtefato } from '../src/artefato.ts';
import { portaLivre, esperarSaude } from '../src/executar.ts';

const pw = process.env.LIVEFLOW_PW_NODE_MODULES;
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

// App da marmoraria em miniatura: técnico cria orçamento e envia foto; cliente aceita pelo link.
const APP = (botaoAceite: string) => String.raw`import { createServer } from 'node:http';
const MAILPIT = process.env.MAILPIT;
const pg = (c) => '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width"></head><body>' + c + '</body></html>';
const quem = (req) => (/usuario=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
const corpo = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => ok(d)); });
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const html = (c) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(pg(c)); };
  const ir = (l, extra = {}) => { res.writeHead(303, { location: l, ...extra }); res.end(); };
  if (u.pathname === '/login' && req.method === 'POST') {
    const f = new URLSearchParams(await corpo(req));
    if (f.get('senha') !== 'certa') return html('<p>E-mail ou senha incorretos</p>');
    return ir('/painel', { 'set-cookie': 'usuario=' + encodeURIComponent(f.get('email')) + '; Path=/' });
  }
  if (u.pathname === '/login') return html('<form method="post" action="/login"><label for="e">E-mail</label><input id="e" name="email"><label for="s">Senha</label><input id="s" name="senha" type="password"><button>Entrar</button></form>');
  if (u.pathname === '/largura') return html('<p id="l"></p><script>document.getElementById("l").textContent = "largura " + window.innerWidth;</script>');
  if (u.pathname === '/esqueci' && req.method === 'POST') {
    const f = new URLSearchParams(await corpo(req));
    const link = 'http://' + req.headers.host + '/redefinir?t=abc123';
    await fetch(MAILPIT + '/enviar', { method: 'POST', body: JSON.stringify({ to: f.get('email'), subject: 'Redefinir sua senha', text: 'Para criar uma nova senha, acesse ' + link }) });
    return html('<p>Enviamos um link para o seu e-mail</p>');
  }
  if (u.pathname === '/esqueci') return html('<form method="post" action="/esqueci"><label for="e">E-mail</label><input id="e" name="email"><button>Enviar link</button></form>');
  if (u.pathname === '/redefinir') return html(u.searchParams.get('t') === 'abc123' ? '<h1>Nova senha</h1>' : '<p>Link inválido</p>');
  const usuario = quem(req);
  if (!usuario) return ir('/login');
  if (u.pathname === '/painel') return html('<p>Olá, ' + decodeURIComponent(usuario) + '</p><a href="/sair">Sair</a><form method="post" action="/orcamentos"><button>Criar orçamento</button></form>');
  if (u.pathname === '/orcamentos' && req.method === 'POST') return ir('/orcamentos/77');
  const m = /^\/orcamentos\/(\d+)$/.exec(u.pathname);
  if (m && req.method === 'POST') { const b = await corpo(req); const n = (b.match(/filename="/g) || []).length; return html('<p>' + n + ' foto(s) recebida(s)</p>'); }
  if (m) return html('<h1>Orçamento nº ' + m[1] + '</h1><form method="post" enctype="multipart/form-data"><label for="f">Fotos</label><input id="f" name="fotos" type="file" multiple><button>Enviar fotos</button></form>');
  const a = /^\/aceite\/(\d+)$/.exec(u.pathname);
  if (a && req.method === 'POST') return html('<p>Orçamento ' + a[1] + ' aceito por ' + decodeURIComponent(usuario) + '</p>');
  if (a) return html('<form method="post"><button>${botaoAceite} ' + a[1] + '</button></form>');
  html('<p>404</p>');
}).listen(Number(process.argv[2]), '127.0.0.1');
`;

const contaYaml = (email: string) => `
    entrar:
      - abrir: /login
      - preencher: { campo: E-mail, valor: ${email} }
      - preencher: { campo: Senha, valor: "{{segredo:senha}}" }
      - clicar: Entrar
    verificar: [ { abrir: /painel }, { ver_texto: Sair } ]
    reaproveitar: sim`;

const CARDS = (mailpit: string) => `versao: 1
sistema:
  url: http://127.0.0.1:{{porta}}
  permitidos: [127.0.0.1]
  iniciar: MAILPIT=${mailpit} node app.mjs {{porta}}
  saude: /login
  email: { mailpit: "${mailpit}" }
contas:
  tecnico:${contaYaml('tecnico@marmoraria.local')}
  cliente:${contaYaml('cliente@empresa.local')}
cards:
  - id: C-10
    titulo: Técnico manda a foto e o cliente aceita o orçamento
    branch: feat/aceite
    criterios: [O técnico envia as fotos da vistoria, O cliente aceita pelo link]
    como_testar:
      - abrir: /painel
        como: tecnico
      - clicar: Criar orçamento
        como: tecnico
      - guardar: { nome: orc, da_url: "/orcamentos/(\\\\d+)" }
        como: tecnico
      - enviar_arquivo: { campo: Fotos, arquivos: [.liveflow/arquivos/vistoria.jpg] }
        como: tecnico
      - clicar: Enviar fotos
        como: tecnico
      - ver_texto: 1 foto(s) recebida(s)
        como: tecnico
        criterio: 1
      - abrir: /aceite/{{orc}}
        como: cliente
      - clicar: Aceitar orçamento {{orc}}
        como: cliente
      - ver_texto: Orçamento {{orc}} aceito por cliente@empresa.local
        como: cliente
        criterio: 2
      - conferir_manual: O PDF do orçamento sai com a logo da marmoraria
  - id: C-11
    titulo: Agenda no celular do técnico
    branch: feat/aceite
    dispositivo: celular
    como_testar:
      - abrir: /largura
      - ver_texto: largura 390
  - id: C-12
    titulo: Recuperar senha pelo e-mail
    branch: feat/aceite
    como_testar:
      - abrir: /esqueci
      - preencher: { campo: E-mail, valor: ana@empresa.local }
      - clicar: Enviar link
      - ver_texto: Enviamos um link
      - ver_email: { para: ana@empresa.local, assunto: Redefinir, guardar_link: { nome: link, contem: /redefinir } }
      - abrir: "{{link}}"
      - ver_texto: Nova senha
  - id: C-14
    titulo: Técnico volta ao painel (sessão reaproveitada)
    branch: feat/aceite
    depende_de: [C-10]
    como_testar:
      - abrir: /painel
        como: tecnico
      - ver_texto: Olá, tecnico@marmoraria.local
        como: tecnico
  - id: C-13
    titulo: Aceite na branch onde o botão mudou de nome
    branch: feat/renomeado
    como_testar:
      - abrir: /aceite/5
        como: cliente
      - clicar: Aceitar orçamento 5
        como: cliente
`;

/** Mailpit falso: guarda o que o app envia e responde à API de busca. */
async function mailpitFalso(): Promise<{ url: string; fechar: () => void }> {
  const msgs: { ID: string; Subject: string; Created: string; To: { Address: string }[]; Text: string }[] = [];
  const srv = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/enviar') {
      let d = '';
      req.on('data', (c) => (d += c));
      req.on('end', () => {
        const m = JSON.parse(d);
        msgs.push({ ID: String(msgs.length + 1), Subject: m.subject, Created: new Date().toISOString(), To: [{ Address: m.to }], Text: m.text });
        res.end('{}');
      });
      return;
    }
    if (u.pathname === '/api/v1/search') {
      const para = /to:"([^"]+)"/.exec(u.searchParams.get('query') ?? '')?.[1];
      return res.end(JSON.stringify({ messages: msgs.filter((m) => m.To[0]!.Address === para) }));
    }
    const m = msgs.find((x) => u.pathname === `/api/v1/message/${x.ID}`);
    res.end(JSON.stringify(m ? { Subject: m.Subject, Text: m.Text } : {}));
  }).listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  return { url: `http://127.0.0.1:${(srv.address() as { port: number }).port}`, fechar: () => srv.close() };
}

const exec = promisify(execFile);
async function liveflow(repo: string, ...args: string[]) {
  try {
    const { stdout } = await exec(process.execPath, [CLI, ...args, '--repo', repo, '--json'], { env: { ...process.env, LIVEFLOW_SEGREDO_SENHA: 'certa' }, maxBuffer: 1 << 24 });
    return JSON.parse(stdout);
  } catch (e) {
    const out = (e as { stdout?: string }).stdout;
    if (out) return JSON.parse(out);
    throw e;
  }
}

function montarRepo(mailpit: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'lf-e2e2-'));
  g(repo, 'init', '-q', '-b', 'main');
  commit(repo, 'base', { 'package.json': '{"type":"module"}\n', '.gitignore': 'node_modules\n.liveflow/execucoes\n', 'app.mjs': APP('Aceitar orçamento'), '.liveflow/arquivos/vistoria.jpg': 'jpg falso' });
  escrever(repo, '.liveflow/cards.yaml', CARDS(mailpit));
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'cards');
  g(repo, 'branch', 'feat/aceite');
  g(repo, 'checkout', '-q', '-b', 'feat/renomeado');
  commit(repo, 'renomeia', { 'app.mjs': APP('Confirmar orçamento') });
  g(repo, 'checkout', '-q', 'main');
  symlinkSync(pw!, join(repo, 'node_modules'));
  return repo;
}

test('navegador de verdade: fluxos novos do passo a passo', { skip: !pw && 'defina LIVEFLOW_PW_NODE_MODULES para rodar com navegador', timeout: 300_000 }, async () => {
  const mail = await mailpitFalso();
  try {
    const repo = montarRepo(mail.url);
    assert.deepEqual(lerArtefato(readFileSync(join(repo, '.liveflow/cards.yaml'), 'utf8')).problemas, []);
    const res = await liveflow(repo, 'rodar', 'C-10', 'C-11', 'C-12', 'C-13', 'C-14');
    const por = Object.fromEntries(res.map((r: { card: string }) => [r.card, r]));

    // duas pessoas, valor guardado da URL, foto enviada, conferência manual pendente
    assert.equal(por['C-10'].resultado, 'passou', JSON.stringify(por['C-10'].falha ?? por['C-10'].motivo));
    assert.deepEqual(por['C-10'].pendencias, ['O PDF do orçamento sai com a logo da marmoraria']);
    assert.ok(existsSync(join(por['C-10'].pasta, 'tentativa-1', 'trace-cliente.zip')), 'cada pessoa tem o seu trace');
    // tela de celular
    assert.equal(por['C-11'].resultado, 'passou', JSON.stringify(por['C-11'].falha));
    // link que chegou por e-mail
    assert.equal(por['C-12'].resultado, 'passou', JSON.stringify(por['C-12'].falha));
    // botão renomeado: falha confirmada com sugestão do texto novo
    assert.equal(por['C-13'].resultado, 'falhou');
    assert.deepEqual(por['C-13'].falha.sugestoes, ['Confirmar orçamento 5']);
    assert.match(por['C-13'].falha.erro, /Na tela existe: "Confirmar orçamento 5"/);
    // C-10..C-12 são da mesma branch: um app só para os três
    assert.equal(por['C-10'].sha, por['C-12'].sha);
    // C-14 reaproveita a sessão do técnico guardada no C-10 (confirmada pelo "verificar")
    assert.equal(por['C-14'].resultado, 'passou', JSON.stringify(por['C-14'].falha));
    const eventos = readFileSync(join(por['C-14'].pasta, '..', 'events.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(eventos.some((e) => e.tipo === 'sessao' && e.card === 'C-14' && e.conta === 'tecnico' && e.reaproveitada === true));
    assert.ok(eventos.some((e) => e.tipo === 'sessao' && e.card === 'C-10' && e.conta === 'tecnico' && e.reaproveitada === false));
  } finally {
    mail.fechar();
  }
});

test('navegador de verdade: gravador transforma o que a pessoa faz em passos', { skip: !pw && 'defina LIVEFLOW_PW_NODE_MODULES para rodar com navegador', timeout: 120_000 }, async () => {
  const repo = montarRepo('http://127.0.0.1:9');
  const porta = await portaLivre();
  const app = spawn(process.execPath, ['app.mjs', String(porta)], { cwd: repo, stdio: 'ignore' });
  try {
    await esperarSaude(`http://127.0.0.1:${porta}/login`, 10_000);
    const gr = await gravar({ projeto: repo, baseUrl: `http://127.0.0.1:${porta}`, caminho: '/login', visivel: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = gr.page as any;
    await page.getByLabel('E-mail').fill('tecnico@marmoraria.local');
    await page.getByLabel('Senha').fill('certa');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/painel');
    await page.getByRole('button', { name: 'Criar orçamento' }).click();
    await page.waitForURL('**/orcamentos/77');
    const passos = await gr.parar();
    assert.deepEqual(passos, [
      { abrir: '/login' },
      { preencher: { campo: 'E-mail', valor: 'tecnico@marmoraria.local' } },
      { preencher: { campo: 'Senha', valor: '{{segredo:senha}}' } },
      { clicar: 'Entrar' },
      { clicar: 'Criar orçamento' },
    ]);
    salvarPassos(repo, 'C-11', passos);
    const c = lerArtefato(readFileSync(join(repo, '.liveflow/cards.yaml'), 'utf8')).cards.find((x) => x.card.id === 'C-11')!;
    assert.equal(c.estado, 'pronto');
    assert.equal(c.card.como_testar.length, 5);
  } finally {
    app.kill();
  }
});
