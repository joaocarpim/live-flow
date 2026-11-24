import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerArtefato } from '../src/artefato.ts';
import { montarBlocos, descreverBlocos } from '../src/blocos.ts';

const art = lerArtefato(`cards:
  - id: C-01
    titulo: Aprovação
    branch: feat/aprovacao
    altera: [orcamentos]
    como_testar: [ { abrir: / } ]
  - id: C-05
    titulo: Edição do orçamento
    branch: feat/aprovacao
    altera: [orcamentos]
    como_testar: [ { abrir: / } ]
  - id: C-08
    titulo: Fotos da vistoria
    branch: feat/aprovacao
    como_testar: [ { abrir: / } ]
  - id: C-03
    titulo: Login
    branch: feat/login
    como_testar: [ { abrir: /login } ]
  - id: C-09
    titulo: Recuperar senha
    branch: feat/login
    depende_de: [C-03]
    como_testar: [ { abrir: /senha } ]
  - id: C-12
    titulo: Configurações globais
    branch: feat/aprovacao
    exclusivo: sim
    como_testar: [ { abrir: /config } ]
  - id: C-04
    titulo: Sem passos
  - id: C-13
    titulo: Depende de quem não tem passos
    depende_de: [C-04]
    como_testar: [ { abrir: / } ]
`);
const ids = (p: ReturnType<typeof montarBlocos>) => p.blocos.map((b) => [b.branch, b.sozinho, b.ondas.map((o) => o.map((c) => c.card.id))]);

test('com dados isolados: um bloco por branch, juntos o que não altera a mesma coisa', () => {
  const p = montarBlocos(art.cards, ['C-01', 'C-05', 'C-08', 'C-03', 'C-09', 'C-12'], { dadosIsolados: true });
  assert.deepEqual(ids(p), [
    ['feat/aprovacao', false, [['C-01', 'C-08'], ['C-05']]],
    ['feat/login', false, [['C-03'], ['C-09']]],
    ['feat/aprovacao', true, [['C-12']]],
  ]);
});

test('sem dados isolados: mesmo bloco (um app), mas um card por vez', () => {
  const p = montarBlocos(art.cards, ['C-01', 'C-08'], { dadosIsolados: false });
  assert.deepEqual(ids(p), [['feat/aprovacao', false, [['C-01'], ['C-08']]]]);
  assert.match(descreverBlocos(p), /um card por vez|Um card por vez/);
});

test('dependência entra sozinha e fica antes; dependência sem passos recusa o card', () => {
  const p = montarBlocos(art.cards, ['C-09', 'C-13'], { dadosIsolados: true });
  assert.deepEqual(ids(p), [['feat/login', false, [['C-03'], ['C-09']]]]);
  assert.deepEqual(p.incluidos, [{ id: 'C-03', porque: 'C-09 depende dele' }]);
  assert.deepEqual(p.recusados.map((r) => r.id).sort(), ['C-04', 'C-13']);
  assert.match(p.recusados.find((r) => r.id === 'C-13')!.motivo, /depende de C-04/);
});

test('o mesmo pedido gera sempre os mesmos blocos', () => {
  const a = ids(montarBlocos(art.cards, ['C-08', 'C-01', 'C-05'], { dadosIsolados: true }));
  const b = ids(montarBlocos(art.cards, ['C-05', 'C-08', 'C-01'], { dadosIsolados: true }));
  assert.deepEqual(a, b);
});

test('jornada junta os passos das etapas e herda a branch; ciclo e referência inexistente são apontados', () => {
  const j = lerArtefato(`cards:
  - id: C-01
    titulo: Criar
    branch: feat/x
    criterios: [cria]
    como_testar: [ { abrir: /novo }, { clicar: Criar, criterio: 1 } ]
  - id: C-02
    titulo: Aprovar
    branch: feat/x
    como_testar: [ { abrir: /aprovar }, { ver_texto: Aprovado } ]
  - id: J-01
    titulo: Do orçamento ao aceite
    tipo: jornada
    etapas: [C-01, C-02]
  - id: A
    titulo: a
    depende_de: [B]
    como_testar: [ { abrir: / } ]
  - id: B
    titulo: b
    depende_de: [A]
    como_testar: [ { abrir: / } ]
  - id: Z
    titulo: z
    depende_de: [NAO]
    como_testar: [ { abrir: / } ]
`);
  const jornada = j.cards.find((c) => c.card.id === 'J-01')!;
  assert.equal(jornada.estado, 'pronto');
  assert.equal(jornada.card.branch, 'feat/x');
  assert.deepEqual(jornada.card.como_testar.map((p) => [p.n, p.acao, p.etapa, p.criterio]), [[1, 'abrir', 'C-01', undefined], [2, 'clicar', 'C-01', undefined], [3, 'abrir', 'C-02', undefined], [4, 'ver_texto', 'C-02', undefined]]);
  assert.match(j.cards.find((c) => c.card.id === 'A')!.problemas.join(), /circular/);
  assert.match(j.cards.find((c) => c.card.id === 'Z')!.problemas.join(), /NAO não existe/);
});
