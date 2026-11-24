// Extensão do VS Code do liveflow.
// A extensão é só a interface: quem testa é a CLI do liveflow (empacotada em dist/cli), sem IA.
// Ela lê o mesmo events.ndjson que o terminal, então o que aparece aqui é igual ao que o terminal mostra.
import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Msg = { tipo: string; [k: string]: unknown };

class Cli {
  constructor(private ext: vscode.ExtensionContext, public repo: string) {}

  private caminho(): string {
    return join(this.ext.extensionPath, 'dist', 'cli', 'cli.js');
  }

  private node(): string {
    return vscode.workspace.getConfiguration('liveflow').get<string>('node') || 'node';
  }

  /** Segredos guardados no cofre do VS Code viram variáveis de ambiente só para o processo do liveflow. */
  async ambiente(): Promise<NodeJS.ProcessEnv> {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const nomes = await this.segredosDoArtefato();
    for (const n of nomes) {
      const v = await this.ext.secrets.get(`liveflow.segredo.${n}`);
      if (v !== undefined) env[`LIVEFLOW_SEGREDO_${n.toUpperCase()}`] = v;
    }
    return env;
  }

  async segredosDoArtefato(): Promise<string[]> {
    const arq = join(this.repo, '.liveflow', 'cards.yaml');
    if (!existsSync(arq)) return [];
    return [...new Set([...readFileSync(arq, 'utf8').matchAll(/\{\{\s*segredo:([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]!))].sort();
  }

  /** Roda um comando da CLI e devolve o JSON (ou o texto, quando o comando não tem JSON). */
  async chamar(args: string[], json = true): Promise<{ codigo: number; dados: unknown; texto: string; erro: string }> {
    const env = await this.ambiente();
    return new Promise((resolve) => {
      const p = spawn(this.node(), [this.caminho(), ...args, '--repo', this.repo, ...(json ? ['--json'] : [])], { cwd: this.repo, env });
      let out = '';
      let err = '';
      p.stdout.on('data', (b) => (out += b));
      p.stderr.on('data', (b) => (err += b));
      p.on('error', (e) => resolve({ codigo: 127, dados: null, texto: '', erro: `Não consegui rodar o Node (${this.node()}): ${e.message}. Ajuste a configuração liveflow.node.` }));
      p.on('close', (codigo) => {
        let dados: unknown = null;
        if (json) {
          try { dados = JSON.parse(out); } catch { /* sem JSON */ }
        }
        resolve({ codigo: codigo ?? 1, dados, texto: out, erro: err.trim() });
      });
    });
  }

  /** Roda os cards e repassa cada evento conforme é gravado no events.ndjson. */
  async rodar(ids: string[], modo: string, aoVivo: boolean, aoEvento: (e: Msg) => void, aoFim: (res: unknown, erro: string) => void): Promise<ChildProcess> {
    const pasta = join(this.repo, '.liveflow', 'execucoes', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(pasta, { recursive: true });
    const eventos = join(pasta, 'events.ndjson');
    const env = await this.ambiente();
    const args = [this.caminho(), 'rodar', ...ids, '--modo', modo, '--pasta', pasta, '--repo', this.repo, '--json', ...(aoVivo ? ['--ao-vivo'] : [])];
    const p = spawn(this.node(), args, { cwd: this.repo, env });
    let lido = 0;
    let resto = '';
    const ler = () => {
      if (!existsSync(eventos)) return;
      const tam = statSync(eventos).size;
      if (tam <= lido) return;
      const fd = openSync(eventos, 'r');
      const buf = Buffer.alloc(tam - lido);
      readSync(fd, buf, 0, buf.length, lido);
      closeSync(fd);
      lido = tam;
      resto += buf.toString('utf8');
      const linhas = resto.split('\n');
      resto = linhas.pop() ?? '';
      for (const l of linhas) if (l.trim()) aoEvento(JSON.parse(l) as Msg);
    };
    const relogio = setInterval(ler, 250);
    let err = '';
    p.stderr.on('data', (b) => (err += b));
    p.on('close', () => {
      clearInterval(relogio);
      ler();
      const arq = join(pasta, 'resultado.json');
      aoFim(existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : null, err.trim());
    });
    return p;
  }
}

class Painel {
  static atual: Painel | undefined;
  private execucao: ChildProcess | undefined;
  private constructor(private ext: vscode.ExtensionContext, private cli: Cli, private painel: vscode.WebviewPanel, private atualizarLateral: () => void) {
    painel.webview.html = html(painel.webview, ext, 'principal');
    painel.webview.onDidReceiveMessage((m: Msg) => this.receber(m));
    painel.onDidDispose(() => {
      this.execucao?.kill();
      Painel.atual = undefined;
    });
  }

  static abrir(ext: vscode.ExtensionContext, cli: Cli, atualizarLateral: () => void, depois?: Msg): Painel {
    if (!Painel.atual) {
      const painel = vscode.window.createWebviewPanel('liveflow.painel', 'liveflow', vscode.ViewColumn.One, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(ext.extensionUri, 'media'), vscode.Uri.file(join(cli.repo, '.liveflow'))],
      });
      painel.iconPath = vscode.Uri.joinPath(ext.extensionUri, 'media', 'activitybar.svg');
      Painel.atual = new Painel(ext, cli, painel, atualizarLateral);
    } else Painel.atual.painel.reveal();
    if (depois) setTimeout(() => Painel.atual?.painel.webview.postMessage({ tipo: 'navegar', destino: depois }), 300);
    return Painel.atual;
  }

  private enviar(m: Msg): void {
    void this.painel.webview.postMessage(m);
  }

  /** Caminho de arquivo da execução → endereço que o webview consegue mostrar. */
  private uri(arq: unknown): string | undefined {
    return typeof arq === 'string' && existsSync(arq) ? this.painel.webview.asWebviewUri(vscode.Uri.file(arq)).toString() : undefined;
  }

  async receber(m: Msg): Promise<void> {
    await tratarComum(this.ext, this.cli, m, (x) => this.enviar(x), this.atualizarLateral);
    switch (m.tipo) {
      case 'rodar': {
        if (this.execucao) return void vscode.window.showWarningMessage('Já existe uma execução em andamento.');
        const ids = m.ids as string[];
        this.enviar({ tipo: 'execucao_comecou', ids, aoVivo: !!m.aoVivo });
        this.execucao = await this.cli.rodar(
          ids,
          String(m.modo ?? 'completo'),
          !!m.aoVivo,
          (e) => this.enviar({ tipo: 'evento', evento: { ...e, imagem: this.uri(e.arquivo) } }),
          (res, erro) => {
            this.execucao = undefined;
            const lista = (res as { falha?: { print?: string } }[] | null)?.map((r) => ({ ...r, printUri: this.uri(r.falha?.print) })) ?? null;
            this.enviar({ tipo: 'execucao_terminou', resultados: lista, erro });
            this.atualizarLateral();
            void avisarFim(lista as { card?: string; resultado?: string; motivo?: string }[] | null, erro);
          },
        );
        return;
      }
      case 'parar':
        this.execucao?.kill('SIGTERM');
        return;
    }
  }
}

/** Aviso no canto ao terminar: conta cada resultado e diz por que um card não rodou. */
async function avisarFim(lista: { card?: string; resultado?: string; motivo?: string }[] | null, erro: string): Promise<void> {
  if (!lista) return void vscode.window.showErrorMessage(`liveflow: a execução não terminou. ${erro}`);
  const n = (r: string) => lista.filter((c) => c.resultado === r).length;
  const partes = [[n('passou'), 'passou'], [n('falhou'), 'com falha confirmada'], [n('instavel'), 'instável'], [n('nao_rodou'), 'não rodou']].filter(([q]) => q).map(([q, t]) => `${q} ${t}`);
  const parado = lista.find((c) => c.resultado === 'nao_rodou' && c.motivo);
  const texto = `liveflow: ${partes.join(', ') || 'nenhum card'}.${parado ? ` ${parado.card} não rodou: ${parado.motivo}` : ''}`;
  if (n('falhou') || n('nao_rodou')) void vscode.window.showWarningMessage(texto);
  else void vscode.window.showInformationMessage(texto);
}

/** Mensagens que valem para o painel e para a barra lateral. */
async function tratarComum(ext: vscode.ExtensionContext, cli: Cli, m: Msg, enviar: (m: Msg) => void, atualizarLateral: () => void): Promise<void> {
  const resposta = (tipo: string, dados: unknown, extra: Record<string, unknown> = {}) => enviar({ tipo, dados, ...extra });
  switch (m.tipo) {
    case 'pronto':
    case 'recarregar': {
      const [cards, ambiente, historico, segredos] = await Promise.all([cli.chamar(['cards']), cli.chamar(['ambiente']), cli.chamar(['historico']), cli.segredosDoArtefato()]);
      const guardados = await Promise.all(segredos.map(async (n) => ({ nome: n, definido: (await ext.secrets.get(`liveflow.segredo.${n}`)) !== undefined })));
      resposta('estado', { cards: cards.dados ?? [], ambiente: ambiente.dados, historico: historico.dados, segredos: guardados, repo: cli.repo, erro: cards.dados ? '' : cards.erro });
      return;
    }
    case 'abrirPainel':
      Painel.abrir(ext, cli, atualizarLateral, m.depois as Msg | undefined);
      return;
    case 'plano': {
      const r = await cli.chamar(['plano', String(m.id), '--modo', String(m.modo ?? 'completo')]);
      resposta('plano', r.dados, { id: m.id });
      return;
    }
    case 'blocos': {
      const r = await cli.chamar(['blocos', ...(m.ids as string[])]);
      resposta('blocos', r.dados, { ids: m.ids });
      return;
    }
    case 'prompt': {
      let args = ['prompt', String(m.qual), String(m.id)];
      if (m.qual === 'artefato') {
        // os cards que a pessoa colou vão por arquivo temporário (texto livre, pode ser longo)
        const arq = join(tmpdir(), `liveflow-cards-${process.pid}.txt`);
        writeFileSync(arq, String(m.texto ?? ''));
        args = ['prompt', 'artefato', '--de', arq];
      }
      const r = await cli.chamar(args, false);
      resposta('prompt', r.texto.trim() || r.erro, { qual: m.qual, id: m.id });
      return;
    }
    case 'copiar':
      await vscode.env.clipboard.writeText(String(m.texto));
      void vscode.window.showInformationMessage('Texto copiado.');
      return;
    case 'claude': {
      // Abrir o Claude com o texto já escrito não é garantido em todo lugar; copiar sempre funciona.
      await vscode.env.clipboard.writeText(String(m.texto));
      const t = vscode.window.createTerminal({ name: 'Claude Code', cwd: cli.repo });
      t.show();
      t.sendText('claude');
      void vscode.window.showInformationMessage('O texto está copiado. Cole no Claude Code (Ctrl+V / Cmd+V) e envie.');
      return;
    }
    case 'abrirYaml': {
      const arq = vscode.Uri.file(join(cli.repo, '.liveflow', 'cards.yaml'));
      const doc = await vscode.workspace.openTextDocument(arq);
      const linha = m.id ? doc.getText().split('\n').findIndex((l) => new RegExp(`id:\\s*${String(m.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l)) : -1;
      const ed = await vscode.window.showTextDocument(doc);
      if (linha >= 0) ed.revealRange(new vscode.Range(linha, 0, linha, 0), vscode.TextEditorRevealType.AtTop);
      return;
    }
    case 'abrirArquivo':
      if (typeof m.caminho === 'string' && existsSync(m.caminho)) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(m.caminho));
      return;
    case 'trace': {
      const t = vscode.window.createTerminal({ name: 'liveflow trace', cwd: cli.repo });
      t.show();
      t.sendText(`npx playwright show-trace ${JSON.stringify(String(m.caminho))}`);
      return;
    }
    case 'gravar': {
      const t = vscode.window.createTerminal({ name: `liveflow gravar ${m.id}`, cwd: cli.repo, env: await cli.ambiente() as Record<string, string> });
      t.show();
      const node = vscode.workspace.getConfiguration('liveflow').get<string>('node') || 'node';
      t.sendText(`${node} ${JSON.stringify(join(ext.extensionPath, 'dist', 'cli', 'cli.js'))} gravar ${m.id} --caminho ${JSON.stringify(String(m.caminho || '/'))} --salvar`);
      void vscode.window.showInformationMessage('O navegador vai abrir. Faça o fluxo e feche a janela: os passos entram no card. Depois clique em Recarregar.');
      return;
    }
    case 'definirSegredo': {
      const v = await vscode.window.showInputBox({ prompt: `Valor de "${m.nome}" (fica no cofre do VS Code, nunca em arquivo)`, password: true, ignoreFocusOut: true });
      if (v !== undefined) await ext.secrets.store(`liveflow.segredo.${m.nome}`, v);
      await tratarComum(ext, cli, { tipo: 'recarregar' }, enviar, atualizarLateral);
      return;
    }
    case 'acao': {
      const mapa: Record<string, string[]> = { hook: ['hook', 'instalar'], ci: ['ci', 'gerar'], iniciar: ['iniciar'] };
      const r = await cli.chamar(mapa[String(m.qual)] ?? [], false);
      void (r.codigo === 0 ? vscode.window.showInformationMessage(r.texto.trim()) : vscode.window.showErrorMessage(r.erro || r.texto));
      if (m.qual === 'iniciar') {
        await tratarComum(ext, cli, { tipo: 'recarregar' }, enviar, atualizarLateral);
        atualizarLateral();
      }
      return;
    }
  }
}

class Lateral implements vscode.WebviewViewProvider {
  view: vscode.WebviewView | undefined;
  constructor(private ext: vscode.ExtensionContext, private cli: Cli) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ext.extensionUri, 'media')] };
    view.webview.html = html(view.webview, this.ext, 'lateral');
    view.webview.onDidReceiveMessage((m: Msg) => tratarComum(this.ext, this.cli, m, (x) => void view.webview.postMessage(x), () => this.atualizar()));
  }
  atualizar(): void {
    void this.view?.webview.postMessage({ tipo: 'pedirRecarga' });
  }
}

function html(webview: vscode.Webview, ext: vscode.ExtensionContext, modo: 'principal' | 'lateral'): string {
  const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(ext.extensionUri, 'media', f)).toString();
  const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${media('app.css')}">
<title>liveflow</title>
</head>
<body data-modo="${modo}" data-logo="${media('logo-liveflow.svg')}">
<div id="app"></div>
<script nonce="${nonce}" src="${media('app.js')}"></script>
</body>
</html>`;
}

export function activate(ext: vscode.ExtensionContext): void {
  const pasta = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!pasta) return;
  const cli = new Cli(ext, pasta);
  const lateral = new Lateral(ext, cli);
  ext.subscriptions.push(
    vscode.window.registerWebviewViewProvider('liveflow.cards', lateral),
    vscode.commands.registerCommand('liveflow.abrir', () => Painel.abrir(ext, cli, () => lateral.atualizar())),
    vscode.commands.registerCommand('liveflow.atualizar', () => {
      lateral.atualizar();
      void Painel.atual?.receber({ tipo: 'recarregar' });
    }),
    vscode.commands.registerCommand('liveflow.iniciar', () => tratarComum(ext, cli, { tipo: 'acao', qual: 'iniciar' }, () => undefined, () => lateral.atualizar())),
    vscode.commands.registerCommand('liveflow.definirSegredo', async () => {
      const nomes = await cli.segredosDoArtefato();
      const nome = nomes.length ? await vscode.window.showQuickPick(nomes, { placeHolder: 'Qual segredo?' }) : await vscode.window.showInputBox({ prompt: 'Nome do segredo' });
      if (nome) await tratarComum(ext, cli, { tipo: 'definirSegredo', nome }, () => undefined, () => lateral.atualizar());
    }),
  );
  const vigia = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(pasta, '.liveflow/cards.yaml'));
  vigia.onDidChange(() => vscode.commands.executeCommand('liveflow.atualizar'));
  vigia.onDidCreate(() => vscode.commands.executeCommand('liveflow.atualizar'));
  ext.subscriptions.push(vigia);
}

export function deactivate(): void {
  /* nada a liberar: processos filhos são mortos quando o painel fecha */
}
