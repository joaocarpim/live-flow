// Contrato de eventos v1: uma linha JSON por evento em events.ndjson.
// A extensão, o terminal e o chat leem o mesmo arquivo e mostram do seu jeito, sem mudar a informação.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type TipoEvento =
  | 'execucao_inicio'
  | 'card_inicio'
  | 'copia_pronta'
  | 'app_no_ar'
  | 'tentativa'
  | 'passo_inicio'
  | 'passo_ok'
  | 'passo_falhou'
  | 'aviso'
  | 'ambiente'
  | 'camada_fim'
  | 'card_fim'
  | 'execucao_fim';

export interface Evento {
  v: 1;
  ts: string;
  tipo: TipoEvento;
  card?: string;
  [k: string]: unknown;
}

export class Registro {
  arquivo: string;
  ouvintes: ((e: Evento) => void)[] = [];
  constructor(arquivo: string) {
    this.arquivo = arquivo;
    mkdirSync(dirname(arquivo), { recursive: true });
  }
  emitir(tipo: TipoEvento, dados: Record<string, unknown> = {}): Evento {
    const e: Evento = { v: 1, ts: new Date().toISOString(), tipo, ...dados };
    appendFileSync(this.arquivo, JSON.stringify(e) + '\n');
    for (const o of this.ouvintes) o(e);
    return e;
  }
}
