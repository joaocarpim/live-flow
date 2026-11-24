// Textos prontos para o Claude. A IA só escreve (passos, correções); quem roda é o liveflow, sem IA.
// Nunca entram senhas, tokens ou valores de segredos: só os nomes.
import { ACOES } from './tipos.ts';
import type { AlvoBranch } from './fontes.ts';
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

export function promptArtefatoDasBranches(alvos: AlvoBranch[]): string {
  const blocos = alvos.map((a) => {
    const r = a.rascunho;
    return [
      `Branch ${a.branch} (${a.commits.length} commit(s), ${a.arquivos.length} arquivo(s))${r ? ` · rascunho: ${r.id}` : ` · já tem card: ${a.cards.map((c) => c.card.card.id).join(', ')}`}`,
      ...a.commits.slice(0, 8).map((c) => `  commit: ${c.assunto}`),
      ...a.arquivos.slice(0, 25).map((f) => `  arquivo: ${f}`),
    ].join('\n');
  });
  return [
    'Crie ou complete o arquivo .liveflow/cards.yaml do liveflow a partir destas branches.',
    'Um card por entrega que faça sentido para quem usa o sistema (uma branch pode virar mais de um card).',
    'Cada card: id, titulo, descricao, branch, criterios e como_testar.',
    '',
    ...blocos,
    '',
    REGRAS_PASSOS,
    '',
    'Não altere código da aplicação. No fim, rode "liveflow cards" e confirme que todos aparecem como prontos.',
  ].join('\n');
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
