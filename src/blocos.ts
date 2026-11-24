// Monta os blocos de execução. Determinístico: os mesmos cards geram sempre os mesmos blocos.
//
//  1. Bloco = cards que usam o mesmo código (mesma branch). Um app no ar por bloco.
//  2. Dentro do bloco, ondas: uma onda só começa quando as dependências da anterior terminaram.
//  3. Na mesma onda rodam juntos só os cards que não brigam:
//     - dados isolados por execução (seed com {{execucao}}) é pré-requisito para qualquer paralelo;
//     - mesmo com dados isolados, cards que "alteram" a mesma coisa compartilhada vão em fila.
//  4. Card "exclusivo" (e carga, no futuro) vira um bloco sozinho.
import type { CardAvaliado } from './tipos.ts';

export interface Bloco {
  /** Branch cujo código o bloco testa. null = checkout atual. */
  branch: string | null;
  ondas: CardAvaliado[][];
  sozinho: boolean;
}

export interface PlanoBlocos {
  blocos: Bloco[];
  /** Cards que entraram porque outro depende deles. */
  incluidos: { id: string; porque: string }[];
  recusados: { id: string; motivo: string }[];
  /** Pode rodar mais de um card ao mesmo tempo dentro do bloco? */
  paralelo: boolean;
}

export function montarBlocos(todos: CardAvaliado[], ids: string[], opcoes: { dadosIsolados: boolean }): PlanoBlocos {
  const porId = new Map(todos.map((c) => [c.card.id, c]));
  const recusados: PlanoBlocos['recusados'] = [];
  const incluidos: PlanoBlocos['incluidos'] = [];
  const escolhidos = new Map<string, CardAvaliado>();

  // 1. seleção + dependências necessárias
  const incluir = (id: string, porque?: string): boolean => {
    if (escolhidos.has(id)) return true;
    const c = porId.get(id);
    if (!c) return recusar(id, 'não existe no artefato');
    if (c.estado !== 'pronto') return recusar(id, c.problemas.join(' '));
    escolhidos.set(id, c);
    for (const d of c.card.depende_de) {
      if (!incluir(d, `${id} depende dele`)) {
        escolhidos.delete(id);
        return recusar(id, `depende de ${d}, que não pode ser testado`);
      }
    }
    if (porque) incluidos.push({ id, porque });
    return true;
  };
  const recusar = (id: string, motivo: string): false => {
    if (!recusados.some((r) => r.id === id)) recusados.push({ id, motivo });
    return false;
  };
  for (const id of ids) incluir(id);

  // 2. profundidade de dependência (para ordenar blocos e ondas)
  const prof = new Map<string, number>();
  const profundidade = (id: string): number => {
    if (prof.has(id)) return prof.get(id)!;
    const c = escolhidos.get(id)!;
    const p = c.card.depende_de.length ? 1 + Math.max(...c.card.depende_de.map(profundidade)) : 0;
    prof.set(id, p);
    return p;
  };
  for (const id of escolhidos.keys()) profundidade(id);

  // 3. agrupar por código; exclusivos sozinhos
  const grupos = new Map<string, CardAvaliado[]>();
  const sozinhos: CardAvaliado[] = [];
  for (const c of [...escolhidos.values()].sort(ordem(prof))) {
    if (c.card.exclusivo) sozinhos.push(c);
    else {
      const k = c.card.branch ?? '';
      grupos.set(k, [...(grupos.get(k) ?? []), c]);
    }
  }
  const blocos: Bloco[] = [...grupos.entries()].map(([k, cards]) => ({ branch: k || null, ondas: ondas(cards, prof, opcoes.dadosIsolados), sozinho: false }));
  for (const c of sozinhos) blocos.push({ branch: c.card.branch ?? null, ondas: [[c]], sozinho: true });

  // blocos com dependência mais rasa primeiro, para as dependências entre blocos chegarem antes
  const menorProf = (b: Bloco) => Math.min(...b.ondas.flat().map((c) => prof.get(c.card.id)!));
  blocos.sort((a, b) => menorProf(a) - menorProf(b) || Number(a.sozinho) - Number(b.sozinho));
  return { blocos, incluidos, recusados, paralelo: opcoes.dadosIsolados };
}

function ordem(prof: Map<string, number>) {
  return (a: CardAvaliado, b: CardAvaliado) => prof.get(a.card.id)! - prof.get(b.card.id)! || a.card.id.localeCompare(b.card.id, 'pt-BR', { numeric: true });
}

function ondas(cards: CardAvaliado[], prof: Map<string, number>, isolado: boolean): CardAvaliado[][] {
  const doBloco = new Set(cards.map((c) => c.card.id));
  const feitos = new Set<string>();
  const restantes = [...cards].sort(ordem(prof));
  const saida: CardAvaliado[][] = [];
  while (restantes.length) {
    const onda: CardAvaliado[] = [];
    const usados = new Set<string>();
    for (const c of [...restantes]) {
      const prontoPraRodar = c.card.depende_de.every((d) => !doBloco.has(d) || feitos.has(d));
      if (!prontoPraRodar) continue;
      if (onda.length && !isolado) break; // dados compartilhados: um card por vez
      if (c.card.altera.some((r) => usados.has(r))) continue;
      onda.push(c);
      c.card.altera.forEach((r) => usados.add(r));
      restantes.splice(restantes.indexOf(c), 1);
    }
    if (!onda.length) {
      // só acontece com dependência que não fecha dentro do bloco; roda o próximo e o gate decide
      onda.push(restantes.shift()!);
    }
    onda.forEach((c) => feitos.add(c.card.id));
    saida.push(onda);
  }
  return saida;
}

/** Texto do plano de blocos, para o terminal e a extensão. */
export function descreverBlocos(p: PlanoBlocos): string {
  const linhas: string[] = [];
  p.blocos.forEach((b, i) => {
    const cod = b.branch ?? 'checkout atual';
    linhas.push(b.sozinho ? `Sozinho · ${cod} · ${b.ondas[0]![0]!.card.id} (exclusivo)` : `Bloco ${i + 1} · ${cod} · 1 app`);
    if (b.sozinho) return;
    b.ondas.forEach((o, j) => {
      const rot = j === 0 ? (o.length > 1 ? 'juntos:' : 'primeiro:') : o.length > 1 ? 'depois, juntos:' : 'depois:';
      linhas.push(`   ${rot.padEnd(16)} ${o.map((c) => `${c.card.id} ${c.card.titulo}`).join('  │  ')}`);
    });
  });
  for (const x of p.incluidos) linhas.push(`+ ${x.id} entrou porque ${x.porque}`);
  for (const x of p.recusados) linhas.push(`✗ ${x.id} fora: ${x.motivo}`);
  if (!p.paralelo) linhas.push('Um card por vez dentro de cada bloco: o seed não usa {{execucao}}, então os dados não são isolados.');
  return linhas.join('\n');
}
