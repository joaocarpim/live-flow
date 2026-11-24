// Descrição de um passo em linguagem simples (terminal, extensão e textos para o Claude).
import type { PassoCard } from './tipos.ts';

export function descrever(p: PassoCard): string {
  switch (p.acao) {
    case 'abrir': return `abrir ${p.caminho}`;
    case 'clicar': return `clicar em "${p.alvo}"`;
    case 'preencher': return `preencher "${p.campo}"`;
    case 'selecionar': return `selecionar "${p.opcao}" em "${p.campo}"`;
    case 'marcar': return `marcar "${p.campo}"`;
    case 'ver_texto': return `ver "${p.texto}"`;
    case 'nao_ver_texto': return `não ver "${p.texto}"`;
    case 'ver_url': return `estar em ${p.padrao}`;
    case 'api': return `${p.metodo} ${p.rota} → ${p.status}`;
    case 'esperar_ms': return `esperar ${p.ms} ms`;
  }
}
