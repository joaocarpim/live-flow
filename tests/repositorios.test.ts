// Pasta raiz que só junta repositórios (ex.: reidseg/frontend e reidseg/backend, cada um com o seu git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP, commit, escrever, g } from './ajuda.ts';
import { acharRepositorios, arquivosDaBranch, lerRaiz } from '../src/repositorios.ts';
import { lerArtefato } from '../src/artefato.ts';
import { montarBlocos } from '../src/blocos.ts';
import { executar } from '../src/executar.ts';
import { Registro } from '../src/eventos.ts';
import { diagnosticar } from '../src/ambiente.ts';

/** raiz/ (sem git) com frontend/ (tem feat/tela) e backend/ (só main) e um node_modules com .git dentro. */
function pastaDeRepos(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'lf-raiz-'));
  for (const nome of ['frontend', 'backend']) {
    const d = join(raiz, nome);
    mkdirSync(d);
    g(d, 'init', '-q', '-b', 'main');
    commit(d, `${nome} base`, { 'app.mjs': APP(`${nome}-base`), 'src/x.ts': '1\n' });
  }
  g(join(raiz, 'frontend'), 'checkout', '-q', '-b', 'feat/tela');
  commit(join(raiz, 'frontend'), 'tela nova', { 'app.mjs': APP('frontend-tela'), 'src/tela.tsx': 'x\n' });
  g(join(raiz, 'frontend'), 'checkout', '-q', 'main');
  escrever(raiz, 'node_modules/pacote/.git/HEAD', 'ref: refs/heads/main\n');
  return raiz;
}

const SISTEMA = (servicos: string) => `sistema:\n  url: http://127.0.0.1:{{porta}}\n  permitidos: [127.0.0.1]\n  servicos:\n${servicos}`;

async function rodar(raiz: string, yaml: string, ids: string[]) {
  const art = lerArtefato(yaml);
  assert.deepEqual(art.problemas, []);
  const pasta = mkdtempSync(join(tmpdir(), 'lf-exec-'));
  const vistos: Record<string, string> = {};
  const { blocos } = montarBlocos(art.cards, ids, { dadosIsolados: false });
  const res = await executar({
    repo: raiz, artefato: art, blocos, aoVivo: false, modo: 'rapido', registro: new Registro(join(pasta, 'events.ndjson')), pasta,
    executorFluxo: async (e) => ((vistos[e.card] = await (await fetch(e.baseUrl)).text()), 0),
  });
  return { res, vistos };
}

test('acha os repositórios dentro da raiz, sem entrar em node_modules', async () => {
  const raiz = pastaDeRepos();
  assert.deepEqual(acharRepositorios(raiz), ['backend', 'frontend']);
  assert.deepEqual(await lerRaiz(raiz), { raizEhRepo: false, repos: ['backend', 'frontend'] });
  assert.deepEqual(await arquivosDaBranch(raiz, 'main', 'feat/tela'), ['frontend/app.mjs', 'frontend/src/tela.tsx']);
});

test('cada serviço roda no seu repositório; quem não tem a branch usa a base (anotado)', async () => {
  const raiz = pastaDeRepos();
  const yaml = SISTEMA('    - { nome: web, iniciar: "node app.mjs {{porta}}", repo: frontend }\n    - { nome: api, iniciar: "node app.mjs {{porta}}", repo: backend }\n') +
    'cards:\n  - { id: C-01, titulo: tela, branch: feat/tela, como_testar: [ { abrir: / } ] }\n';
  const { res, vistos } = await rodar(raiz, yaml, ['C-01']);
  assert.equal(res[0]!.resultado, 'passou');
  assert.deepEqual(res[0]!.codigo!.map((c) => [c.servico, c.repo, c.ref]), [['web', 'frontend', 'feat/tela'], ['api', 'backend', 'main']]);
  assert.match(res[0]!.codigo![1]!.observacao!, /não existe feat\/tela/);
  assert.match(vistos['C-01']!, /frontend-tela/);
});

test('serviço sem "repo:": usa o único repositório que tem a branch do card', async () => {
  const raiz = pastaDeRepos();
  const yaml = SISTEMA('    - { nome: app, iniciar: "node app.mjs {{porta}}" }\n') + 'cards:\n  - { id: C-01, titulo: tela, branch: feat/tela, como_testar: [ { abrir: / } ] }\n';
  const { res, vistos } = await rodar(raiz, yaml, ['C-01']);
  assert.equal(res[0]!.resultado, 'passou');
  assert.equal(res[0]!.codigo![0]!.repo, 'frontend');
  assert.match(vistos['C-01']!, /frontend-tela/);
});

test('branch que não existe em nenhum repositório: não roda (seria só a base)', async () => {
  const raiz = pastaDeRepos();
  const yaml = SISTEMA('    - { nome: web, iniciar: "node app.mjs {{porta}}", repo: frontend }\n') + 'cards:\n  - { id: C-01, titulo: x, branch: feat/inexistente, como_testar: [ { abrir: / } ] }\n';
  const { res } = await rodar(raiz, yaml, ['C-01']);
  assert.equal(res[0]!.resultado, 'nao_rodou');
  assert.match(res[0]!.motivo!, /não existe em nenhum dos repositórios usados \(frontend\)/);
});

test('vários repositórios e serviço sem "repo:" com a branch em mais de um: não chuta, pede o repo', async () => {
  const raiz = pastaDeRepos();
  g(join(raiz, 'backend'), 'branch', 'feat/tela');
  const yaml = SISTEMA('    - { nome: app, iniciar: "node app.mjs {{porta}}" }\n') + 'cards:\n  - { id: C-01, titulo: x, branch: feat/tela, como_testar: [ { abrir: / } ] }\n';
  const { res } = await rodar(raiz, yaml, ['C-01']);
  assert.equal(res[0]!.resultado, 'nao_rodou');
  assert.match(res[0]!.motivo!, /não diz em qual repositório roda.*backend, frontend.*repo: <pasta>/);
});

test('ambiente mostra os repositórios achados', async () => {
  const raiz = pastaDeRepos();
  const art = lerArtefato(SISTEMA('    - { nome: app, iniciar: "node app.mjs {{porta}}" }\n') + 'cards: []\n');
  const { itens } = await diagnosticar(raiz, art);
  const item = itens.find((i) => i.nome === 'Repositório git')!;
  assert.equal(item.ok, true);
  assert.match(item.detalhe, /2 repositório\(s\): backend, frontend/);
  assert.ok(itens.some((i) => i.nome === 'Repositório de cada serviço' && i.resolver === 'repo: backend'));
});
