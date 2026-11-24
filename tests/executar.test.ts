import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerArtefato } from '../src/artefato.ts';
import { montarBlocos } from '../src/blocos.ts';
import { executar } from '../src/executar.ts';
import type { OpcoesExecucao } from '../src/executar.ts';
import { Registro } from '../src/eventos.ts';
import type { EntradaFluxo } from '../src/runtime/fluxo.ts';
import { APP, commit, g, repoDeTeste } from './ajuda.ts';

const { repo } = repoDeTeste();

function preparar(yamlSistema: string, ids: string[], executorFluxo: OpcoesExecucao['executorFluxo'], extra: Partial<OpcoesExecucao> = {}) {
  const art = lerArtefato(`sistema:\n${yamlSistema}cards:
  - id: C-01
    titulo: Aprovação
    branch: feat/aprovacao
    como_testar: [ { abrir: / }, { ver_texto: ok } ]
  - id: C-02
    titulo: Desconto (vizinho)
    arquivos: [src/orcamento/**]
    como_testar: [ { abrir: / } ]
  - id: C-09
    titulo: Sem branch
    como_testar: [ { abrir: / } ]
  - id: C-10
    titulo: Outro card da mesma branch
    branch: feat/aprovacao
    como_testar: [ { abrir: / } ]
  - id: C-11
    titulo: Depende da aprovação
    branch: feat/aprovacao
    depende_de: [C-01]
    como_testar: [ { abrir: / } ]
`);
  assert.deepEqual(art.problemas, []);
  const pasta = mkdtempSync(join(tmpdir(), 'lf-exec-'));
  const registro = new Registro(join(pasta, 'events.ndjson'));
  const { blocos } = montarBlocos(art.cards, ids, { dadosIsolados: art.sistema.paralelo > 1 });
  return { o: { repo, artefato: art, blocos, aoVivo: false, modo: 'rapido' as const, registro, pasta, executorFluxo, ...extra }, pasta };
}

/** Executor falso que olha o que está no ar de verdade: prova qual código foi testado. */
const conteudoNoAr = async (e: EntradaFluxo) => (await (await fetch(e.baseUrl)).text());

test('sem "iniciar", recusa testar uma branch que não é o checkout atual (não dá para garantir o código)', async () => {
  const { o } = preparar('  url: http://localhost:3999\n', ['C-01'], async () => 0);
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'nao_rodou');
  assert.match(r!.motivo!, /checkout atual \(main\), não feat\/aprovacao/);
});

test('alvo fora da lista de permitidos é bloqueado antes de qualquer coisa', async () => {
  let chamou = false;
  const { o } = preparar('  url: http://app.real.com\n  producao: [app.real.com]\n', ['C-09'], async () => ((chamou = true), 0));
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'nao_rodou');
  assert.match(r!.motivo!, /produção/);
  assert.equal(chamou, false);
});

const SIS = (seedLog: string) => `  url: http://127.0.0.1:{{porta}}\n  permitidos: [127.0.0.1]\n  iniciar: node app.mjs --porta {{porta}}\n  seed: echo {{execucao}} >> ${seedLog}\n`;

test('com "iniciar", sobe a branch numa cópia isolada e testa o código dela', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 'seed.log');
  let visto = '';
  const { o, pasta } = preparar(SIS(log), ['C-01'], async (e) => ((visto = await conteudoNoAr(e)), visto.includes('aprovacao') ? 0 : 1));
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'passou');
  assert.match(visto, /aprovacao/, 'o app no ar era o da branch, não o da main');
  assert.equal(r!.sha?.length, 40);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['C-01-1'], 'banco zerado antes da tentativa');
  const tipos = readFileSync(join(pasta, 'events.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).tipo);
  for (const t of ['execucao_inicio', 'copia_pronta', 'app_no_ar', 'tentativa', 'card_fim', 'execucao_fim']) assert.ok(tipos.includes(t), t);
  assert.ok(existsSync(join(pasta, 'resultado.json')));
});

test('falha só é confirmada depois de 3 tentativas, com banco zerado em cada uma', async () => {
  const log = join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 'seed.log');
  const { o } = preparar(SIS(log), ['C-01'], async (_e, ev) => (ev({ tipo: 'passo_falhou', n: 2, erro: 'O texto "ok" não apareceu', motivo: 'texto' }), 1));
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'falhou');
  assert.equal(r!.certeza, 'confirmado');
  assert.equal(r!.tentativas, 3);
  assert.equal(r!.falha!.passo, 2);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['C-01-1', 'C-01-2', 'C-01-3']);
});

test('falha que some numa repetição vira instável, não falha', async () => {
  let n = 0;
  const { o } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-01'], async () => (++n === 1 ? 1 : 0));
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'instavel');
});

