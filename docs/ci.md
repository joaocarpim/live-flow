# CI e automação

O liveflow precisa estar no projeto testado: `npm i -D github:joaocarpim/live-flow playwright`.

## GitHub Action

```yaml
name: liveflow
on:
  pull_request:
  schedule:
    - cron: '17 6 * * *'     # regressão toda noite
jobs:
  cards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }          # as branches precisam existir
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npx playwright install --with-deps chromium
      - uses: joaocarpim/live-flow@main
        with:
          regressao: ${{ github.event_name == 'schedule' }}
        env:
          LIVEFLOW_SEGREDO_SENHA: ${{ secrets.LIVEFLOW_SEGREDO_SENHA }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: liveflow-evidencias, path: .liveflow/execucoes/, retention-days: 14 }
```

| Entrada | Padrão | O que faz |
|---|---|---|
| `cards` | vazio | ids separados por espaço; vazio = cards da branch do PR |
| `regressao` | `false` | `true` roda os cards entregues no código da base |
| `modo` | `rapido` | `rapido`, `completo` ou `noturno` |
| `junit` | `liveflow-junit.xml` | caminho do relatório JUnit |

## Workflow gerado

`npx liveflow ci gerar` cria `.github/workflows/liveflow.yml` com PR, regressão noturna, envio das evidências e a lista dos segredos que o artefato usa.

## Antes de cada push

```bash
npx liveflow hook instalar
```

Roda `liveflow rodar --da-branch --modo rapido` antes de cada push. Para pular uma vez: `git push --no-verify`. Se já existir um hook seu, o liveflow não sobrescreve (use `--forcar` ou chame o comando de dentro do seu hook).

## JUnit

`--junit arquivo.xml`: falha confirmada vira `<failure>`, instável e "não rodou" viram `<skipped>` com o motivo, conferências manuais vão em `<system-out>`.
