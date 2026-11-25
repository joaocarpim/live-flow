// Diagnóstico do ambiente: o que falta para o liveflow testar de forma certeira.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verificarAlvo } from './seguranca.ts';
import type { Artefato } from './tipos.ts';
import { CAMINHO_ARTEFATO } from './artefato.ts';
import { lerRaiz } from './repositorios.ts';

const exec = promisify(execFile);

export interface ItemAmbiente {
  nome: string;
  ok: boolean;
  detalhe: string;
  /** Falta, mas não impede testar. */
  opcional?: boolean;
  /** Comando que resolve, quando existe. */
  resolver?: string;
}

export async function diagnosticar(repo: string, art: Artefato): Promise<{ itens: ItemAmbiente[]; sistema: Artefato['sistema']; cards: { prontos: number; semPassos: number; invalidos: number } }> {
  const itens: ItemAmbiente[] = [];
  const temArtefato = existsSync(join(repo, CAMINHO_ARTEFATO));
  itens.push({ nome: 'Artefato de cards', ok: temArtefato && !art.problemas.length, detalhe: temArtefato ? (art.problemas[0] ?? CAMINHO_ARTEFATO) : 'não existe', ...(temArtefato ? {} : { resolver: 'liveflow iniciar' }) });
  const raiz = await lerRaiz(repo);
  const temGit = raiz.repos.length > 0;
  itens.push({ nome: 'Repositório git', ok: temGit, detalhe: raiz.raizEhRepo ? 'ok' : temGit ? `pasta com ${raiz.repos.length} repositório(s): ${raiz.repos.join(', ')}` : 'nenhum repositório git nesta pasta nem nas subpastas: sem ele nenhum card roda', ...(temGit ? {} : { resolver: 'git init && git add -A && git commit -m "inicial"' }) });
  if (!raiz.raizEhRepo && raiz.repos.length > 1) {
    const semRepo = (art?.sistema.servicos ?? []).filter((s) => !s.repo).map((s) => s.nome);
    if (semRepo.length) itens.push({ nome: 'Repositório de cada serviço', ok: false, opcional: true, detalhe: `sem "repo:" (${semRepo.join(', ')}): o liveflow usa o único repositório que tiver a branch do card; se houver mais de um, o card não roda`, resolver: `repo: ${raiz.repos[0]}` });
  }
  let pw = '';
  try {
    pw = createRequire(join(repo, 'package.json')).resolve('playwright');
  } catch {
    try { pw = createRequire(join(repo, 'package.json')).resolve('@playwright/test'); } catch { /* ausente */ }
  }
  itens.push({ nome: 'Playwright no projeto', ok: !!pw, detalhe: pw ? 'instalado' : 'não instalado', ...(pw ? {} : { resolver: 'npm i -D playwright' }) });
  const chrome = await exec('google-chrome', ['--version']).then((r) => r.stdout.trim(), () => '');
  itens.push({ nome: 'Navegador', ok: !!pw || !!chrome, detalhe: chrome ? `${chrome} (usado se o Chromium do Playwright faltar)` : 'use: npx playwright install chromium', opcional: true });
  const alvo = verificarAlvo(art.sistema.url.replace(/\{\{porta(\.[a-z_0-9]+)?\}\}/g, '1'), art.sistema);
  itens.push({ nome: 'Trava de alvo', ok: !alvo, detalhe: alvo ?? `só ${art.sistema.permitidos.join(', ')}` });
  itens.push({
    nome: 'Código certo por branch',
    ok: art.sistema.servicos.length > 0,
    detalhe: art.sistema.servicos.length ? art.sistema.servicos.map((s) => `${s.nome}${s.repo ? ` (${s.repo})` : ''}`).join(', ') : 'sem "iniciar"/"servicos": só testa a branch do seu checkout atual',
    opcional: true,
  });
  itens.push({ nome: 'Banco zerado por tentativa', ok: !!art.sistema.seed, detalhe: art.sistema.seed ?? 'sem "seed": tentativas não começam do mesmo estado', opcional: true });
  itens.push({ nome: 'Paralelo', ok: art.sistema.paralelo > 1, detalhe: art.sistema.paralelo > 1 ? `até ${art.sistema.paralelo}` : 'um card por vez (seed sem {{execucao}})', opcional: true });
  if (art.cards.some((c) => c.card.como_testar.some((p) => p.acao === 'ver_email'))) itens.push({ nome: 'Caixa de e-mail de teste', ok: !!art.sistema.email, detalhe: art.sistema.email?.mailpit ?? 'configure sistema.email.mailpit' });
  return {
    itens,
    sistema: art.sistema,
    cards: { prontos: art.cards.filter((c) => c.estado === 'pronto').length, semPassos: art.cards.filter((c) => c.estado === 'sem_passos').length, invalidos: art.cards.filter((c) => c.estado === 'invalido').length },
  };
}
