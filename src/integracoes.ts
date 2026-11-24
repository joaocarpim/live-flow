// Quando rodar sem ninguém lembrar: antes do push (hook do git) e no GitHub (PR e toda noite).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from './git.ts';

const MARCA = '# liveflow:pre-push';

export async function instalarHook(repo: string, forcar = false): Promise<string> {
  const dirHooks = resolve(repo, (await git(repo, ['rev-parse', '--git-path', 'hooks'])).trim());
  const arq = join(dirHooks, 'pre-push');
  if (existsSync(arq) && !readFileSync(arq, 'utf8').includes(MARCA) && !forcar) {
    throw new Error(`Já existe um hook pre-push em ${arq}. Use --forcar para trocar, ou chame "npx liveflow rodar --da-branch --modo rapido" de dentro dele.`);
  }
  mkdirSync(dirHooks, { recursive: true });
  writeFileSync(arq, `#!/bin/sh
${MARCA}
# Testa os cards da branch atual no modo rápido antes de enviar. Pular uma vez: git push --no-verify
npx --no-install liveflow rodar --da-branch --modo rapido
`);
  chmodSync(arq, 0o755);
  return arq;
}

export function workflowGithub(base: string, segredos: string[]): string {
  const env = segredos.map((s) => `      LIVEFLOW_SEGREDO_${s.toUpperCase()}: \${{ secrets.LIVEFLOW_SEGREDO_${s.toUpperCase()} }}`).join('\n');
  return `# Gerado por "liveflow ci gerar". Segredos: cadastre em Settings › Secrets › Actions.
name: liveflow
on:
  pull_request:
  schedule:
    - cron: '17 6 * * *'   # toda noite (06:17 UTC): regressão dos cards entregues
  workflow_dispatch:
jobs:
  cards:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Cards da branch do PR
        if: github.event_name == 'pull_request'
        run: npx liveflow rodar --da-branch --branch-atual "\${{ github.head_ref }}" --junit liveflow-junit.xml
${env ? `        env:\n${env}\n` : ''}      - name: Regressão na ${base}
        if: github.event_name != 'pull_request'
        run: npx liveflow rodar --regressao --modo completo --junit liveflow-junit.xml
${env ? `        env:\n${env}\n` : ''}      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: liveflow-evidencias
          path: .liveflow/execucoes/
          retention-days: 14
`;
}

export function gerarWorkflow(repo: string, base: string, segredos: string[], forcar = false): string {
  const arq = join(repo, '.github', 'workflows', 'liveflow.yml');
  if (existsSync(arq) && !forcar) throw new Error(`${arq} já existe. Use --forcar para trocar.`);
  mkdirSync(join(repo, '.github', 'workflows'), { recursive: true });
  writeFileSync(arq, workflowGithub(base, segredos));
  return arq;
}

/** Nomes de segredos usados no artefato ({{segredo:nome}}), para o workflow e para a extensão pedirem. */
export function segredosUsados(textoArtefato: string): string[] {
  return [...new Set([...textoArtefato.matchAll(/\{\{\s*segredo:([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))].sort();
}
