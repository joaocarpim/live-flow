// Descrição de um passo em linguagem simples (terminal, extensão e textos para o Claude).
import type { PassoCard } from './tipos.ts';

export function descrever(p: PassoCard): string {
  const quem = p.como ? `[${p.como}] ` : '';
  return quem + descreverAcao(p);
}

function descreverAcao(p: PassoCard): string {
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
    case 'enviar_arquivo': return `enviar ${p.arquivos.join(', ')} em "${p.campo}"`;
    case 'guardar': return `guardar ${p.nome} ${p.da_url ? 'da URL' : 'do texto da tela'}`;
    case 'ver_email': return `ver e-mail para ${p.para}${p.assunto ? ` ("${p.assunto}")` : ''}`;
    case 'conferir_manual': return `conferir à mão: ${p.texto}`;
  }
}
