// Repetir antes de acusar: uma falha só é "confirmada" se acontecer em todas as tentativas.
// Se passar em alguma, é "instável" e não bloqueia o card (vai para quarentena).

export type Veredito = { resultado: 'passou'; tentativas: 1 } | { resultado: 'falhou'; certeza: 'confirmado'; tentativas: number } | { resultado: 'instavel'; tentativas: number; falhas: number };

export async function comRepeticao(tentar: (n: number) => Promise<boolean>, maximo = 3): Promise<Veredito> {
  if (await tentar(1)) return { resultado: 'passou', tentativas: 1 };
  let falhas = 1;
  for (let n = 2; n <= maximo; n++) {
    if (!(await tentar(n))) falhas++;
  }
  return falhas === maximo ? { resultado: 'falhou', certeza: 'confirmado', tentativas: maximo } : { resultado: 'instavel', tentativas: maximo, falhas };
}
