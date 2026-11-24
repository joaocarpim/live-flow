# Começando

## Requisitos

- **Node 22.18+** (o liveflow roda TypeScript direto no Node quando clonado; instalado como pacote, usa o JavaScript compilado).
- **git** (as branches viram cópias isoladas com `git worktree`).
- **Playwright** no projeto que vai ser testado: `npm i -D playwright`. O navegador vem de `npx playwright install chromium`; se ele não estiver lá, o liveflow usa o Google Chrome instalado.

## 1. Experimente com a demo

A pasta [`exemplo/`](../exemplo) tem a **Marmoraria Pedra Fina**: login da equipe, técnico que cria orçamento e envia fotos, cliente que aceita pelo link, agenda no celular e recuperação de senha por e-mail. O script cria um repositório git com branches de verdade.

```bash
git clone https://github.com/joaocarpim/live-flow && cd live-flow && npm install
bash exemplo/criar-demo.sh /tmp/pedra-fina
cd /tmp/pedra-fina && npm install && npx playwright install chromium
export LIVEFLOW_SEGREDO_SENHA=pedra123

npx liveflow cards            # 5 prontos, 1 sem passo a passo
npx liveflow blocos --todos   # 2 blocos: feat/aceite e feat/botao-renomeado
npx liveflow rodar --todos    # 4 passam, C-05 falha (botão renomeado)
npx liveflow rodar C-02 --ao-vivo
npx liveflow prompt resolver C-05
```

## 2. No seu projeto

```bash
npm i -D github:joaocarpim/live-flow playwright
npx liveflow iniciar
```

Abra `.liveflow/cards.yaml` e ajuste o bloco `sistema`:

```yaml
sistema:
  url: http://localhost:{{porta}}
  permitidos: [localhost, 127.0.0.1]
  producao: [app.suaempresa.com.br]   # nunca é alvo
  base: main
  preparar: npm ci                    # pulado quando o lockfile é igual ao seu
  iniciar: npm run dev -- --port {{porta}}
  saude: /
  seed: npm run seed:teste            # zera o banco antes de cada tentativa
```

> Sem `iniciar`, o liveflow só testa a branch do seu checkout atual e recusa cards de outras branches, porque não teria como garantir qual código está no ar.

Confira o ambiente:

```bash
npx liveflow ambiente
```

## 3. Escreva o primeiro card

Três jeitos:

- **Gravando:** `npx liveflow gravar C-01 --caminho /login --salvar`. O navegador abre, você faz o fluxo, fecha a janela e os passos entram no card. Senhas viram `{{segredo:senha}}`.
- **Com o Claude:** `npx liveflow prompt passos C-01` gera o texto; com o [plugin](claude.md) instalado, peça "escreva o passo a passo do C-01".
- **À mão:** veja [artefato.md](artefato.md).

Depois de gravar, acrescente o que **prova** o resultado (`ver_texto`, `ver_url`, `api` com `contem`) e ligue cada critério com `criterio: N`.

## 4. Rode

```bash
npx liveflow rodar C-01 --ao-vivo     # um card, com o navegador visível
npx liveflow rodar --da-branch        # os cards da branch atual
npx liveflow rodar --todos --modo completo
```

Evidências (print, vídeo, trace, eventos) ficam em `.liveflow/execucoes/`. Adicione ao `.gitignore`:

```gitignore
.liveflow/execucoes
```

## Próximos passos

- [Extensão do VS Code](extensao.md) para fazer tudo isso com cliques.
- [Hook e CI](ci.md) para rodar sem precisar lembrar.
