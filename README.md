<p align="center"><img src="assets/logo-liveflow-com-nome.svg" width="360" alt="liveflow"></p>

Testa o fluxo de tela de cada card antes de entregar. Sem IA na execução: o mesmo passo a passo roda sempre do mesmo jeito.

## Começar

```bash
npm i -D playwright            # no projeto que vai ser testado
npx playwright install chromium  # opcional: sem ele, o liveflow usa o Google Chrome instalado
liveflow iniciar               # cria .liveflow/cards.yaml de exemplo
liveflow cards                 # quais cards podem ser testados
```

## Escolher o que testar

O liveflow testa cards. Cards da mesma branch viram um bloco e dividem o mesmo app.

```bash
liveflow blocos C-01 C-02 C-05      # mostra os blocos antes de rodar
liveflow rodar C-01 C-02 C-05
liveflow rodar --todos --modo rapido
liveflow rodar C-01 --ao-vivo       # um card só, com o navegador visível
```

```text
Bloco 1 · feat/aprovacao · 1 app
   juntos:          C-01 Aprovação  │  C-08 Fotos da vistoria
   depois:          C-05 Edição do orçamento
Bloco 2 · feat/login · 1 app
   primeiro:        C-03 Login
   depois:          C-09 Recuperar senha
```

## Criar cards a partir das branches

```bash
liveflow branches --atualizar                 # locais e remotas
liveflow mapear --branches feat/x,origin/feat/y
liveflow rascunho --branches feat/x           # card sem passos
liveflow prompt artefato --branches feat/x    # texto para o Claude completar
```

## Quando falha

```text
C-02     ✗ falhou (confirmado 3/3)  · feat/quebrado @ 31c769b
         passo 2: Não encontrei "Entrar" na tela (procurei por papel, rótulo e texto exato).
         corrigir com o Claude: liveflow prompt resolver C-02
```

Print, vídeo, `trace.zip` (abra com `npx playwright show-trace`) e `events.ndjson` ficam em `.liveflow/execucoes/`.

## Escrever o passo a passo

```bash
liveflow gravar C-04 --caminho /agenda --salvar   # faça o fluxo no navegador; vira passos do card
liveflow prompt passos C-04                       # ou peça ao Claude
```

O passo a passo aceita várias pessoas no mesmo fluxo (`como: tecnico`, `como: cliente`), guardar valores (`guardar`), enviar fotos (`enviar_arquivo`), ler o e-mail de teste (`ver_email`), tela de celular (`dispositivo: celular`) e conferências que só uma pessoa pode fazer (`conferir_manual`).

## Automatizar

```bash
liveflow hook instalar     # antes de cada push: cards da branch, modo rápido
liveflow ci gerar          # GitHub: cards da branch no PR + regressão dos entregues toda noite
liveflow historico         # últimas execuções e cards em quarentena
```

Detalhes, princípios e próximas fases: [CLAUDE.md](CLAUDE.md).
