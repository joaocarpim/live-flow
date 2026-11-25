// Onde está o código. Dois jeitos de organizar um projeto:
//   - a pasta raiz (onde fica .liveflow/) é o repositório git;
//   - a pasta raiz só junta outros repositórios (ex.: frontend/ e backend/, cada um com o seu git).
// No segundo caso o liveflow procura os repositórios nas subpastas e cada serviço roda no repositório dele.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { arquivosMudados, branchAtual, ehRepositorio, shaDe } from './git.ts';

export interface Raiz {
  /** A própria pasta raiz é um repositório. */
  raizEhRepo: boolean;
  /** Repositórios, relativos à raiz ('.' quando a raiz é o repositório). */
  repos: string[];
}

const PULAR = new Set(['node_modules', '.liveflow', 'dist', 'build', 'vendor', '.next', '.venv', 'venv', 'target', 'coverage']);

/** Subpastas (até `profundidade` níveis) que têm .git. Não entra dentro de um repositório achado. */
export function acharRepositorios(raiz: string, profundidade = 3): string[] {
  const achados: string[] = [];
  const andar = (dir: string, nivel: number) => {
    if (nivel > profundidade) return;
    let nomes: string[];
    try {
      nomes = readdirSync(dir);
    } catch {
      return;
    }
    if (nivel > 0 && nomes.includes('.git')) {
      achados.push(relative(raiz, dir).split('\\').join('/'));
      return;
    }
    for (const n of nomes.sort()) {
      if (n.startsWith('.') || PULAR.has(n)) continue;
      const p = join(dir, n);
      try {
        if (statSync(p).isDirectory()) andar(p, nivel + 1);
      } catch {
        /* link quebrado */
      }
    }
  };
  andar(raiz, 0);
  return achados;
}

export async function lerRaiz(raiz: string): Promise<Raiz> {
  if (await ehRepositorio(raiz)) return { raizEhRepo: true, repos: ['.'] };
  const repos: string[] = [];
  for (const r of acharRepositorios(raiz)) if (await ehRepositorio(join(raiz, r))) repos.push(r);
  return { raizEhRepo: false, repos };
}

export async function temRef(dir: string, ref: string): Promise<boolean> {
  const nome = ref.replace(/^origin\//, '');
  for (const c of [nome, `origin/${nome}`]) if (await shaDe(dir, c).then(() => true, () => false)) return true;
  return false;
}

/** Repositórios (relativos) que têm a branch. */
export async function reposComBranch(raiz: string, r: Raiz, ref: string): Promise<string[]> {
  const saida: string[] = [];
  for (const rep of r.repos) if (await temRef(resolve(raiz, rep), ref)) saida.push(rep);
  return saida;
}

/** Arquivos que a branch mexeu, com o caminho a partir da raiz (ex.: frontend/src/x.tsx). */
export async function arquivosDaBranch(raiz: string, base: string, ref: string): Promise<string[]> {
  const r = await lerRaiz(raiz);
  const saida: string[] = [];
  for (const rep of await reposComBranch(raiz, r, ref)) {
    const lista = await arquivosMudados(resolve(raiz, rep), base, ref).catch(() => []);
    for (const a of lista) saida.push(rep === '.' ? a.caminho : `${rep}/${a.caminho}`);
  }
  return saida;
}

/** Branch atual de cada repositório. */
export async function branchesAtuais(raiz: string): Promise<string[]> {
  const r = await lerRaiz(raiz);
  const saida: string[] = [];
  for (const rep of r.repos) {
    const b = await branchAtual(resolve(raiz, rep)).catch(() => undefined);
    if (b) saida.push(b);
  }
  return saida;
}

export const SEM_GIT = (raiz: string) =>
  `A pasta ${raiz} não é um repositório git, e não achei nenhum repositório nas subpastas (até 3 níveis, sem node_modules). O liveflow precisa do git para saber qual código testou (e para montar a cópia da branch do card). Abra a pasta do projeto no VS Code ou crie um repositório: git init && git add -A && git commit -m "inicial".`;
