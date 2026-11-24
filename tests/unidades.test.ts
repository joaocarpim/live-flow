import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizarClicavel, localizarCampo, contem, preencherTexto, ErroPasso } from '../src/runtime/fluxo.ts';
import type { Loc, Pagina } from '../src/runtime/fluxo.ts';
import { montarPlano } from '../src/plano.ts';
import { verificarAlvo } from '../src/seguranca.ts';
import { comRepeticao } from '../src/repeticao.ts';
import { impressao, separarNovos, classificarRegressao } from '../src/comparacao.ts';
import { lerArtefato } from '../src/artefato.ts';
import { promptPassos, promptResolver } from '../src/prompts.ts';

// Página falsa: cada busca devolve quantos elementos "existem".
function pagina(mapa: Record<string, number>): Pagina & { usado: string[] } {
  const usado: string[] = [];
  const loc = (chave: string): Loc => ({
    count: async () => mapa[chave] ?? 0,
    click: async () => void usado.push(chave), fill: async () => void usado.push(chave), check: async () => undefined,
    selectOption: async () => undefined, waitFor: async () => undefined, first() { return this; },
  });
  return {
    usado,
    getByRole: (r, o) => loc(`role:${r}:${o.name}`),
    getByLabel: (t) => loc(`label:${t}`),
    getByPlaceholder: (t) => loc(`placeholder:${t}`),
    getByText: (t) => loc(`text:${t}`),
  };
}

test('clicar: acha pelo papel acessível antes do texto solto', async () => {
  const p = pagina({ 'role:button:Aprovar': 1, 'text:Aprovar': 3 });
  await (await localizarClicavel(p, 'Aprovar')).click();
  assert.deepEqual(p.usado, ['role:button:Aprovar']);
});

test('clicar: dois botões iguais = falha por ambiguidade, nunca chute', async () => {
  await assert.rejects(localizarClicavel(pagina({ 'role:button:Salvar': 2 }), 'Salvar'), (e: ErroPasso) => e.tipo === 'ambiguo' && /2 elementos/.test(e.message));
});

test('clicar: não encontrado explica onde procurou', async () => {
  await assert.rejects(localizarClicavel(pagina({}), 'Pagar'), (e: ErroPasso) => e.tipo === 'nao_encontrado');
});

test('campo: rótulo primeiro, depois placeholder', async () => {
  const p = pagina({ 'placeholder:E-mail': 1 });
  await (await localizarCampo(p, 'E-mail')).fill('x');
  assert.deepEqual(p.usado, ['placeholder:E-mail']);
});

test('contem: comparação parcial e profunda com mensagem do caminho', () => {
  assert.equal(contem({ status: 'aprovado', itens: [{ id: 1 }] }, { status: 'aprovado', extra: 1, itens: [{ id: 1, q: 2 }] }), null);
  assert.match(contem({ cliente: { cpf: '***' } }, { cliente: { cpf: '123' } })!, /cliente\.cpf/);
});

test('variáveis e segredos: segredo vem do ambiente e nunca do arquivo', () => {
  assert.equal(preencherTexto('{{usuario}} / {{segredo:senha_teste}}', { usuario: 'a@b' }, { LIVEFLOW_SEGREDO_SENHA_TESTE: 'xyz' }), 'a@b / xyz');
  assert.throws(() => preencherTexto('{{segredo:token}}', {}, {}), /LIVEFLOW_SEGREDO_TOKEN/);
  assert.throws(() => preencherTexto('{{nada}}', {}, {}), /Variável "nada"/);
});

test('plano: modo, motivo de "não se aplica" e o que ainda não existe ficam explícitos', () => {
  const card = lerArtefato(`cards:\n  - id: C\n    titulo: x\n    como_testar: [ { abrir: / } ]\n    testes: { upload: nao }\n`).cards[0]!.card;
  const rapido = montarPlano({ card, arquivos: [], modo: 'rapido' });
  const est = (id: string, p = rapido) => p.find((x) => x.camada.id === id)!;
  assert.equal(est('fluxo').estado, 'vai_rodar');
  assert.equal(est('vizinhos').estado, 'outro_modo');
  assert.equal(est('upload').estado, 'nao_se_aplica');
  assert.match(est('upload').motivo!, /upload: nao/);
  assert.equal(est('migracao').estado, 'nao_se_aplica');
  assert.equal(est('estatica').estado, 'ainda_nao_implementada');
  const completo = montarPlano({ card, arquivos: ['db/migrations/002.sql'], modo: 'completo' });
  assert.equal(est('migracao', completo).estado, 'ainda_nao_implementada');
  assert.equal(est('vizinhos', completo).estado, 'vai_rodar');
  assert.equal(est('carga', completo).estado, 'nao_se_aplica');
});

test('trava de alvo: só permitidos, produção nunca', () => {
  const s = { permitidos: ['localhost', 'staging.local:8080'], producao: ['app.real.com'] };
  assert.equal(verificarAlvo('http://localhost:3000', s), null);
  assert.equal(verificarAlvo('http://staging.local:8080/x', s), null);
  assert.match(verificarAlvo('https://app.real.com', { ...s, permitidos: ['app.real.com'] })!, /produção/);
  assert.match(verificarAlvo('http://outro.com', s)!, /não está em sistema.permitidos/);
  assert.match(verificarAlvo('file:///etc/passwd', s)!, /http/);
});

test('repetição: passou, falha confirmada 3/3 e instável', async () => {
  assert.deepEqual(await comRepeticao(async () => true), { resultado: 'passou', tentativas: 1 });
  assert.deepEqual(await comRepeticao(async () => false), { resultado: 'falhou', certeza: 'confirmado', tentativas: 3 });
  let n = 0;
  assert.deepEqual(await comRepeticao(async () => ++n === 3), { resultado: 'instavel', tentativas: 3, falhas: 2 });
});

test('comparação: o mesmo problema com números diferentes é "já existia"; regressão de vizinho', () => {
  const a = { camada: 'fluxo', regra: 'erro_500', alvo: 'GET /recibos/:id', mensagem: 'respondeu 500 em 38 ms' };
  assert.equal(impressao(a), impressao({ ...a, mensagem: 'respondeu 500 em 41 ms' }));
  const r = separarNovos([a, { ...a, alvo: 'POST /login' }], [{ ...a, mensagem: 'respondeu 500 em 12 ms' }]);
  assert.deepEqual(r.map((x) => x.origem), ['ja_existia', 'novo']);
  assert.equal(classificarRegressao(false, true), 'quebrou_nesta_branch');
  assert.equal(classificarRegressao(false, false), 'ja_quebrado_na_base');
  assert.equal(classificarRegressao(true, false), 'ok');
});

test('prompts: nunca levam valor de segredo e pedem teste antes da correção', () => {
  const card = lerArtefato(`cards:\n  - id: C-03\n    titulo: Login\n    criterios: [entra, bloqueia]\n`).cards[0]!.card;
  const p = promptPassos(card);
  assert.match(p, /\{\{segredo:nome\}\}/);
  assert.match(p, /1\. entra/);
  const r = promptResolver({ card, branch: 'feat/login', passo: 4, descricaoPasso: 'clicar em "Entrar"', erro: 'Não encontrei "Entrar"', tentativas: 3, bancoZerado: false, evidencias: ['falha.png'] });
  assert.match(r, /falhou 3 de 3/);
  assert.match(r, /banco não foi zerado/, 'não afirma o que não aconteceu');
  assert.match(r, /primeiro um teste que reproduz/);
});
