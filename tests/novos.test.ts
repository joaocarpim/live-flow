import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerArtefato } from '../src/artefato.ts';
import { sugerirParecidos } from '../src/sugestoes.ts';
import { buscarEmail, extrairLinks } from '../src/email.ts';
import { lerCaminho, caminhoNoSistema, arquivoDoProjeto, ErroPasso } from '../src/runtime/fluxo.ts';
import { prepararCopia, refNoOutroRepo, trocarPortas } from '../src/executar.ts';
import type { ResultadoCard } from '../src/executar.ts';
import { junit, quarentena } from '../src/relatorios.ts';
import type { LinhaHistorico } from '../src/relatorios.ts';
import { instalarHook, segredosUsados, workflowGithub } from '../src/integracoes.ts';
import { limparGravacao, salvarPassos } from '../src/gravar.ts';
import { montarBlocos } from '../src/blocos.ts';
import { descrever } from '../src/descricao.ts';
import { g, repoDeTeste } from './ajuda.ts';

test('contas: login por pessoa, "como" nos passos e regras de reaproveitar', () => {
  const a = lerArtefato(`contas:
  tecnico:
    entrar: [ { abrir: /login }, { clicar: Entrar } ]
    verificar: { ver_texto: Sair }
    reaproveitar: sim
  gestor:
    entrar: [ { abrir: /login } ]
    reaproveitar: sim
cards:
  - id: C-01
    titulo: Vistoria
    como_testar:
      - abrir: /painel
        como: tecnico
      - clicar: Nova vistoria
        como: tecnico
  - id: C-02
    titulo: Conta que não existe
    como_testar:
      - abrir: /
        como: cliente
`);
  assert.equal(a.contas.tecnico!.reaproveitar, true);
  assert.deepEqual(a.contas.tecnico!.verificar!.map((p) => p.acao), ['abrir', 'ver_texto']);
  assert.match(a.problemas.join(), /contas\.gestor: para reaproveitar/);
  assert.equal(a.cards[0]!.estado, 'pronto');
  assert.equal(a.cards[0]!.card.como_testar[1]!.como, 'tecnico');
  assert.equal(descrever(a.cards[0]!.card.como_testar[1]!), '[tecnico] clicar em "Nova vistoria"');
  assert.equal(a.cards[1]!.estado, 'invalido');
  assert.match(a.cards[1]!.problemas.join(), /conta "cliente" não existe/);
});

test('ações novas: guardar, enviar_arquivo, api.guardar, ver_email, conferir_manual, celular e entregue', () => {
  const a = lerArtefato(`cards:
  - id: C-01
    titulo: x
    dispositivo: celular
    entregue: sim
    como_testar:
      - abrir: /
      - guardar: { nome: orc, da_url: "/orcamentos/(\\\\d+)" }
      - enviar_arquivo: { campo: Fotos, arquivos: [.liveflow/arquivos/a.jpg] }
      - api: { metodo: POST, rota: /api/x, status: 201, guardar: { id: dados.id } }
      - ver_email: { para: a@b, assunto: Senha, guardar_link: { nome: link, contem: /redefinir } }
      - conferir_manual: PDF com a logo
  - id: C-02
    titulo: ruins
    como_testar:
      - abrir: /
      - enviar_arquivo: { campo: Fotos, arquivos: [../../etc/passwd] }
  - id: C-03
    titulo: ruins
    como_testar:
      - abrir: /
      - guardar: { nome: orc, da_url: "/orcamentos/\\\\d+" }
`);
  const c = a.cards[0]!;
  assert.equal(c.estado, 'pronto', c.problemas.join());
  assert.equal(c.card.dispositivo, 'celular');
  assert.equal(c.card.entregue, true);
  assert.deepEqual(c.card.como_testar.map((p) => p.acao), ['abrir', 'guardar', 'enviar_arquivo', 'api', 'ver_email', 'conferir_manual']);
  assert.match(a.cards[1]!.problemas.join(), /dentro do projeto/);
  assert.match(a.cards[2]!.problemas.join(), /grupo entre parênteses/);
});

