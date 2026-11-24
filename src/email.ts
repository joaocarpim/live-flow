// Lê e-mails de uma caixa de teste (Mailpit), para fluxos como "recuperar senha".
// Só e-mails recebidos depois do início da tentativa contam, para não pegar um antigo.

export interface EmailLido {
  assunto: string;
  texto: string;
  links: string[];
}

interface ResumoMailpit {
  ID: string;
  Subject: string;
  Created: string;
  To?: { Address: string }[];
}

export async function buscarEmail(mailpit: string, para: string, assunto: string | undefined, desde: Date, limiteMs: number): Promise<EmailLido> {
  const base = mailpit.replace(/\/$/, '');
  const consulta = `to:"${para}"${assunto ? ` subject:"${assunto}"` : ''}`;
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const r = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(consulta)}`).catch(() => null);
    if (r?.ok) {
      const { messages = [] } = (await r.json()) as { messages?: ResumoMailpit[] };
      const certo = messages
        .filter((m) => new Date(m.Created).getTime() >= desde.getTime() - 1000)
        .filter((m) => !m.To || m.To.some((t) => t.Address.toLowerCase() === para.toLowerCase()))
        .filter((m) => !assunto || m.Subject.toLowerCase().includes(assunto.toLowerCase()))
        .sort((a, b) => b.Created.localeCompare(a.Created))[0];
      if (certo) {
        const msg = (await (await fetch(`${base}/api/v1/message/${encodeURIComponent(certo.ID)}`)).json()) as { Subject: string; Text?: string; HTML?: string };
        const corpo = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`;
        return { assunto: msg.Subject, texto: msg.Text ?? '', links: extrairLinks(corpo) };
      }
    }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`Nenhum e-mail para ${para}${assunto ? ` com assunto "${assunto}"` : ''} chegou em ${Math.round(limiteMs / 1000)} s.`);
}

export function extrairLinks(corpo: string): string[] {
  const vistos = new Set<string>();
  for (const m of corpo.matchAll(/https?:\/\/[^\s"'<>()]+/g)) vistos.add(m[0].replace(/&amp;/g, '&').replace(/[.,;]+$/, ''));
  return [...vistos];
}
