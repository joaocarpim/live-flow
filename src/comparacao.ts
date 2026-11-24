// Comparar com a base para mostrar só o que é novo.
import { createHash } from 'node:crypto';
import type { Origem } from './tipos.ts';

export interface Achado {
  camada: string;
  regra: string;
  /** Rota, arquivo ou passo onde aconteceu. */
  alvo: string;
  mensagem: string;
}

/** Impressão digital estável: ignora números que mudam entre execuções (tempos, ids, contagens). */
export function impressao(a: Achado): string {
  const msg = a.mensagem.replace(/\d+(?:[.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha1').update([a.camada, a.regra, a.alvo, msg].join('\u0000')).digest('hex').slice(0, 16);
}

export function separarNovos<T extends Achado>(atuais: T[], naBase: Achado[]): (T & { origem: Origem })[] {
  const base = new Set(naBase.map(impressao));
  return atuais.map((a) => ({ ...a, origem: base.has(impressao(a)) ? 'ja_existia' : 'novo' }));
}

/**
 * Regressão de um card vizinho: ele já estava aprovado, então o que importa é se ELA passava na base.
 * O fluxo do próprio card não é comparado com a base, porque na base o card ainda não existe.
 */
export function classificarRegressao(passouNaBranch: boolean, passouNaBase: boolean): 'ok' | 'quebrou_nesta_branch' | 'ja_quebrado_na_base' {
  if (passouNaBranch) return 'ok';
  return passouNaBase ? 'quebrou_nesta_branch' : 'ja_quebrado_na_base';
}
