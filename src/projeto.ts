// Levantamento do projeto, sem IA: o que existe em cada repositório para subir o sistema.
// Vai para o texto do Claude, que escreve o bloco "sistema" do artefato. Quem sobe e testa é o liveflow.
// Só nomes: de .env.example vêm os nomes das variáveis, nunca os valores.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { branchAtual, git } from './git.ts';
import { lerRaiz } from './repositorios.ts';

export interface RepoLevantado {
  pasta: string;
  branchAtual?: string;
  /** Outras cópias de trabalho (git worktree) do mesmo repositório. */
  copias: number;
  gerenciador?: string;
  scripts: Record<string, string>;
  tecnologias: string[];
  docker: string[];
  variaveis: string[];
}

const SCRIPTS_UTEIS = /^(dev|start|serve|preview|build|seed|db:|migrate|prisma|test:e2e|e2e)/;
const TECNOLOGIAS: [string, string][] = [
  ['next', 'Next.js'], ['vite', 'Vite'], ['react-scripts', 'Create React App'], ['@angular/core', 'Angular'], ['vue', 'Vue'], ['nuxt', 'Nuxt'], ['svelte', 'Svelte'],
  ['@nestjs/core', 'NestJS'], ['express', 'Express'], ['fastify', 'Fastify'], ['koa', 'Koa'], ['hono', 'Hono'],
  ['prisma', 'Prisma'], ['@prisma/client', 'Prisma'], ['typeorm', 'TypeORM'], ['sequelize', 'Sequelize'], ['knex', 'Knex'], ['drizzle-orm', 'Drizzle'], ['mongoose', 'Mongoose'],
  ['playwright', 'Playwright'], ['@playwright/test', 'Playwright'],
];

function lerJson(arq: string): Record<string, any> | undefined {
  try {
    return JSON.parse(readFileSync(arq, 'utf8'));
  } catch {
    return undefined;
  }
}

export async function levantarRepo(raiz: string, pasta: string): Promise<RepoLevantado> {
  const dir = resolve(raiz, pasta);
  const pkg = lerJson(join(dir, 'package.json'));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const tecnologias = [...new Set(TECNOLOGIAS.filter(([d]) => d in deps).map(([, n]) => n))];
  if (existsSync(join(dir, 'manage.py'))) tecnologias.push('Django');
  if (existsSync(join(dir, 'artisan'))) tecnologias.push('Laravel');
  if (existsSync(join(dir, 'Gemfile')) && existsSync(join(dir, 'config', 'routes.rb'))) tecnologias.push('Rails');
  if (existsSync(join(dir, 'go.mod'))) tecnologias.push('Go');
  const gerenciador = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'bun.lockb')) ? 'bun' : pkg ? 'npm' : undefined;
  const scripts = Object.fromEntries(Object.entries((pkg?.scripts ?? {}) as Record<string, string>).filter(([n]) => SCRIPTS_UTEIS.test(n)));
  const nomes = (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })();
  const docker = nomes.filter((n) => /^(docker-compose|compose)\.ya?ml$|^Dockerfile$/.test(n));
  const variaveis: string[] = [];
  for (const exemplo of ['.env.example', '.env.sample', '.env.local.example']) {
    if (!existsSync(join(dir, exemplo))) continue;
    for (const linha of readFileSync(join(dir, exemplo), 'utf8').split('\n')) {
      const m = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(linha);
      if (m && /PORT|URL|HOST|DATABASE|DB_|REDIS|API/.test(m[1]!)) variaveis.push(m[1]!);
    }
    break;
  }
  const lista = await git(dir, ['worktree', 'list', '--porcelain']).catch(() => '');
  const copias = Math.max(0, lista.split('\n').filter((l) => l.startsWith('worktree ')).length - 1);
  const atual = await branchAtual(dir).catch(() => undefined);
  return { pasta, ...(atual ? { branchAtual: atual } : {}), copias, ...(gerenciador ? { gerenciador } : {}), scripts, tecnologias, docker, variaveis: [...new Set(variaveis)] };
}

export async function levantarProjeto(raiz: string): Promise<{ raizEhRepo: boolean; repos: RepoLevantado[] }> {
  const r = await lerRaiz(raiz);
  const repos: RepoLevantado[] = [];
  for (const p of r.repos) repos.push(await levantarRepo(raiz, p));
  return { raizEhRepo: r.raizEhRepo, repos };
}

/** Texto curto do levantamento, para o Claude. */
export function descreverProjeto(p: { raizEhRepo: boolean; repos: RepoLevantado[] }): string {
  if (!p.repos.length) return 'Nenhum repositório git encontrado nesta pasta nem nas subpastas.';
  const linhas = [p.raizEhRepo ? 'A pasta raiz é o repositório.' : `A pasta raiz junta ${p.repos.length} repositório(s); cada serviço precisa de "repo: <pasta>".`];
  for (const r of p.repos) {
    linhas.push(`- ${r.pasta}${r.branchAtual ? ` (branch atual: ${r.branchAtual})` : ''}${r.copias ? `, ${r.copias} worktree(s) além desta` : ''}`);
    if (r.tecnologias.length) linhas.push(`  tecnologias: ${r.tecnologias.join(', ')}`);
    if (r.gerenciador) linhas.push(`  gerenciador: ${r.gerenciador}`);
    for (const [n, c] of Object.entries(r.scripts)) linhas.push(`  script ${n}: ${c}`);
    if (r.docker.length) linhas.push(`  docker: ${r.docker.join(', ')}`);
    if (r.variaveis.length) linhas.push(`  variáveis no .env de exemplo (só nomes): ${r.variaveis.join(', ')}`);
  }
  return linhas.join('\n');
}
