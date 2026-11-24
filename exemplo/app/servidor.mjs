// Marmoraria Pedra Fina: app de exemplo para experimentar o liveflow. Sem dependências.
// Técnico faz a vistoria e manda fotos; o cliente aceita o orçamento pelo link; agenda no celular;
// recuperar senha por e-mail (com uma caixa de teste compatível com a API do Mailpit em /__mailpit).
import { createServer } from 'node:http';

const BOTAO_ACEITE = process.env.BOTAO_ACEITE || 'Aceitar orçamento';
const USUARIOS = { 'tecnico@pedrafina.local': 'Rafael (técnico)', 'cliente@construtora.local': 'Construtora Alvorada' };
let estado;
function zerar() {
  estado = {
    proximo: 1043,
    orcamentos: { 1042: { id: 1042, cliente: 'Construtora Alvorada', item: 'Bancada em granito São Gabriel, 2,40 m', valor: 'R$ 3.890,00', fotos: 0, aceito: false } },
    emails: [],
  };
}
zerar();

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f1ec;color:#1f2328}
header{background:#1d2b2a;color:#fff;padding:14px 28px;display:flex;align-items:center;gap:12px}
header b{font-size:17px;letter-spacing:-.01em}header span{opacity:.7;font-size:13px}header nav{margin-left:auto;display:flex;gap:16px;font-size:14px}
header a{color:#fff;text-decoration:none;opacity:.85}.logo{width:28px;height:28px;border-radius:7px;background:linear-gradient(135deg,#c9b79c,#7d6b55)}
main{max-width:980px;margin:28px auto;padding:0 20px;display:flex;flex-direction:column;gap:18px}
.cartao{background:#fff;border:1px solid #e5dfd5;border-radius:14px;padding:22px 24px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:15px;margin:0 0 12px;color:#5c5346;text-transform:uppercase;letter-spacing:.06em}
.muted{color:#6b6357}.linha{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid #efe9df}
.linha:first-child{border-top:0}.tag{font-size:12px;padding:3px 9px;border-radius:999px;background:#efe7da;color:#5c4b33}
.tag.ok{background:#dff3e8;color:#1b6b45}label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
input,select{width:100%;padding:11px 12px;border:1px solid #d9d1c4;border-radius:9px;font:inherit;background:#fffdfa}
button,.botao{display:inline-block;margin-top:16px;padding:11px 18px;border-radius:9px;border:0;background:#2f6f5e;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
button.sec{background:#fff;color:#2f6f5e;border:1px solid #2f6f5e}.grande{font-size:28px;font-weight:700;letter-spacing:-.02em}
.aviso{background:#dff3e8;color:#1b6b45;border-radius:10px;padding:12px 14px;font-weight:600}.erro{background:#fde7e5;color:#9b2c22;border-radius:10px;padding:12px 14px}
.login{max-width:420px;margin:60px auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
@media (max-width:500px){header{padding:12px 16px}header nav{display:none}main{margin:16px auto}.grande{font-size:22px}}`;

const pagina = (titulo, corpo, usuario) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo} · Pedra Fina</title><style>${CSS}</style></head>
<body><header><div class="logo"></div><b>Pedra Fina</b><span>marmoraria</span>${usuario ? `<nav><a href="/painel">Painel</a><a href="/agenda">Agenda</a><a href="/sair">Sair</a></nav>` : ''}</header><main>${corpo}</main></body></html>`;
const quem = (req) => decodeURIComponent((/usuario=([^;]+)/.exec(req.headers.cookie || '') || [])[1] || '');
const corpo = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => ok(d)); });

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const html = (t, c, usr) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(pagina(t, c, usr)); };
  const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  const ir = (l, extra = {}) => { res.writeHead(303, { location: l, ...extra }); res.end(); };

  // --- apoio aos testes: zerar dados e caixa de e-mail no formato da API do Mailpit ---
  if (u.pathname === '/__seed' && req.method === 'POST') { zerar(); return json({ ok: true }); }
  if (u.pathname === '/__mailpit/api/v1/search') {
    const para = /to:"([^"]+)"/.exec(u.searchParams.get('query') || '')?.[1];
    return json({ messages: estado.emails.filter((m) => m.To[0].Address === para) });
  }
  const msg = /^\/__mailpit\/api\/v1\/message\/(\w+)$/.exec(u.pathname);
  if (msg) { const m = estado.emails.find((x) => x.ID === msg[1]); return json(m ? { Subject: m.Subject, Text: m.Text } : {}); }

  if (u.pathname === '/login' && req.method === 'POST') {
    const f = new URLSearchParams(await corpo(req));
    if (!USUARIOS[f.get('email')] || f.get('senha') !== 'pedra123') return html('Entrar', `<div class="cartao login"><h1>Entrar</h1><div class="erro">E-mail ou senha incorretos</div><p><a href="/login">Tentar de novo</a></p></div>`);
    return ir(f.get('email').startsWith('cliente') ? '/minha-area' : '/painel', { 'set-cookie': `usuario=${encodeURIComponent(f.get('email'))}; Path=/; HttpOnly` });
  }
  if (u.pathname === '/login' || u.pathname === '/') {
    return html('Entrar', `<div class="cartao login"><h1>Entrar</h1><p class="muted">Acesso da equipe e dos clientes</p><form method="post" action="/login">
      <label for="e">E-mail</label><input id="e" name="email" autocomplete="username"><label for="s">Senha</label><input id="s" name="senha" type="password" autocomplete="current-password">
      <button>Entrar</button></form><p class="muted"><a href="/esqueci">Esqueci a senha</a></p></div>`);
  }
  if (u.pathname === '/esqueci' && req.method === 'POST') {
    const f = new URLSearchParams(await corpo(req));
    const link = `http://${req.headers.host}/redefinir?t=7f3a9c`;
    estado.emails.push({ ID: String(estado.emails.length + 1), Subject: 'Redefinir sua senha', Created: new Date().toISOString(), To: [{ Address: f.get('email') }], Text: `Olá! Para criar uma nova senha, acesse ${link}` });
    return html('Senha', `<div class="cartao login"><h1>Verifique seu e-mail</h1><div class="aviso">Enviamos um link para o seu e-mail</div></div>`);
  }
  if (u.pathname === '/esqueci') return html('Senha', `<div class="cartao login"><h1>Esqueci a senha</h1><form method="post" action="/esqueci"><label for="e">E-mail</label><input id="e" name="email"><button>Enviar link</button></form></div>`);
  if (u.pathname === '/redefinir') return html('Nova senha', u.searchParams.get('t') === '7f3a9c' ? `<div class="cartao login"><h1>Nova senha</h1><label for="n">Nova senha</label><input id="n" type="password"><button>Salvar senha</button></div>` : `<div class="cartao login"><div class="erro">Link inválido ou expirado</div></div>`);

  const usuario = quem(req);
  if (!usuario) return ir('/login');
  if (u.pathname === '/sair') return ir('/login', { 'set-cookie': 'usuario=; Path=/; Max-Age=0' });
  const orcs = Object.values(estado.orcamentos);
  if (u.pathname === '/painel') {
    return html('Painel', `<div><h1>Olá, ${USUARIOS[usuario]}</h1><p class="muted">Vistorias e orçamentos da semana</p></div>
      <div class="grid"><div class="cartao"><h2>Vistorias hoje</h2><div class="grande">3</div></div><div class="cartao"><h2>Orçamentos abertos</h2><div class="grande">${orcs.filter((o) => !o.aceito).length}</div></div><div class="cartao"><h2>Aceitos no mês</h2><div class="grande">${orcs.filter((o) => o.aceito).length + 11}</div></div></div>
      <div class="cartao"><h2>Orçamentos</h2>${orcs.map((o) => `<div class="linha"><div><b>Orçamento nº ${o.id}</b><div class="muted">${o.cliente} · ${o.item}</div></div><span class="tag ${o.aceito ? 'ok' : ''}">${o.aceito ? 'aceito' : 'aguardando cliente'}</span></div>`).join('')}
      <form method="post" action="/orcamentos"><button>Criar orçamento</button></form></div>`, usuario);
  }
  if (u.pathname === '/orcamentos' && req.method === 'POST') {
    const id = estado.proximo++;
    estado.orcamentos[id] = { id, cliente: 'Construtora Alvorada', item: 'Soleira em mármore Carrara, 6 peças', valor: 'R$ 1.260,00', fotos: 0, aceito: false };
    return ir(`/orcamentos/${id}`);
  }
  const m = /^\/orcamentos\/(\d+)$/.exec(u.pathname);
  if (m && estado.orcamentos[m[1]]) {
    const o = estado.orcamentos[m[1]];
    if (req.method === 'POST') { const b = await corpo(req); o.fotos += (b.match(/filename="[^"]+"/g) || []).length; }
    return html(`Orçamento ${o.id}`, `<div><h1>Orçamento nº ${o.id}</h1><p class="muted">${o.cliente}</p></div>
      <div class="cartao"><h2>Item</h2><div class="linha"><span>${o.item}</span><b>${o.valor}</b></div></div>
      <div class="cartao"><h2>Fotos da vistoria</h2>${o.fotos ? `<div class="aviso">${o.fotos} foto(s) recebida(s)</div>` : '<p class="muted">Nenhuma foto ainda.</p>'}
      <form method="post" enctype="multipart/form-data"><label for="f">Fotos</label><input id="f" name="fotos" type="file" multiple accept="image/*"><button>Enviar fotos</button></form>
      <p class="muted">Link para o cliente: /aceite/${o.id}</p></div>`, usuario);
  }
  const a = /^\/aceite\/(\d+)$/.exec(u.pathname);
  if (a && estado.orcamentos[a[1]]) {
    const o = estado.orcamentos[a[1]];
    if (req.method === 'POST') { o.aceito = true; return html('Aceite', `<div class="cartao"><div class="aviso">Orçamento ${o.id} aceito por ${USUARIOS[usuario]}</div><p class="muted">A marmoraria vai entrar em contato para agendar a instalação.</p></div>`, usuario); }
    return html('Aceite', `<div class="cartao"><h1>Orçamento nº ${o.id}</h1><p class="muted">${o.item}</p><div class="grande">${o.valor}</div><form method="post"><button>${BOTAO_ACEITE}</button></form></div>`, usuario);
  }
  if (u.pathname === '/minha-area') return html('Minha área', `<div class="cartao"><h1>Olá, ${USUARIOS[usuario]}</h1><p class="muted">Seus orçamentos aparecem aqui.</p><a href="/sair">Sair</a></div>`, usuario);
  if (u.pathname === '/agenda') {
    return html('Agenda', `<div><h1>Agenda de hoje</h1><p class="muted">Rafael (técnico)</p></div><div class="cartao"><h2>Hoje</h2>
      <div class="linha"><div><b>08:30 · Vistoria</b><div class="muted">Rua das Acácias, 120</div></div><span class="tag">a caminho</span></div>
      <div class="linha"><div><b>11:00 · Medição de bancada</b><div class="muted">Construtora Alvorada</div></div><span class="tag">agendado</span></div>
      <div class="linha"><div><b>15:30 · Instalação</b><div class="muted">Orçamento nº 1042</div></div><span class="tag ok">confirmado</span></div></div>`, usuario);
  }
  res.statusCode = 404;
  html('Não encontrado', '<div class="cartao"><h1>Página não encontrada</h1></div>', usuario);
}).listen(Number(process.argv[2] || process.env.PORT || 3000), '127.0.0.1');
