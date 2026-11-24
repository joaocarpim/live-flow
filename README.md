<p align="center"><img src="assets/logo-liveflow-com-nome.svg" width="360" alt="liveflow"></p>

Testa o fluxo de tela de cada card ou branch antes de entregar. Sem IA na execução: o mesmo passo a passo roda sempre do mesmo jeito.

## Começar

```bash
npm i -D playwright            # no projeto que vai ser testado
npx playwright install chromium  # opcional: sem ele, o liveflow usa o Google Chrome instalado
liveflow iniciar               # cria .liveflow/cards.yaml de exemplo
liveflow cards                 # quais cards podem ser testados
```

## Escolher o que testar

```bash
liveflow rodar C-01 C-02                        # pelos cards do artefato
liveflow branches --atualizar                   # lista branches locais e remotas
liveflow mapear --branches feat/login,origin/feat/agenda
liveflow rodar --branches feat/login --modo rapido
liveflow rodar C-01 --ao-vivo                   # um card só, com o navegador visível
```

Branch sem card: `liveflow rascunho --branches feat/x` gera o card sem passos e `liveflow prompt artefato --branches feat/x` gera o texto para o Claude completar.

## Quando falha

```text
C-02     ✗ falhou (confirmado 3/3)  · feat/quebrado @ 31c769b
         passo 2: Não encontrei "Entrar" na tela (procurei por papel, rótulo e texto exato).
         corrigir com o Claude: liveflow prompt resolver C-02
```

Print, vídeo, `trace.zip` (abra com `npx playwright show-trace`) e `events.ndjson` ficam em `.liveflow/execucoes/`.

Detalhes, princípios e próximas fases: [CLAUDE.md](CLAUDE.md).
