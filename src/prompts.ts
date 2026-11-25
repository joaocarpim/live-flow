// Textos prontos para o Claude. A IA só escreve (passos, correções); quem roda é o liveflow, sem IA.
// Nunca entram senhas, tokens ou valores de segredos: só os nomes.
import { ACOES } from './tipos.ts';
import type { Card } from './tipos.ts';

const REGRAS_PASSOS = `Formato de cada passo (uma ação por passo, só estas: ${ACOES.join(', ')}):
  - abrir: /caminho            (sempre o primeiro passo, caminho relativo)
  - clicar: Texto do botão     (o texto que a pessoa vê, exato)
  - preencher: { campo: Rótulo do campo, valor: texto }
  - selecionar: { campo: Rótulo, opcao: Texto da opção }
  - marcar: Rótulo da caixa
  - ver_texto: Texto que precisa aparecer
  - nao_ver_texto: Texto que não pode aparecer
  - ver_url: /caminho/*        (* vale qualquer trecho sem barra)
  - api: { metodo: GET, rota: /api/..., status: 200, contem: { campo: valor } }
  - criterio: N                (opcional, no mesmo passo: qual critério ele prova)
Senhas e tokens: use {{segredo:nome}}; nunca escreva o valor.
Não invente textos de botão ou rótulos: leia o código da tela e use exatamente o texto que aparece.
Cada critério de aceite precisa de pelo menos um passo com "criterio" apontando para ele.`;

export function promptPassos(card: Card, contexto?: { arquivos: string[]; commits: { assunto: string }[] }): string {
  const linhas = [
    `Escreva o "como_testar" do card ${card.id} "${card.titulo}" no arquivo .liveflow/cards.yaml.`,
    '',
    card.descricao ? `Descrição: ${card.descricao}` : '',
    card.criterios.length ? `Critérios de aceite:\n${card.criterios.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}` : 'O card não tem critérios de aceite. Proponha de 3 a 6, curtos e verificáveis, e escreva em "criterios".',
    card.branch ? `Branch do card: ${card.branch}` : '',
    contexto?.arquivos.length ? `Arquivos que a branch mudou:\n${contexto.arquivos.slice(0, 40).map((a) => `  - ${a}`).join('\n')}` : '',
    contexto?.commits.length ? `Commits:\n${contexto.commits.slice(0, 15).map((c) => `  - ${c.assunto}`).join('\n')}` : '',
    '',
    REGRAS_PASSOS,
    '',
    'Mexa só no card citado. Não altere código da aplicação. No fim, rode "liveflow cards" e confirme que o card aparece como pronto.',
  ];
  return linhas.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}

/** Texto para o Claude criar (ou completar) o artefato .liveflow/cards.yaml a partir dos cards da pessoa. */
export interface ContextoArtefato {
  /** Levantamento do projeto (repositórios, scripts, tecnologias), feito pelo liveflow sem IA. */
  projeto?: string;
  /** O artefato atual ainda é o exemplo do "liveflow iniciar". */
  ehExemplo?: boolean;
}

