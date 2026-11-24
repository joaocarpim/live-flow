// Ponta a ponta com navegador de verdade, pela CLI, num repositório git com duas branches.
// Precisa do Playwright: defina LIVEFLOW_PW_NODE_MODULES com a pasta node_modules onde ele está.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { commit, escrever, g } from './ajuda.ts';

// Playwright: o do próprio repositório (devDependency) ou outro, por LIVEFLOW_PW_NODE_MODULES.
const pw = process.env.LIVEFLOW_PW_NODE_MODULES ?? (existsSync(new URL('../node_modules/playwright', import.meta.url)) ? fileURLToPath(new URL('../node_modules', import.meta.url)) : undefined);
const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

const app = (botao: string) => `import { createServer } from 'node:http';
const pagina = (corpo) => '<!doctype html><html lang="pt-BR"><body>' + corpo + '</body></html>';
createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/login') {
    let dados = ''; req.on('data', (c) => dados += c); req.on('end', () => {
      const f = new URLSearchParams(dados);
      if (f.get('senha') === 'certa') { res.writeHead(303, { location: '/painel', 'set-cookie': 'sessao=1; Path=/' }); return res.end(); }
      res.setHeader('content-type', 'text/html'); res.end(pagina('<p>E-mail ou senha incorretos</p>'));
    }); return;
  }
  if (url.pathname === '/api/me') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ status: 'ok', usuario: { nome: 'Ana', cpf: '***' } })); }
  res.setHeader('content-type', 'text/html');
  if (url.pathname === '/painel') return res.end(pagina('<h1>Bem-vindo, Ana</h1>'));
  if (url.pathname === '/duplo') return res.end(pagina('<button>Salvar</button><button>Salvar</button>'));
  res.end(pagina('<form method="post" action="/login"><label for="e">E-mail</label><input id="e" name="email"><label for="s">Senha</label><input id="s" name="senha" type="password"><button type="submit">${botao}</button></form>'));
}).listen(Number(process.env.PORT), '127.0.0.1');
`;

const CARDS = `versao: 1
sistema:
  url: http://127.0.0.1:{{porta}}
  permitidos: [127.0.0.1]
  iniciar: node app.mjs {{porta}}
  saude: /
variaveis:
  usuario: ana@empresa-a.local
cards:
  - id: C-01
    titulo: Login com e-mail e senha
    branch: feat/login
    criterios: [Entra no painel com a senha certa, A API devolve o usuário]
    como_testar:
      - abrir: /
      - preencher: { campo: E-mail, valor: "{{usuario}}" }
      - preencher: { campo: Senha, valor: "{{segredo:senha}}" }
      - clicar: Entrar
      - ver_url: /painel
        criterio: 1
      - ver_texto: Bem-vindo
      - api: { metodo: GET, rota: /api/me, status: 200, contem: { usuario: { nome: Ana } } }
        criterio: 2
  - id: C-02
    titulo: Login (branch com o botão renomeado)
    branch: feat/quebrado
    como_testar:
      - abrir: /
      - clicar: Entrar
  - id: C-03
    titulo: Botão ambíguo
    branch: feat/login
    como_testar:
      - abrir: /duplo
      - clicar: Salvar
`;

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

test('navegador de verdade: passa na branch certa, falha confirmada na quebrada, recusa clique ambíguo', { skip: !pw && 'defina LIVEFLOW_PW_NODE_MODULES para rodar com navegador', timeout: 240_000 }, async () => {
  const repo = mkdtempSync(join(tmpdir(), 'lf-e2e-'));
  g(repo, 'init', '-q', '-b', 'main');
  commit(repo, 'base', { 'package.json': '{"type":"module"}\n', '.gitignore': 'node_modules\n.liveflow/execucoes\n', 'app.mjs': app('Entrar') });
  escrever(repo, '.liveflow/cards.yaml', CARDS);
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'cards');
  g(repo, 'checkout', '-q', '-b', 'feat/login');
  commit(repo, 'login', { 'src/login.ts': 'export {};\n' });
  g(repo, 'checkout', '-q', '-b', 'feat/quebrado', 'main');
  commit(repo, 'renomeia botão', { 'app.mjs': app('Acessar') });
  g(repo, 'checkout', '-q', 'main');
  symlinkSync(pw!, join(repo, 'node_modules'));

  const [ok] = await liveflow(repo, 'rodar', 'C-01');
  assert.equal(ok.resultado, 'passou', JSON.stringify(ok));

  const [quebrado] = await liveflow(repo, 'rodar', 'C-02');
  assert.equal(quebrado.resultado, 'falhou');
  assert.equal(quebrado.certeza, 'confirmado');
  assert.equal(quebrado.tentativas, 3);
  assert.equal(quebrado.falha.passo, 2);
  assert.match(quebrado.falha.erro, /Não encontrei "Entrar"/);
  assert.ok(existsSync(quebrado.falha.print), 'print da falha salvo');
  assert.ok(existsSync(join(quebrado.pasta, 'tentativa-3', 'trace.zip')), 'trace salvo');

  const [ambiguo] = await liveflow(repo, 'rodar', 'C-03');
  assert.equal(ambiguo.resultado, 'falhou');
  assert.equal(ambiguo.falha.motivo, 'ambiguo');

  // C-01 e C-03 são da mesma branch: um bloco, um app só.
  const juntos = await liveflow(repo, 'rodar', 'C-01', 'C-03');
  assert.deepEqual(juntos.map((r: { card: string; resultado: string }) => [r.card, r.resultado]), [['C-01', 'passou'], ['C-03', 'falhou']]);
  assert.equal(juntos[0].sha, juntos[1].sha);
});
