import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globParaRegex, vincular, alvosDoArtefato } from '../src/fontes.ts';
import { lerArtefato } from '../src/artefato.ts';

const art = lerArtefato(`cards:
  - id: C-01
    titulo: Aprovação
    branch: feat/aprovacao
    como_testar: [ { abrir: / } ]
  - id: C-02
    titulo: Desconto
    arquivos: [src/orcamento/**]
    como_testar: [ { abrir: / } ]
  - id: C-04
    titulo: Agenda
`);

test('glob: ** atravessa pastas, * não', () => {
  assert.ok(globParaRegex('src/**').test('src/a/b.ts'));
  assert.ok(globParaRegex('src/**/x.ts').test('src/x.ts'));
  assert.ok(globParaRegex('src/*.ts').test('src/a.ts'));
  assert.ok(!globParaRegex('src/*.ts').test('src/a/b.ts'));
  assert.ok(!globParaRegex('src/a.ts').test('src/aXts'));
});

test('branch declarada no card tem prioridade, inclusive com nome remoto', () => {
  const v = vincular({ nome: 'origin/feat/aprovacao', semRemoto: 'feat/aprovacao' }, ['src/orcamento/aprovar.ts'], art.cards);
  assert.deepEqual(v.map((x) => [x.card.card.id, x.motivo]), [['C-01', 'branch']]);
});

test('sem branch declarada, liga pelos arquivos em comum', () => {
  const v = vincular({ nome: 'feat/outra', semRemoto: 'feat/outra' }, ['src/orcamento/total.ts', 'README.md'], art.cards);
  assert.deepEqual(v.map((x) => [x.card.card.id, x.motivo, x.arquivosEmComum]), [['C-02', 'arquivos', ['src/orcamento/total.ts']]]);
});

test('pelo artefato, cards sem passos ou inexistentes são recusados com o motivo', () => {
  const { alvos, recusados } = alvosDoArtefato(art.cards, ['C-01', 'C-04', 'C-99']);
  assert.deepEqual(alvos.map((a) => [a.card.card.id, a.branch]), [['C-01', 'feat/aprovacao']]);
  assert.deepEqual(recusados.map((r) => r.id), ['C-04', 'C-99']);
  assert.match(recusados[0]!.motivo, /passo a passo/);
});