/** Texto para o Claude criar (ou completar) o artefato .liveflow/cards.yaml: o bloco sistema e os cards da pessoa. */
export function promptArtefato(cardsDaPessoa: string, jaExistem: string[], ctx: ContextoArtefato = {}): string {
  const texto = cardsDaPessoa.trim();
  return [
    'Crie ou complete o arquivo .liveflow/cards.yaml do liveflow: o bloco "sistema" (como subir o sistema para testar) e os cards abaixo.',
    ctx.ehExemplo ? 'O artefato atual é o EXEMPLO do "liveflow iniciar": o sistema e os cards dele (C-01, C-02, C-03, J-01, feat/login, feat/aceite) são de mentira. Substitua tudo.' : '',
    '',
    ctx.projeto ? 'O que o liveflow encontrou no projeto (sem IA):' : '',
    ctx.projeto ?? '',
    '',
    'Bloco "sistema" (leia o código, os package.json, o docker-compose e o README de cada repositório para acertar):',
    '- servicos: um por processo que precisa estar no ar (ex.: api e web). Cada um com nome, iniciar (o comando, com {{porta}} no lugar da porta), saude (um caminho que responde 200 quando ele está pronto), repo (a pasta do repositório, quando a raiz junta repositórios) e preparar se precisar instalar algo.',
    '- O web costuma precisar do endereço da api: use {{url.api}} (ou {{porta.api}}) no comando dele, ou a variável LIVEFLOW_URL_API.',
    '- url: o endereço que o navegador abre, normalmente http://localhost:{{porta.web}}. permitidos: [localhost, 127.0.0.1]. producao: os domínios de produção, que nunca são alvo.',
    '- seed: o comando que deixa o banco num estado conhecido antes de cada teste, se o projeto tiver (seed, migrate + seed, fixtures). Se não tiver, deixe sem e diga isso no fim.',
    '- base: a branch principal (main ou master).',
    '- Banco, Redis e outros serviços de infraestrutura não sobem pelo liveflow: diga no fim o que precisa estar rodando antes (ex.: docker compose up -d db).',
    '- Senhas e tokens: só {{segredo:nome}}, nunca o valor. Diga no fim quais segredos a pessoa precisa definir.',
    '',
    'Cards: id, titulo, descricao, branch (a branch onde o card foi feito, no repositório certo), arquivos (caminho a partir da pasta raiz), criterios e como_testar (o passo a passo completo).',
    'Leia o código da aplicação para escrever passos que existem de verdade na tela: textos de botão, rótulos de campo e caminhos reais.',
    jaExistem.length && !ctx.ehExemplo ? `Já existem no artefato: ${jaExistem.join(', ')}. Complete os que estiverem sem passos e não duplique.` : '',
    '',
    texto ? 'Cards:' : 'Cards: use os que eu passar nesta conversa (id, título, descrição, critérios e branch).',
    texto,
    '',
    REGRAS_PASSOS,
    '',
    'Não altere código da aplicação. No fim, rode "liveflow ambiente" e "liveflow cards", e confirme que o sistema está configurado e todos os cards aparecem como prontos.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}

export interface FalhaParaCorrigir {
  card: Card;
  branch: string | null;
  passo: number;
  descricaoPasso: string;
  erro: string;
  tentativas: number;
  bancoZerado: boolean;
  url?: string;
  sugestoes?: string[];
  evidencias: string[];
}

export function promptResolver(f: FalhaParaCorrigir): string {
  return [
    `Corrija esta falha que o liveflow encontrou no card ${f.card.id} "${f.card.titulo}"${f.branch ? ` (branch ${f.branch})` : ''}.`,
    '',
    `Passo ${f.passo}: ${f.descricaoPasso}`,
    `Erro: ${f.erro}`,
    `Confirmado: falhou ${f.tentativas} de ${f.tentativas} vezes${f.bancoZerado ? ', com o banco zerado a cada vez' : ' (sem seed configurado: o banco não foi zerado entre as tentativas)'}.`,
    f.url ? `Página no momento da falha: ${f.url}` : '',
    f.sugestoes?.length ? `Na tela existe algo parecido: ${f.sugestoes.map((s) => `"${s}"`).join(', ')}. Provável mudança de texto: confirme se foi de propósito antes de mexer no código.` : '',
    f.evidencias.length ? `Evidências: ${f.evidencias.join(', ')}` : '',
    '',
    'Faça assim:',
    '1. Descubra se o problema está no código ou no passo a passo do card (texto de botão mudou, por exemplo).',
    '2. Se for código: escreva primeiro um teste que reproduz a falha, depois corrija.',
    '3. Se for o passo a passo: ajuste só o card no .liveflow/cards.yaml e explique o porquê.',
    '4. Não altere outros testes para fazê-los passar.',
    `5. No fim, rode "liveflow rodar ${f.card.id}" e mostre o resultado.`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
}
