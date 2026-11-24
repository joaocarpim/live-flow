// Relatórios a partir dos resultados: JUnit (para CI) e histórico com quarentena de instáveis.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultadoCard } from './executar.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function junit(res: ResultadoCard[]): string {
  const falhas = res.filter((r) => r.resultado === 'falhou').length;
  const pulados = res.filter((r) => r.resultado !== 'passou' && r.resultado !== 'falhou').length;
  const casos = res.map((r) => {
    const nome = esc(`${r.card}${r.branch ? ` (${r.branch})` : ''}`);
    let corpo = '';
    if (r.resultado === 'falhou') corpo = `<failure message="${esc(r.falha?.erro ?? 'falhou')}">${esc(`passo ${r.falha?.passo}: ${r.falha?.descricao ?? ''}\nconfirmado ${r.tentativas}/${r.tentativas}`)}</failure>`;
    else if (r.resultado === 'instavel') corpo = `<skipped message="instável: falhou e passou nas repetições (quarentena)"/>`;
    else if (r.resultado !== 'passou') corpo = `<skipped message="${esc(r.motivo ?? r.resultado)}"/>`;
    if (r.pendencias.length) corpo += `<system-out>${esc(`conferência manual pendente: ${r.pendencias.join('; ')}`)}</system-out>`;
    return `  <testcase classname="liveflow" name="${nome}">${corpo}</testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="liveflow" tests="${res.length}" failures="${falhas}" skipped="${pulados}">\n${casos.join('\n')}\n</testsuite>\n`;
}

export interface LinhaHistorico {
  quando: string;
  resultado: ResultadoCard['resultado'];
  branch: string | null;
  sha?: string;
  tentativas: number;
}

export function lerHistorico(raiz: string): Map<string, LinhaHistorico[]> {
  const base = join(raiz, '.liveflow', 'execucoes');
  const mapa = new Map<string, LinhaHistorico[]>();
  if (!existsSync(base)) return mapa;
  for (const d of readdirSync(base).sort()) {
    const arq = join(base, d, 'resultado.json');
    if (!existsSync(arq)) continue;
    let res: ResultadoCard[];
    try {
      res = JSON.parse(readFileSync(arq, 'utf8')) as ResultadoCard[];
    } catch {
      continue;
    }
    for (const r of res) mapa.set(r.card, [...(mapa.get(r.card) ?? []), { quando: d, resultado: r.resultado, branch: r.branch, tentativas: r.tentativas, ...(r.sha ? { sha: r.sha } : {}) }]);
  }
  return mapa;
}

/** Em quarentena: ficou instável em pelo menos 2 das últimas 5 execuções. */
export function quarentena(h: Map<string, LinhaHistorico[]>): { card: string; instaveis: number; de: number }[] {
  const saida: { card: string; instaveis: number; de: number }[] = [];
  for (const [card, linhas] of h) {
    const ult = linhas.slice(-5);
    const instaveis = ult.filter((l) => l.resultado === 'instavel').length;
    if (instaveis >= 2) saida.push({ card, instaveis, de: ult.length });
  }
  return saida.sort((a, b) => b.instaveis - a.instaveis);
}

/**
 * Apaga execuções mais antigas que N dias (prints, vídeos e traces podem ter dados pessoais).
 * Devolve as pastas apagadas. dias = 0 não apaga nada.
 */
export function limparExecucoes(raiz: string, dias: number, agora = Date.now()): string[] {
  const base = join(raiz, '.liveflow', 'execucoes');
  if (!dias || !existsSync(base)) return [];
  const limite = agora - dias * 24 * 60 * 60 * 1000;
  const apagadas: string[] = [];
  for (const d of readdirSync(base)) {
    const p = join(base, d);
    try {
      if (statSync(p).isDirectory() && statSync(p).mtimeMs < limite) {
        rmSync(p, { recursive: true, force: true });
        apagadas.push(d);
      }
    } catch { /* outra execução mexendo: deixa para a próxima */ }
  }
  return apagadas;
}
