// Zera os dados do app antes de cada tentativa (o liveflow passa o endereço em LIVEFLOW_URL).
const r = await fetch(new URL('/__seed', process.env.LIVEFLOW_URL ?? 'http://127.0.0.1:3000'), { method: 'POST' });
if (!r.ok) throw new Error(`seed falhou: ${r.status}`);