test('serviços: nomes, {{porta}} obrigatório, iniciar sozinho vira o serviço app', () => {
  const a = lerArtefato(`sistema:\n  servicos:\n    - { nome: web, iniciar: "npm run dev -- --port {{porta}}" }\n    - { nome: api, iniciar: "node api.js {{porta}}", repo: ../api, saude: /saude }\n    - { nome: Ruim, iniciar: x }\ncards: []\n`);
  assert.deepEqual(a.sistema.servicos.map((s) => [s.nome, s.repo ?? '.', s.saude]), [['web', '.', '/'], ['api', '../api', '/saude']]);
  assert.match(a.problemas.join(), /servicos\[3\]/);
  assert.deepEqual(lerArtefato('sistema:\n  iniciar: node app.mjs {{porta}}\ncards: []\n').sistema.servicos.map((s) => s.nome), ['app']);
});

test('portas e endereços entre serviços', () => {
  const p = new Map([['web', 4001], ['api', 4002]]);
  assert.equal(trocarPortas('node web.js {{porta}} --api {{url.api}}', 'web', p), 'node web.js 4001 --api http://127.0.0.1:4002');
  assert.equal(trocarPortas('http://127.0.0.1:{{porta}}/', null, p), 'http://127.0.0.1:4001/');
  assert.equal(trocarPortas('http://localhost:{{porta.api}}', null, p), 'http://localhost:4002');
});

test('outro repositório: branch de mesmo nome, senão a base (anotada)', async () => {
  const { repo } = repoDeTeste();
  assert.deepEqual(await refNoOutroRepo(repo, 'feat/aprovacao', 'main'), { ref: 'feat/aprovacao' });
  assert.deepEqual(await refNoOutroRepo(repo, 'origin/feat/remota', 'main'), { ref: 'origin/feat/remota' });
  const r = await refNoOutroRepo(repo, 'feat/so-no-front', 'main');
  assert.equal(r.ref, 'main');
  assert.match(r.observacao!, /não existe feat\/so-no-front/);
});

test('dependências: reaproveita node_modules só com lockfile idêntico', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'lf-dep-'));
  const copia = mkdtempSync(join(tmpdir(), 'lf-dep-c-'));
  mkdirSync(join(repo, 'node_modules'));
  writeFileSync(join(repo, 'package-lock.json'), '{"v":1}');
  writeFileSync(join(copia, 'package-lock.json'), '{"v":1}');
  assert.equal(await prepararCopia(repo, copia, 'exit 1', true), 'reaproveitadas');
  assert.ok(lstatSync(join(copia, 'node_modules')).isSymbolicLink());
  const outra = mkdtempSync(join(tmpdir(), 'lf-dep-d-'));
  writeFileSync(join(outra, 'package-lock.json'), '{"v":2}');
  assert.equal(await prepararCopia(repo, outra, 'touch preparado', true), 'preparado');
  assert.ok(existsSync(join(outra, 'preparado')));
});

test('card entregue roda no código da base, como regressão', () => {
  const a = lerArtefato(`cards:\n  - { id: C-01, titulo: a, branch: feat/a, entregue: sim, como_testar: [ { abrir: / } ] }\n  - { id: C-02, titulo: b, branch: feat/b, como_testar: [ { abrir: / } ] }\n`);
  const p = montarBlocos(a.cards, ['C-01', 'C-02'], { dadosIsolados: false, base: 'main' });
  const mapa = Object.fromEntries(p.blocos.map((b) => [b.branch, b.ondas.flat().map((c) => c.card.id)]));
  assert.deepEqual(mapa, { main: ['C-01'], 'feat/b': ['C-02'] });
});

