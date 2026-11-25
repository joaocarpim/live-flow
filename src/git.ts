// Acesso ao git. Só leitura, exceto worktrees temporárias que o próprio liveflow cria e remove.
// Sempre execFile com lista de argumentos: nada passa por shell.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);

export async function git(repo: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd: repo, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

export interface Branch {
  /** Nome curto: "feat/x" ou "origin/feat/x". */
  nome: string;
  tipo: 'local' | 'remota';
  sha: string;
  data: string;
  /** Para remota: o nome sem o remoto ("feat/x"). */
  semRemoto: string;
}

export function refSegura(ref: string): string {
  if (!ref || ref.startsWith('-') || /[\s~^:?*[\\]|\.\.|@\{/.test(ref)) throw new Error(`Nome de branch inválido: ${ref}`);
  return ref;
}

export async function listarBranches(repo: string, opcoes: { remotas?: boolean } = {}): Promise<Branch[]> {
  const refs = opcoes.remotas === false ? ['refs/heads'] : ['refs/heads', 'refs/remotes'];
  const out = await git(repo, ['for-each-ref', '--format=%(refname)%09%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)', ...refs]);
  const lista: Branch[] = [];
  for (const linha of out.split('\n')) {
    if (!linha.trim()) continue;
    const [ref = '', nome = '', sha = '', data = ''] = linha.split('\t');
    if (ref.endsWith('/HEAD')) continue;
    const remota = ref.startsWith('refs/remotes/');
    lista.push({ nome, tipo: remota ? 'remota' : 'local', sha, data, semRemoto: remota ? nome.split('/').slice(1).join('/') : nome });
  }
  return lista;
}

export async function atualizarRemotas(repo: string): Promise<void> {
  await git(repo, ['fetch', '--all', '--prune']);
}

/** A pasta está dentro de um repositório git (com pelo menos um commit)? */
export async function ehRepositorio(repo: string): Promise<boolean> {
  return git(repo, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
}

export async function branchAtual(repo: string): Promise<string | null> {
  const out = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  return out === 'HEAD' ? null : out;
}

export async function shaDe(repo: string, ref: string): Promise<string> {
  return (await git(repo, ['rev-parse', '--verify', '--end-of-options', `${refSegura(ref)}^{commit}`])).trim();
}

export async function baseComum(repo: string, a: string, b: string): Promise<string> {
  return (await git(repo, ['merge-base', '--end-of-options', refSegura(a), refSegura(b)])).trim();
}

export interface ArquivoMudado {
  status: string;
  caminho: string;
}

/** Arquivos que a branch mudou desde que saiu da base (diff de três pontos). */
export async function arquivosMudados(repo: string, base: string, ref: string): Promise<ArquivoMudado[]> {
  const out = await git(repo, ['diff', '--name-status', '--no-renames', '--end-of-options', `${refSegura(base)}...${refSegura(ref)}`]);
  return out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [status = '', caminho = ''] = l.split('\t');
      return { status, caminho };
    });
}

export async function commitsDaBranch(repo: string, base: string, ref: string): Promise<{ sha: string; assunto: string }[]> {
  const out = await git(repo, ['log', '--format=%H%x09%s', '--end-of-options', `${refSegura(base)}..${refSegura(ref)}`]);
  return out
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const i = l.indexOf('\t');
      return { sha: l.slice(0, i), assunto: l.slice(i + 1) };
    });
}

export async function textoDoDiff(repo: string, base: string, ref: string): Promise<string> {
  return git(repo, ['diff', '--no-color', '-U0', '--end-of-options', `${refSegura(base)}...${refSegura(ref)}`]);
}

/** Cópia isolada do código de uma branch, sem mexer no seu checkout. */
export async function criarCopia(repo: string, ref: string): Promise<{ dir: string; sha: string; remover: () => Promise<void> }> {
  const sha = await shaDe(repo, ref);
  const dir = await mkdtemp(join(tmpdir(), 'liveflow-'));
  await git(repo, ['worktree', 'add', '--detach', dir, sha]);
  return {
    dir,
    sha,
    remover: async () => {
      await git(repo, ['worktree', 'remove', '--force', dir]).catch(() => undefined);
    },
  };
}
