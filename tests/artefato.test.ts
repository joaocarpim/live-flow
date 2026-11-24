import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerArtefato } from '../src/artefato.ts';

const base = (cards: string, sistema = '') => `versao: 1\nsistema:\n  url: http://localhost:3000\n${sistema}cards:\n${cards}`;

test('card com passo a passo válido fica pronto', () => {
  const a = lerArtefato(base(`  - id: C-01\n    titulo: Login\n    criterios: [entra]\n    como_testar:\n      - abrir: /login\n      - clicar: Entrar\n        criterio: 1\n      - ver_texto: Bem-vindo\n`));
  assert.equal(a.cards[0]!.estado, 'pronto');
  assert.deepEqual(a.cards[0]!.card.como_testar.map((p) => p.acao), ['abrir', 'clicar', 'ver_texto']);
  assert.equal(a.cards[0]!.card.como_testar[1]!.criterio, 1);
});

test('card sem passo a passo não pode ser selecionado', () => {
  const a = lerArtefato(base(`  - id: C-04\n    titulo: Agenda\n`));
  assert.equal(a.cards[0]!.estado, 'sem_passos');
  assert.match(a.cards[0]!.problemas.join(), /Falta o passo a passo/);
});

test('ação desconhecida, critério inexistente e primeiro passo errado tornam o card inválido', () => {
  const a = lerArtefato(base(
    `  - id: A\n    titulo: x\n    como_testar:\n      - abrir: /\n      - apertar: Ok\n` +
    `  - id: B\n    titulo: x\n    criterios: [um]\n    como_testar:\n      - abrir: /\n      - clicar: Ok\n        criterio: 3\n` +
    `  - id: C\n    titulo: x\n    como_testar:\n      - clicar: Ok\n`,
  ));
  assert.deepEqual(a.cards.map((c) => c.estado), ['invalido', 'invalido', 'invalido']);
  assert.match(a.cards[0]!.problemas[0]!, /ação desconhecida "apertar"/);
  assert.match(a.cards[1]!.problemas[0]!, /criterio: 3/);
  assert.match(a.cards[2]!.problemas[0]!, /primeiro passo/);
});

test('abrir com endereço completo é recusado (o alvo vem só do sistema)', () => {
  const a = lerArtefato(base(`  - id: C\n    titulo: x\n    como_testar:\n      - abrir: https://app.real.com/login\n`));
  assert.equal(a.cards[0]!.estado, 'invalido');
});

test('id repetido é apontado', () => {
  const a = lerArtefato(base(`  - id: C\n    titulo: x\n  - id: C\n    titulo: y\n`));
  assert.match(a.cards[1]!.problemas.join(), /mais de uma vez/);
});

test('paralelo maior que 1 sem app e banco próprios volta para 1, com aviso', () => {
  const a = lerArtefato(base('', '  paralelo: 3\n'));
  assert.equal(a.sistema.paralelo, 1);
  assert.match(a.problemas.join(), /banco próprio/);
  const b = lerArtefato(base('', '  paralelo: 3\n  iniciar: npm run dev -- --port {{porta}}\n  seed: npm run seed -- {{execucao}}\n'));
  assert.equal(b.sistema.paralelo, 3);
});

test('YAML quebrado vira problema legível, sem exceção', () => {
  const a = lerArtefato('cards: [');
  assert.match(a.problemas[0]!, /não abre/);
});

test('api: método, rota e status validados', () => {
  const a = lerArtefato(base(`  - id: C\n    titulo: x\n    como_testar:\n      - api: { metodo: post, rota: /api/x, status: 201, contem: { ok: true } }\n`));
  const p = a.cards[0]!.card.como_testar[0]!;
  assert.equal(a.cards[0]!.estado, 'pronto');
  assert.ok(p.acao === 'api' && p.metodo === 'POST' && p.status === 201);
});