test('sugestões: texto renomeado aparece como o mais parecido', () => {
  assert.deepEqual(sugerirParecidos('Entrar', ['Cancelar', 'Entrar no sistema', 'Ajuda']).slice(0, 1), ['Entrar no sistema']);
  assert.deepEqual(sugerirParecidos('Salvar orçamento', ['Salvar orcamento ', 'Excluir']), ['Salvar orcamento']);
  assert.deepEqual(sugerirParecidos('Pagar', ['Relatórios', 'Configurações']), []);
});

test('links do e-mail, caminho no JSON, endereço fora do sistema e arquivo fora do projeto', () => {
  assert.deepEqual(extrairLinks('Clique: <a href="http://x.local/redefinir?t=1&amp;u=2">aqui</a> ou http://x.local/ajuda.'), ['http://x.local/redefinir?t=1&u=2', 'http://x.local/ajuda']);
  assert.equal(lerCaminho({ dados: { itens: [{ id: 9 }] } }, 'dados.itens.0.id'), 9);
  assert.equal(caminhoNoSistema('http://127.0.0.1:4000/r?t=1', 'http://127.0.0.1:4000'), '/r?t=1');
  assert.throws(() => caminhoNoSistema('https://evil.com/x', 'http://127.0.0.1:4000'), (e: ErroPasso) => e.tipo === 'seguranca');
  const proj = mkdtempSync(join(tmpdir(), 'lf-proj-'));
  writeFileSync(join(proj, 'a.jpg'), 'x');
  assert.equal(arquivoDoProjeto(proj, 'a.jpg'), join(proj, 'a.jpg'));
  assert.throws(() => arquivoDoProjeto(proj, '../fora.jpg'), (e: ErroPasso) => e.tipo === 'seguranca');
});

test('e-mail: lê do Mailpit só o que chegou depois do início', async () => {
  const agora = new Date();
  const msgs = [
    { ID: 'velho', Subject: 'Redefinir senha', Created: new Date(agora.getTime() - 60_000).toISOString(), To: [{ Address: 'ana@x.local' }], Text: 'http://app/redefinir?t=velho' },
    { ID: 'novo', Subject: 'Redefinir senha', Created: new Date(agora.getTime() + 100).toISOString(), To: [{ Address: 'ana@x.local' }], Text: 'Use http://app/redefinir?t=novo' },
  ];
  const srv = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/api/v1/search') return res.end(JSON.stringify({ messages: msgs }));
    const m = msgs.find((x) => u.pathname.endsWith(x.ID));
    res.end(JSON.stringify({ Subject: m!.Subject, Text: m!.Text }));
  }).listen(0, '127.0.0.1');
  await new Promise((ok) => srv.once('listening', ok));
  const porta = (srv.address() as { port: number }).port;
  try {
    const e = await buscarEmail(`http://127.0.0.1:${porta}`, 'ana@x.local', 'Redefinir', agora, 3000);
    assert.deepEqual(e.links, ['http://app/redefinir?t=novo']);
    await assert.rejects(buscarEmail(`http://127.0.0.1:${porta}`, 'outra@x.local', undefined, agora, 600), /Nenhum e-mail/);
  } finally {
    srv.close();
  }
});

test('JUnit: falha, instável, não rodou e conferência manual', () => {
  const base = { branch: 'feat/x', tentativas: 3, bancoZerado: true, avisos: [], pendencias: [], pasta: '', vizinhos: [] };
  const xml = junit([
    { ...base, card: 'C-01', resultado: 'passou', tentativas: 1, pendencias: ['PDF com <logo>'] },
    { ...base, card: 'C-02', resultado: 'falhou', falha: { passo: 2, descricao: 'clicar em "Entrar"', erro: 'Não encontrei "Entrar"', motivo: 'nao_encontrado' } },
    { ...base, card: 'C-03', resultado: 'instavel' },
    { ...base, card: 'C-04', resultado: 'nao_rodou', motivo: 'sem iniciar' },
  ] as ResultadoCard[]);
  assert.match(xml, /tests="4" failures="1" skipped="2"/);
  assert.match(xml, /<failure message="Não encontrei &quot;Entrar&quot;">/);
  assert.match(xml, /PDF com &lt;logo&gt;/);
});