test('Playwright ausente vira "não rodou" com a instrução, sem repetir à toa', async () => {
  let chamadas = 0;
  const { o } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-01'], async (_e, ev) => (chamadas++, ev({ tipo: 'ambiente', erro: 'Playwright não está instalado no projeto.' }), 2));
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'nao_rodou');
  assert.match(r!.motivo!, /Playwright/);
  assert.equal(chamadas, 1);
});

test('vizinho que passa na base e quebra na branch é regressão desta branch', async () => {
  const { o } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-01'], async (e) => {
    const html = await conteudoNoAr(e);
    if (e.card === 'C-01') return 0;
    return html.includes('base') ? 0 : 1; // C-02 só funciona com o código da main
  }, { modo: 'completo' });
  const [r] = await executar(o);
  assert.equal(r!.resultado, 'passou');
  assert.deepEqual(r!.vizinhos.map((v) => [v.card, v.resultado]), [['C-02', 'quebrou_nesta_branch']]);
});

test('com mais de um card, nunca roda ao vivo', async () => {
  const vistos: boolean[] = [];
  const { o } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-01', 'C-09'], async (e) => (vistos.push(e.aoVivo), 0), { aoVivo: true });
  await executar(o);
  assert.deepEqual(vistos, [false, false]);
});

test('cards da mesma branch dividem um app só (um bloco)', async () => {
  const { o, pasta } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-01', 'C-10'], async (e) => ((await conteudoNoAr(e)).includes('aprovacao') ? 0 : 1));
  const res = await executar(o);
  assert.deepEqual(res.map((r) => [r.card, r.resultado]), [['C-01', 'passou'], ['C-10', 'passou']]);
  const eventos = readFileSync(join(pasta, 'events.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(eventos.filter((e) => e.tipo === 'app_no_ar').length, 1);
  assert.equal(eventos.filter((e) => e.tipo === 'bloco_inicio').length, 1);
});

test('se a dependência falha, o card dependente não roda e diz por quê', async () => {
  const chamados: string[] = [];
  const { o } = preparar(SIS(join(mkdtempSync(join(tmpdir(), 'lf-seed-')), 's.log')), ['C-11'], async (e) => (chamados.push(e.card), e.card === 'C-01' ? 1 : 0));
  const res = await executar(o);
  assert.deepEqual(res.map((r) => [r.card, r.resultado]), [['C-01', 'falhou'], ['C-11', 'nao_rodou']]);
  assert.match(res[1]!.motivo!, /depende de C-01, que falhou/);
  assert.ok(!chamados.includes('C-11'));
});

test('frontend e API em repositórios separados: cada um no código certo, e anotado', async () => {
  // API em outro repositório: tem feat/aprovacao, não tem feat/sem-card.
  const api = mkdtempSync(join(tmpdir(), 'lf-api-'));
  g(api, 'init', '-q', '-b', 'main');
  commit(api, 'api base', { 'api.mjs': APP('api-base') });
  g(api, 'checkout', '-q', '-b', 'feat/aprovacao');
  commit(api, 'api aprovacao', { 'api.mjs': APP('api-aprovacao') });
  g(api, 'checkout', '-q', 'main');
  const sistema = `  url: http://127.0.0.1:{{porta}}\n  permitidos: [127.0.0.1]\n  servicos:\n    - { nome: web, iniciar: "node app.mjs {{porta}}" }\n    - { nome: api, iniciar: "node api.mjs {{porta}}", repo: ${api} }\n`;
  const art = lerArtefato(`sistema:\n${sistema}cards:\n  - { id: C-01, titulo: a, branch: feat/aprovacao, como_testar: [ { abrir: / } ] }\n  - { id: C-05, titulo: b, branch: feat/sem-card, como_testar: [ { abrir: / } ] }\n`);
  assert.deepEqual(art.problemas, []);
  const pasta = mkdtempSync(join(tmpdir(), 'lf-exec-'));
  const vistos: Record<string, string> = {};
  const { blocos } = montarBlocos(art.cards, ['C-01', 'C-05'], { dadosIsolados: false });
  const res = await executar({
    repo, artefato: art, blocos, aoVivo: false, modo: 'rapido', registro: new Registro(join(pasta, 'events.ndjson')), pasta,
    executorFluxo: async (e) => ((vistos[e.card] = await conteudoNoAr(e)), 0),
  });
  const c01 = res.find((r) => r.card === 'C-01')!;
  const c05 = res.find((r) => r.card === 'C-05')!;
  assert.deepEqual(c01.codigo!.map((c) => [c.servico, c.ref, c.observacao ?? '']), [['web', 'feat/aprovacao', ''], ['api', 'feat/aprovacao', '']]);
  assert.deepEqual(c05.codigo!.map((c) => [c.servico, c.ref]), [['web', 'feat/sem-card'], ['api', 'main']]);
  assert.match(c05.codigo![1]!.observacao!, /não existe feat\/sem-card/);
  assert.match(vistos['C-01']!, /aprovacao/);
  assert.match(vistos['C-05']!, /base/, 'feat/sem-card não muda o app.mjs');
});
