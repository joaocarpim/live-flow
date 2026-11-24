// liveflow: CLI. A extensão do VS Code vai chamar estes mesmos comandos e ler o mesmo events.ndjson.
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import { carregarArtefato, CAMINHO_ARTEFATO } from './artefato.ts';
import { alvosDasBranches } from './fontes.ts';
import { montarBlocos, descreverBlocos } from './blocos.ts';
import { atualizarRemotas, arquivosMudados, branchAtual, listarBranches } from './git.ts';
import { montarPlano } from './plano.ts';
import type { Modo } from './plano.ts';
import { promptArtefatoDasBranches, promptPassos, promptResolver } from './prompts.ts';
import { Registro } from './eventos.ts';
import { executar, subirParaUso } from './executar.ts';
import { adicionarCards, gravar, salvarPassos } from './gravar.ts';
import { diagnosticar } from './ambiente.ts';
import { junit, lerHistorico, quarentena } from './relatorios.ts';
import { gerarWorkflow, instalarHook, segredosUsados } from './integracoes.ts';
import type { ResultadoCard } from './executar.ts';

const AJUDA = `liveflow 0.1: testa o fluxo de tela de cada card, em blocos

Testar
  liveflow cards                         lista os cards e quais podem ser testados
  liveflow blocos <card...> | --todos    mostra como os cards vão ser agrupados
  liveflow rodar <card...> | --todos     testa os cards, bloco por bloco
        [--modo rapido|completo|noturno] [--ao-vivo] [--json]
  liveflow plano <card> [--modo m]       o que cada camada vai fazer neste card
  liveflow rodar --da-branch             só os cards da branch atual (o hook de pre-push usa este)
  liveflow rodar --regressao             cards entregues, no código da base (toda noite)
        [--junit arquivo.xml]            relatório para CI
  liveflow historico [card...]           últimas execuções e quarentena de instáveis
  liveflow prompt resolver <card>        texto para o Claude corrigir a última falha

Criar cards
  liveflow iniciar                       cria ${CAMINHO_ARTEFATO} de exemplo
  liveflow branches [--sem-remotas] [--atualizar]
  liveflow mapear --branches a,b         quais branches já têm card
  liveflow rascunho --branches a,b       cards em rascunho (sem passos) a partir das branches
  liveflow prompt artefato --branches a,b
  liveflow prompt passos <card>          texto para o Claude escrever o passo a passo
  liveflow gravar <card> [--caminho /x] [--salvar]   faça o fluxo no navegador e vire passo a passo

Automatizar
  liveflow hook instalar                 roda os cards da branch antes de cada push
  liveflow ci gerar                      cria o workflow do GitHub (PR + regressão noturna)`;

const { values: op, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    branches: { type: 'string' },
    modo: { type: 'string', default: 'completo' },
    'ao-vivo': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    atualizar: { type: 'boolean', default: false },
    'sem-remotas': { type: 'boolean', default: false },
    todos: { type: 'boolean', default: false },
    'da-branch': { type: 'boolean', default: false },
    'branch-atual': { type: 'string' },
    regressao: { type: 'boolean', default: false },
    junit: { type: 'string' },
    caminho: { type: 'string', default: '/' },
    salvar: { type: 'boolean', default: false },
    'sem-janela': { type: 'boolean', default: false },
    forcar: { type: 'boolean', default: false },
    pasta: { type: 'string' },
    repo: { type: 'string' },
    ajuda: { type: 'boolean', short: 'h', default: false },
  },
});

