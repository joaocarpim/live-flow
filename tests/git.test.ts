import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arquivosMudados, criarCopia, listarBranches, refSegura } from '../src/git.ts';
import { alvosDasBranches } from '../src/fontes.ts';
import { lerArtefato } from '../src/artefato.ts';
import { repoDeTeste } from './ajuda.ts';

const { repo } = repoDeTeste();

test('lista branches locais e remotas, sem o HEAD do remoto', async () => {
  const bs = await listarBranches(repo);
  const nomes = bs.map((b) => `${b.tipo}:${b.nome}`);
  for (const n of ['local:main', 'local:feat/aprovacao', 'local:feat/sem-card', 'remota:origin/main', 'remota:origin/feat/remota']) assert.ok(nomes.includes(n), n);
  assert.ok(!nomes.some((n) => n.endsWith('/HEAD')));
  assert.equal(bs.find((b) => b.nome === 'origin/feat/remota')!.semRemoto, 'feat/remota');
  assert.equal((await listarBranches(repo, { remotas: false })).some((b) => b.tipo === 'remota'), false);
});

test('arquivos mudados são só os da branch desde a base', async () => {
  const a = await arquivosMudados(repo, 'main', 'feat/aprovacao');
  assert.deepEqual(a.map((x) => x.caminho).sort(), ['app.mjs', 'src/orcamento/aprovar.ts']);
  assert.deepEqual((await arquivosMudados(repo, 'main', 'origin/feat/remota')).map((x) => x.caminho), ['web/pages/agenda.tsx']);
});

test('mapeia cards por branch e cria rascunho para branch sem card', async () => {
  const art = lerArtefato(`cards:
  - id: C-01
    titulo: Aprovação
    branch: feat/aprovacao
    como_testar: [ { abrir: / } ]
  - id: C-07
    titulo: Agenda do técnico
    arquivos: [web/pages/**]
    como_testar: [ { abrir: /agenda } ]
`);
  const alvos = await alvosDasBranches(repo, 'main', ['feat/aprovacao', 'feat/sem-card', 'origin/feat/remota'], art.cards);
  assert.deepEqual(alvos[0]!.cards.map((c) => c.card.card.id), ['C-01']);
  assert.equal(alvos[1]!.cards.length, 0);
  assert.equal(alvos[1]!.rascunho!.id, 'B-sem-card');
  assert.equal(alvos[1]!.rascunho!.titulo, 'relatório em pdf');
  assert.deepEqual(alvos[2]!.cards.map((c) => [c.card.card.id, c.motivo]), [['C-07', 'arquivos']]);
});

test('branch inexistente dá erro claro', async () => {
  await assert.rejects(alvosDasBranches(repo, 'main', ['feat/nao-existe'], []), /não encontrada/);
});

test('cópia isolada tem o código da branch e some depois', async () => {
  const c = await criarCopia(repo, 'feat/aprovacao');
  assert.match(readFileSync(join(c.dir, 'app.mjs'), 'utf8'), /aprovacao/);
  assert.match(readFileSync(join(repo, 'app.mjs'), 'utf8'), /base/, 'o checkout da pessoa não muda');
  await c.remover();
  assert.equal(existsSync(c.dir), false);
});

test('nomes de branch perigosos são recusados', () => {
  for (const r of ['--upload-pack=x', 'a..b', 'a b', 'x@{1}']) assert.throws(() => refSegura(r), /inválido/, r);
  assert.equal(refSegura('feat/ok-1'), 'feat/ok-1');
});
