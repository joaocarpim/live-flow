// Quando um botão ou campo some, sugere o que existe na tela parecido com ele.
// Ajuda a separar "teste desatualizado" (o texto mudou) de "bug" (a ação sumiu). Sem IA.

export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) atual[j] = Math.min(ant[j]! + 1, atual[j - 1]! + 1, ant[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = atual;
  }
  return ant[n]!;
}

export function semelhanca(a: string, b: string): number {
  const x = normalizar(a);
  const y = normalizar(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  return 1 - distancia(x, y) / Math.max(x.length, y.length);
}

/** Os até 3 textos mais parecidos (a partir de 0,4 de semelhança), do mais para o menos. */
export function sugerirParecidos(alvo: string, candidatos: string[]): string[] {
  const unicos = [...new Set(candidatos.map((c) => c.trim()).filter((c) => c && c.length <= 80))];
  return unicos
    .map((c) => ({ c, s: semelhanca(alvo, c) }))
    .filter((x) => x.s >= 0.4)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((x) => x.c);
}