const repo = op.repo ?? process.cwd();
const [cmd, ...args] = positionals;
const listaBranches = () => (op.branches ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const modo = (['rapido', 'completo', 'noturno'].includes(op.modo!) ? op.modo : 'completo') as Modo;
const saida = (x: unknown, texto: () => string) => console.log(op.json ? JSON.stringify(x, null, 2) : texto());

async function main(): Promise<number> {
  if (!cmd || op.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  if (cmd === 'iniciar') return iniciar();
  const art = carregarArtefato(repo);
  const avisosArquivo = () => art.problemas.forEach((p) => console.error(`aviso: ${p}`));

  switch (cmd) {
    case 'cards': {
      avisosArquivo();
      saida(art.cards, () =>
        art.cards
          .map((c) => {
            const marca = c.estado === 'pronto' ? '✓ pronto    ' : c.estado === 'sem_passos' ? '– sem passos' : '✗ inválido  ';
            const linha = `${marca} ${c.card.id.padEnd(8)} ${c.card.titulo}${c.card.branch ? `  (${c.card.branch})` : ''}`;
            return c.estado === 'pronto' ? linha : `${linha}\n               ${c.problemas.join('\n               ')}`;
          })
          .join('\n') || 'Nenhum card.',
      );
      return 0;
    }
    case 'branches': {
      if (op.atualizar) await atualizarRemotas(repo);
      const bs = await listarBranches(repo, { remotas: !op['sem-remotas'] });
      const atual = await branchAtual(repo);
      saida(bs, () => bs.map((b) => `${b.nome === atual ? '*' : ' '} ${b.tipo === 'local' ? 'local ' : 'remota'}  ${b.nome}`).join('\n'));
      return 0;
    }
    case 'mapear':
    case 'rascunho': {
      const bs = listaBranches();
      if (!bs.length) throw new Error('Informe --branches a,b');
      const alvos = await alvosDasBranches(repo, art.sistema.base, bs, art.cards);
      if (cmd === 'rascunho') {
        const cards = alvos.filter((a) => a.rascunho).map((a) => {
          const r = a.rascunho!;
          return { id: r.id, titulo: r.titulo, branch: r.branch, arquivos: r.arquivos, criterios: [], como_testar: [] };
        });
        if (op.salvar && cards.length) {
          const novos = adicionarCards(repo, cards);
          console.log(op.json ? JSON.stringify({ adicionados: novos }) : `Adicionados ao artefato: ${novos.join(', ') || 'nenhum (já existiam)'}.`);
          return 0;
        }
        console.log(op.json ? JSON.stringify({ cards }) : cards.length ? stringify({ cards }) : '# Todas as branches já têm card.');
        return 0;
      }
      saida(alvos, () =>
        alvos
          .map((a) => {
            const cab = `${a.branch}  ·  ${a.commits.length} commit(s), ${a.arquivos.length} arquivo(s) desde ${a.base}`;
            const linhas = a.cards.map((v) => `   ${v.card.estado === 'pronto' ? '✓' : '–'} ${v.card.card.id} ${v.card.card.titulo}  [por ${v.motivo === 'branch' ? 'branch declarada' : `arquivos: ${v.arquivosEmComum?.slice(0, 3).join(', ')}`}]`);
            if (a.rascunho) linhas.push(`   sem card · rascunho sugerido: ${a.rascunho.id} "${a.rascunho.titulo}" (falta o passo a passo)`);
            return [cab, ...linhas].join('\n');
          })
          .join('\n\n'),
      );
      return 0;
    }
    case 'plano': {
      const c = art.cards.find((x) => x.card.id === args[0]);
      if (!c) throw new Error(`Card ${args[0] ?? '(nenhum)'} não encontrado.`);
      const arquivos = c.card.branch ? (await arquivosMudados(repo, art.sistema.base, c.card.branch).catch(() => [])).map((a) => a.caminho) : [];
      const plano = montarPlano({ card: c.card, arquivos, modo });
      const rotulo = { vai_rodar: 'vai rodar', nao_se_aplica: 'não se aplica', outro_modo: 'outro modo', ainda_nao_implementada: 'ainda não roda' } as const;
      saida(plano.map((p) => ({ camada: p.camada.id, estado: p.estado, motivo: p.motivo })), () => {
        let grupo = '';
        return plano
          .map((p) => {
            const cab = p.camada.grupo !== grupo ? `\n${(grupo = p.camada.grupo)}\n` : '';
            return `${cab}  ${p.camada.nome.padEnd(36)} ${rotulo[p.estado].padEnd(16)}   ${p.motivo ?? ''}`;
          })
          .join('\n')
          .trim();
      });
      return 0;
    }
    case 'blocos':
    case 'rodar': {
      avisosArquivo();
      const prontos = art.cards.filter((c) => c.estado === 'pronto');
      let ids = args;
      if (op.todos) ids = prontos.map((c) => c.card.id);
      else if (op.regressao) ids = prontos.filter((c) => c.card.entregue).map((c) => c.card.id);
      else if (op['da-branch']) {
        const atual = op['branch-atual'] || (await branchAtual(repo));
        if (!atual) throw new Error('Não estou em nenhuma branch (HEAD solto). Use --branch-atual nome.');
        ids = prontos.filter((c) => !c.card.entregue && c.card.branch && (c.card.branch === atual || c.card.branch.replace(/^origin\//, '') === atual)).map((c) => c.card.id);
        if (!ids.length) {
          console.log(`Nenhum card pronto da branch ${atual}. Nada a testar.`);
          return 0;
        }
      }
      if (!ids.length) throw new Error('Informe os cards (ex.: liveflow rodar C-01 C-02) ou use --todos, --da-branch ou --regressao.');
      const plano = montarBlocos(art.cards, ids, { dadosIsolados: art.sistema.paralelo > 1, base: art.sistema.base });
      if (cmd === 'blocos') {
        saida(plano, () => descreverBlocos(plano));
        return plano.blocos.length ? 0 : 1;
      }
      if (!op.json) console.log(descreverBlocos(plano) + '\n');
      if (!plano.blocos.length) {
        console.error('Nada para testar.');
        return 1;
      }
      const pasta = op.pasta ?? join(repo, '.liveflow', 'execucoes', new Date().toISOString().replace(/[:.]/g, '-'));
      const registro = new Registro(join(pasta, 'events.ndjson'));
      if (!op.json) registro.ouvintes.push(mostrarAoVivo);
      const res = await executar({ repo, artefato: art, blocos: plano.blocos, aoVivo: op['ao-vivo']!, modo, registro, pasta });
      if (op.junit) writeFileSync(op.junit, junit(res));
      if (op.json) console.log(JSON.stringify(res, null, 2));
      else resumo(res, pasta);
      return res.some((r) => r.resultado === 'falhou' || r.vizinhos.some((v) => v.resultado === 'quebrou_nesta_branch')) ? 1 : 0;
    }
    case 'prompt': {
      const [tipo, id] = args;
      if (tipo === 'passos') {
        const c = art.cards.find((x) => x.card.id === id);
        if (!c) throw new Error(`Card ${id ?? '(nenhum)'} não encontrado.`);
        const ctx = c.card.branch ? (await alvosDasBranches(repo, art.sistema.base, [c.card.branch], art.cards).catch(() => []))[0] : undefined;
        console.log(promptPassos(c.card, ctx));
      } else if (tipo === 'artefato') {
        console.log(promptArtefatoDasBranches(await alvosDasBranches(repo, art.sistema.base, listaBranches(), art.cards)));
      } else if (tipo === 'resolver') {
        const r = ultimaFalha(id);
        const c = art.cards.find((x) => x.card.id === id);
        if (!r?.falha || !c) throw new Error(`Nenhuma falha registrada para ${id ?? '(nenhum)'}. Rode o card primeiro.`);
        console.log(promptResolver({ card: c.card, branch: r.branch, passo: r.falha.passo, descricaoPasso: r.falha.descricao, erro: r.falha.erro, tentativas: r.tentativas, bancoZerado: r.bancoZerado ?? false, ...(r.falha.sugestoes ? { sugestoes: r.falha.sugestoes } : {}), ...(r.falha.url ? { url: r.falha.url } : {}), evidencias: [r.falha.print, join(r.pasta, `tentativa-${r.tentativas}`, 'trace.zip')].filter((x): x is string => !!x) }));
      } else throw new Error('Use: prompt passos <card> | prompt artefato --branches a,b | prompt resolver <card>');
      return 0;
    }
    case 'segredos': {
      const texto = existsSync(join(repo, CAMINHO_ARTEFATO)) ? readFileSync(join(repo, CAMINHO_ARTEFATO), 'utf8') : '';
      const nomes = segredosUsados(texto).map((n) => ({ nome: n, variavel: `LIVEFLOW_SEGREDO_${n.toUpperCase()}`, definido: process.env[`LIVEFLOW_SEGREDO_${n.toUpperCase()}`] !== undefined }));
      saida(nomes, () => nomes.map((n) => `${n.definido ? '✓' : '✗'} ${n.nome}  (${n.variavel})`).join('\n') || 'O artefato não usa segredos.');
      return 0;
    }
    case 'ambiente': {
      const info = await diagnosticar(repo, art);
      saida(info, () => info.itens.map((i) => `${i.ok ? '✓' : '✗'} ${i.nome.padEnd(28)} ${i.detalhe}`).join('\n'));
      return info.itens.every((i) => i.ok || i.opcional) ? 0 : 1;
    }
    case 'gravar': {
      const c = art.cards.find((x) => x.card.id === args[0]);
      if (!c) throw new Error(`Card ${args[0] ?? '(nenhum)'} não encontrado. Crie o card (id e título) antes de gravar.`);
      const pasta = join(repo, '.liveflow', 'execucoes', `gravacao-${Date.now()}`);
      const ambiente = await subirParaUso(repo, art, c.card.branch ?? 'HEAD', new Registro(join(pasta, 'events.ndjson')));
      try {
        const g = await gravar({ projeto: repo, baseUrl: ambiente.url, caminho: op.caminho!, visivel: !op['sem-janela'] });
        console.log(`Gravando ${c.card.id} em ${ambiente.url}${op.caminho}. Faça o fluxo no navegador e feche a janela para terminar.`);
        await g.fechado;
        const passos = await g.parar();
        console.log(stringify({ como_testar: passos }));
        console.log('Confira os textos, troque valores fixos por {{variaveis}} e acrescente ver_texto / ver_url: são eles que provam o resultado.');
        if (op.salvar) {
          salvarPassos(repo, c.card.id, passos);
          console.log(`Passos salvos no card ${c.card.id}.`);
        }
      } finally {
        await ambiente.parar();
      }
      return 0;
    }
    case 'historico': {
      const h = lerHistorico(repo);
      const q = quarentena(h);
      const cards = args.length ? args : [...h.keys()];
      const marca = { passou: '✓', falhou: '✗', instavel: '~', nao_rodou: '–', nao_se_aplica: '–' } as const;
      saida({ historico: Object.fromEntries(cards.map((k) => [k, h.get(k) ?? []])), quarentena: q }, () =>
        [
          ...cards.map((k) => `${k.padEnd(8)} ${(h.get(k) ?? []).slice(-15).map((l) => marca[l.resultado]).join(' ') || 'sem execuções'}`),
          q.length ? `\nEm quarentena (instável em 2+ das últimas 5): ${q.map((x) => `${x.card} (${x.instaveis}/${x.de})`).join(', ')}` : '\nNenhum card em quarentena.',
        ].join('\n'),
      );
      return 0;
    }
    case 'hook': {
      if (args[0] !== 'instalar') throw new Error('Use: liveflow hook instalar [--forcar]');
      console.log(`Hook instalado: ${await instalarHook(repo, op.forcar)}. Antes de cada push, os cards da branch rodam no modo rápido.`);
      return 0;
    }
    case 'ci': {
      if (args[0] !== 'gerar') throw new Error('Use: liveflow ci gerar [--forcar]');
      const texto = existsSync(join(repo, CAMINHO_ARTEFATO)) ? readFileSync(join(repo, CAMINHO_ARTEFATO), 'utf8') : '';
      const segredos = segredosUsados(texto);
      console.log(`Criado ${gerarWorkflow(repo, art.sistema.base, segredos, op.forcar)}.${segredos.length ? ` Cadastre no GitHub os segredos: ${segredos.map((s) => `LIVEFLOW_SEGREDO_${s.toUpperCase()}`).join(', ')}.` : ''}`);
      return 0;
    }
    default:
      console.log(AJUDA);
      return 1;
  }
}

const avisosVistos = new Set<string>();
function mostrarAoVivo(e: { tipo: string; card?: string; [k: string]: unknown }): void {
  const c = e.card ? `${e.card} ` : '';
  if (e.tipo === 'aviso') {
    const chave = `${e.card}|${e.mensagem}`;
    if (avisosVistos.has(chave)) return;
    avisosVistos.add(chave);
  }
  if (e.tipo === 'tentativa' && e.n !== 1) console.log(`${c}  repetindo para confirmar (tentativa ${e.n} de 3)`);
  if (e.tipo === 'app_no_ar') console.log(`${c}  app da branch no ar em ${e.url} (${String(e.sha).slice(0, 7)})`);
  if (e.tipo === 'passo_ok') console.log(`${c}  ✓ passo ${e.n}`);
  if (e.tipo === 'passo_falhou') console.log(`${c}  ✗ passo ${e.n}: ${e.erro}`);
  if (e.tipo === 'aviso') console.log(`${c}  ! ${e.mensagem}`);
}

function resumo(res: ResultadoCard[], pasta: string): void {
  console.log('');
  for (const r of res) {
    const t = { passou: '✓ passou', falhou: `✗ falhou (confirmado ${r.tentativas}/${r.tentativas})`, instavel: '~ instável (quarentena)', nao_rodou: '– não rodou', nao_se_aplica: '– não se aplica' }[r.resultado];
    console.log(`${r.card.padEnd(8)} ${t}${r.branch ? `  · ${r.branch}${r.sha ? ` @ ${r.sha.slice(0, 7)}` : ''}` : ''}`);
    if (r.motivo) console.log(`         ${r.motivo}`);
    for (const cod of r.codigo ?? []) if (cod.observacao || r.codigo!.length > 1) console.log(`         ${cod.servico}: ${cod.ref} @ ${cod.sha.slice(0, 7)}${cod.observacao ? ` (${cod.observacao})` : ''}`);
    for (const pend of r.pendencias) console.log(`         ☐ conferir à mão: ${pend}`);
    if (r.falha && r.resultado !== 'passou') console.log(`         passo ${r.falha.passo}: ${r.falha.erro}\n         corrigir com o Claude: liveflow prompt resolver ${r.card}`);
    for (const v of r.vizinhos) console.log(`         vizinho ${v.card}: ${{ ok: 'ok', quebrou_nesta_branch: 'QUEBROU nesta branch (passa na base)', ja_quebrado_na_base: 'já falhava na base', nao_rodou: `não rodou (${v.motivo})` }[v.resultado]}`);
  }
  console.log(`\nEvidências e eventos: ${pasta}`);
}

function ultimaFalha(id?: string): ResultadoCard | undefined {
  const base = join(repo, '.liveflow', 'execucoes');
  if (!id || !existsSync(base)) return undefined;
  for (const d of readdirSync(base).sort().reverse()) {
    const arq = join(base, d, 'resultado.json');
    if (!existsSync(arq)) continue;
    const r = (JSON.parse(readFileSync(arq, 'utf8')) as ResultadoCard[]).find((x) => x.card === id && x.falha);
    if (r) return r;
  }
  return undefined;
}

function iniciar(): number {
  const arq = join(repo, CAMINHO_ARTEFATO);
  if (existsSync(arq)) {
    console.error(`${CAMINHO_ARTEFATO} já existe.`);
    return 1;
  }
  mkdirSync(join(repo, '.liveflow'), { recursive: true });
  writeFileSync(arq, EXEMPLO);
  console.log(`Criado ${CAMINHO_ARTEFATO}. Ajuste "sistema" e escreva o passo a passo dos cards.`);
  return 0;
}

const EXEMPLO = `versao: 1
sistema:
  url: http://localhost:{{porta}}
  permitidos: [localhost, 127.0.0.1]
  producao: [app.suaempresa.com.br]     # nunca é alvo
  base: main
  preparar: npm ci                      # pulado quando o lockfile é igual ao seu (reaproveita node_modules)
  iniciar: npm run dev -- --port {{porta}}
  saude: /
  seed: npm run seed:teste              # roda antes de cada tentativa
  paralelo: 1
  # Frontend e API separados (troque "iniciar" por "servicos"):
  # servicos:
  #   - { nome: web, iniciar: "npm run dev -- --port {{porta}}", saude: / }
  #   - { nome: api, iniciar: "npm start -- --port {{porta}}", repo: ../api, saude: /saude }
  # email: { mailpit: http://localhost:8025 }   # para o passo ver_email
variaveis:
  usuario: teste@empresa-a.local
contas:
  tecnico:
    entrar:
      - abrir: /login
      - preencher: { campo: E-mail, valor: tecnico@empresa-a.local }
      - preencher: { campo: Senha, valor: "{{segredo:senha_teste}}" }
      - clicar: Entrar
    verificar: [ { abrir: /painel }, { ver_texto: Sair } ]
    reaproveitar: sim
  cliente:
    entrar:
      - abrir: /login
      - preencher: { campo: E-mail, valor: cliente@empresa-b.local }
      - preencher: { campo: Senha, valor: "{{segredo:senha_teste}}" }
      - clicar: Entrar
cards:
  - id: C-01
    titulo: Login com e-mail e senha
    branch: feat/login
    arquivos: [src/auth/**]
    altera: [usuarios]
    criterios:
      - Usuário com senha certa entra no painel
      - Senha errada mostra aviso e não entra
    como_testar:
      - abrir: /login
      - preencher: { campo: E-mail, valor: "{{usuario}}" }
      - preencher: { campo: Senha, valor: "{{segredo:senha_teste}}" }
      - clicar: Entrar
      - ver_url: /painel
        criterio: 1
      - clicar: Sair
      - preencher: { campo: E-mail, valor: "{{usuario}}" }
      - preencher: { campo: Senha, valor: senha-errada }
      - clicar: Entrar
      - ver_texto: E-mail ou senha incorretos
        criterio: 2
  - id: C-02
    titulo: Técnico envia a foto e o cliente aceita o orçamento
    branch: feat/aceite
    depende_de: [C-01]
    criterios: [Técnico envia as fotos da vistoria, Cliente aceita pelo link]
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
      - clicar: Aceitar orçamento
        como: cliente
      - ver_texto: Orçamento aceito
        como: cliente
        criterio: 2
      - conferir_manual: O PDF do orçamento sai com a logo
  - id: C-03
    titulo: Agenda no celular do técnico
    branch: feat/agenda
    dispositivo: celular
    como_testar:
      - abrir: /agenda
        como: tecnico
      - ver_texto: Hoje
        como: tecnico
  - id: J-01
    titulo: Do login ao aceite
    tipo: jornada
    etapas: [C-01, C-02]
    branch: feat/aceite
`;

main().then(
  (c) => process.exit(c),
  (e: Error) => {
    console.error(`erro: ${e.message}`);
    process.exit(1);
  },
);
