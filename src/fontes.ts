// De onde vem o que testar.
// O card diz O QUE verificar (passo a passo). A branch diz QUAL código está sendo verificado.
// Por isso as duas fontes convivem:
//   - "artefato": você escolhe cards; o código vem da branch declarada no card (ou do checkout atual).
//   - "branches": você escolhe branches (locais e/ou remotas); o liveflow acha os cards de cada uma.
//     Branch sem card vira um rascunho de card que ainda precisa do passo a passo.
import { arquivosMudados, commitsDaBranch, listarBranches } from './git.ts';
import type { Branch } from './git.ts';
import type { Card, CardAvaliado } from './tipos.ts';

export type Fonte = { tipo: 'artefato'; cards: string[] } | { tipo: 'branches'; branches: string[] };

export interface Vinculo {
  card: CardAvaliado;
  /** Como o card foi ligado à branch: pela branch declarada ou pelos arquivos em comum. */
  motivo: 'branch' | 'arquivos';
  arquivosEmComum?: string[];
}

export interface AlvoBranch {
  branch: string;
  base: string;
  arquivos: string[];
  commits: { sha: string; assunto: string }[];
  cards: Vinculo[];
  /** Quando nenhum card foi achado: um rascunho para completar com o passo a passo. */
  rascunho?: Card;
}

export interface AlvoCard {
  card: CardAvaliado;
  /** Branch cujo código vai ser testado. null = o que estiver no checkout atual. */
  branch: string | null;
}

/** Cards escolhidos pelo artefato. Cards sem passo a passo ou inválidos voltam como recusados. */
export function alvosDoArtefato(todos: CardAvaliado[], ids: string[]): { alvos: AlvoCard[]; recusados: { id: string; motivo: string }[] } {
  const alvos: AlvoCard[] = [];
  const recusados: { id: string; motivo: string }[] = [];
  for (const id of ids) {
    const c = todos.find((x) => x.card.id === id);
    if (!c) recusados.push({ id, motivo: 'não existe no artefato' });
    else if (c.estado !== 'pronto') recusados.push({ id, motivo: c.problemas.join(' ') });
    else alvos.push({ card: c, branch: c.card.branch ?? null });
  }
  return { alvos, recusados };
}

/** Para cada branch escolhida, os cards que pertencem a ela. */
export async function alvosDasBranches(repo: string, base: string, branches: string[], todos: CardAvaliado[]): Promise<AlvoBranch[]> {
  const conhecidas = await listarBranches(repo);
  const saida: AlvoBranch[] = [];
  for (const nome of branches) {
    const info = conhecidas.find((b) => b.nome === nome);
    if (!info) throw new Error(`Branch não encontrada: ${nome}. Para remotas, use "liveflow branches --atualizar" antes.`);
    const arquivos = (await arquivosMudados(repo, base, nome)).map((a) => a.caminho);
    const commits = await commitsDaBranch(repo, base, nome);
    const cards = vincular(info, arquivos, todos);
    const alvo: AlvoBranch = { branch: nome, base, arquivos, commits, cards };
    if (!cards.length) alvo.rascunho = rascunhoDeCard(info, arquivos, commits);
    saida.push(alvo);
  }
  return saida;
}

export function vincular(branch: Pick<Branch, 'nome' | 'semRemoto'>, arquivos: string[], todos: CardAvaliado[]): Vinculo[] {
  const porBranch = todos.filter((c) => c.card.branch && mesmaBranch(c.card.branch, branch));
  if (porBranch.length) return porBranch.map((card) => ({ card, motivo: 'branch' as const }));
  const vinculos: Vinculo[] = [];
  for (const c of todos) {
    if (c.card.branch || !c.card.arquivos?.length) continue;
    const re = c.card.arquivos.map(globParaRegex);
    const emComum = arquivos.filter((a) => re.some((r) => r.test(a)));
    if (emComum.length) vinculos.push({ card: c, motivo: 'arquivos', arquivosEmComum: emComum });
  }
  return vinculos;
}

function mesmaBranch(declarada: string, b: Pick<Branch, 'nome' | 'semRemoto'>): boolean {
  return declarada === b.nome || declarada === b.semRemoto || declarada.split('/').slice(1).join('/') === b.semRemoto;
}

/** Rascunho determinístico: sem IA, sem inventar passos. O passo a passo fica vazio de propósito. */
export function rascunhoDeCard(b: Pick<Branch, 'nome' | 'semRemoto'>, arquivos: string[], commits: { assunto: string }[]): Card {
  const slug = b.semRemoto.replace(/^(feat|feature|fix|bugfix|hotfix|chore|refactor)\//i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  const titulo = commits.length ? commits[commits.length - 1]!.assunto : slug.replace(/-/g, ' ');
  return {
    id: `B-${slug || 'branch'}`,
    titulo,
    tipo: 'card',
    altera: [],
    depende_de: [],
    exclusivo: false,
    branch: b.semRemoto,
    arquivos,
    criterios: [],
    como_testar: [],
    perfil: { interface: arquivos.some(ehArquivoDeTela) ? true : false },
  };
}

export function ehArquivoDeTela(caminho: string): boolean {
  return /\.(tsx|jsx|vue|svelte|html|css|scss)$/i.test(caminho) || /(^|\/)(pages|app|views|screens|components|web)\//i.test(caminho);
}

/** Glob simples: ** (qualquer pasta), * (qualquer nome), ? (um caractere). */
export function globParaRegex(glob: string): RegExp {
  let r = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        r += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else r += '[^/]*';
    } else if (ch === '?') r += '[^/]';
    else r += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}
