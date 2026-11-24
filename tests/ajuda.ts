// Utilitários dos testes: repositório git temporário com main, branches e um remoto.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function g(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
}

export function escrever(dir: string, arq: string, conteudo: string): void {
  mkdirSync(dirname(join(dir, arq)), { recursive: true });
  writeFileSync(join(dir, arq), conteudo);
}

export function commit(dir: string, msg: string, arquivos: Record<string, string>): void {
  for (const [a, c] of Object.entries(arquivos)) escrever(dir, a, c);
  g(dir, 'add', '-A');
  g(dir, 'commit', '-q', '-m', msg);
}

/** App mínimo: responde com o marcador da branch, para provar qual código está no ar. */
export const APP = (marcador: string) => `import { createServer } from 'node:http';
createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<h1>${marcador}</h1>'); })
  .listen(Number(process.env.PORT), '127.0.0.1');
`;

/**
 * Cria: origem (remoto) e clone local.
 *  main: app "base"
 *  feat/aprovacao (local): muda src/orcamento/aprovar.ts e o app vira "aprovacao"
 *  feat/sem-card (local): muda src/relatorio/pdf.ts
 *  feat/remota (só no remoto): muda web/pages/agenda.tsx
 */
export function repoDeTeste(): { repo: string; origem: string } {
  const origem = mkdtempSync(join(tmpdir(), 'lf-origem-'));
  g(origem, 'init', '-q', '-b', 'main');
  commit(origem, 'base', { 'app.mjs': APP('base'), 'src/orcamento/aprovar.ts': 'export const a = 1;\n', 'package.json': '{"type":"module"}\n' });
  g(origem, 'checkout', '-q', '-b', 'feat/remota');
  commit(origem, 'tela da agenda', { 'web/pages/agenda.tsx': 'export default () => null;\n' });
  g(origem, 'checkout', '-q', 'main');
  const repo = mkdtempSync(join(tmpdir(), 'lf-repo-'));
  execFileSync('git', ['clone', '-q', origem, repo]);
  g(repo, 'checkout', '-q', '-b', 'feat/aprovacao');
  commit(repo, 'aprovação do orçamento', { 'src/orcamento/aprovar.ts': 'export const a = 2;\n', 'app.mjs': APP('aprovacao') });
  g(repo, 'checkout', '-q', 'main');
  g(repo, 'checkout', '-q', '-b', 'feat/sem-card');
  commit(repo, 'relatório em pdf', { 'src/relatorio/pdf.ts': 'export const pdf = 1;\n' });
  g(repo, 'checkout', '-q', 'main');
  return { repo, origem };
}
