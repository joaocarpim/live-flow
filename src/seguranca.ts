// Trava de alvo: o liveflow só testa endereços permitidos e nunca produção.
import type { Sistema } from './tipos.ts';

export function verificarAlvo(url: string, sistema: Pick<Sistema, 'permitidos' | 'producao'>): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return `Endereço inválido: ${url}`;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `Só http e https são permitidos (veio ${u.protocol}).`;
  const host = u.hostname.toLowerCase();
  const hostPorta = u.port ? `${host}:${u.port}` : host;
  const bate = (lista: string[]) => lista.some((h) => h.toLowerCase() === host || h.toLowerCase() === hostPorta);
  if (bate(sistema.producao)) return `${host} está marcado como produção. O liveflow nunca testa produção.`;
  if (!bate(sistema.permitidos)) return `${host} não está em sistema.permitidos. Adicione no artefato se for um ambiente de teste.`;
  return null;
}