test('quarentena: instável em 2 das últimas 5', () => {
  const l = (r: LinhaHistorico['resultado']): LinhaHistorico => ({ quando: '', resultado: r, branch: null, tentativas: 1 });
  const h = new Map([['C-01', [l('instavel'), l('passou'), l('instavel')]], ['C-02', [l('instavel'), l('passou'), l('passou'), l('passou'), l('passou'), l('passou')]]]);
  assert.deepEqual(quarentena(h), [{ card: 'C-01', instaveis: 2, de: 3 }]);
});

test('hook de pre-push: instala, reinstala, e não apaga hook alheio sem --forcar', async () => {
  const { repo } = repoDeTeste();
  const arq = await instalarHook(repo);
  assert.match(readFileSync(arq, 'utf8'), /liveflow rodar --da-branch --modo rapido/);
  await instalarHook(repo);
  writeFileSync(arq, '#!/bin/sh\necho meu hook\n');
  await assert.rejects(instalarHook(repo), /--forcar/);
  await instalarHook(repo, true);
  void g;
});

test('workflow do GitHub: PR pela branch, regressão noturna, segredos pelo nome', () => {
  const s = segredosUsados('valor: "{{segredo:senha_teste}}" e {{ segredo:token }} e {{segredo:senha_teste}}');
  assert.deepEqual(s, ['senha_teste', 'token']);
  const w = workflowGithub('main', s);
  assert.match(w, /--da-branch --branch-atual "\$\{\{ github.head_ref \}\}"/);
  assert.match(w, /--regressao/);
  assert.match(w, /LIVEFLOW_SEGREDO_TOKEN: \$\{\{ secrets.LIVEFLOW_SEGREDO_TOKEN \}\}/);
});

test('gravação: junta digitação no mesmo campo e salva no card mantendo comentários', () => {
  assert.deepEqual(limparGravacao([{ abrir: '/' }, { preencher: { campo: 'Nome', valor: 'A' } }, { preencher: { campo: 'Nome', valor: 'Ana' } }, { clicar: 'Salvar' }]), [{ abrir: '/' }, { preencher: { campo: 'Nome', valor: 'Ana' } }, { clicar: 'Salvar' }]);
  const raiz = mkdtempSync(join(tmpdir(), 'lf-grav-'));
  mkdirSync(join(raiz, '.liveflow'));
  writeFileSync(join(raiz, '.liveflow/cards.yaml'), '# meu comentário\ncards:\n  - id: C-04\n    titulo: Agenda # do técnico\n');
  salvarPassos(raiz, 'C-04', [{ abrir: '/agenda' }, { clicar: 'Hoje' }]);
  const texto = readFileSync(join(raiz, '.liveflow/cards.yaml'), 'utf8');
  assert.match(texto, /# meu comentário/);
  assert.match(texto, /# do técnico/);
  assert.equal(lerArtefato(texto).cards[0]!.estado, 'pronto');
});

test('limpeza: apaga só execuções mais antigas que o prazo', async () => {
  const { limparExecucoes } = await import('../src/relatorios.ts');
  const { utimesSync } = await import('node:fs');
  const raiz = mkdtempSync(join(tmpdir(), 'lf-limpa-'));
  for (const d of ['velha', 'nova']) mkdirSync(join(raiz, '.liveflow/execucoes', d), { recursive: true });
  const antigo = new Date(Date.now() - 20 * 24 * 3600 * 1000);
  utimesSync(join(raiz, '.liveflow/execucoes/velha'), antigo, antigo);
  assert.deepEqual(limparExecucoes(raiz, 14), ['velha']);
  assert.ok(existsSync(join(raiz, '.liveflow/execucoes/nova')));
  assert.deepEqual(limparExecucoes(raiz, 0), [], '0 = guardar para sempre');
  assert.equal(lerArtefato('sistema:\n  guardar_dias: 7\ncards: []\n').sistema.guardarDias, 7);
});
