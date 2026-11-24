# Comandos

Todos aceitam `--repo <pasta>` (padrão: pasta atual) e, quando faz sentido, `--json`.

## Testar

| Comando | O que faz |
|---|---|
| `liveflow cards` | lista os cards: pronto, sem passos ou inválido (com o motivo) |
| `liveflow blocos <card...> \| --todos` | mostra como os cards vão rodar: blocos, ondas, incluídos e recusados |
| `liveflow rodar <card...>` | testa os cards |
| `liveflow rodar --todos` | todos os cards prontos |
| `liveflow rodar --da-branch [--branch-atual nome]` | só os cards da branch atual (o pre-push e o PR usam) |
| `liveflow rodar --regressao` | cards `entregue: sim`, no código da base |
| `liveflow plano <card> [--modo m]` | o que cada uma das 25 camadas faz no card, e por quê |
| `liveflow historico [card...]` | últimas execuções e cards em quarentena |
| `liveflow prompt resolver <card>` | texto para o Claude corrigir a última falha do card |

Opções de `rodar`:

| Opção | Padrão | O que faz |
|---|---|---|
| `--modo rapido\|completo\|noturno` | `completo` | rápido: fluxo; completo: + vizinhos; noturno: + carga e teste longo (quando existirem) |
| `--ao-vivo` | | navegador visível; com vários cards, roda um por vez mostrando cada um (dependências rodam escondidas). Sem tela para a janela, roda escondido e manda a tela para a extensão |
| `--junit <arquivo>` | | relatório JUnit para o CI |
| `--pasta <dir>` | `.liveflow/execucoes/<data>` | onde gravar evidências e eventos |
| `--json` | | resultado em JSON no fim |

Código de saída: `0` se nada falhou; `1` se algum card falhou de forma confirmada ou quebrou um vizinho; `130` se foi interrompido (Ctrl+C ou "Parar"), depois de desligar apps e remover as cópias.

## Criar o artefato

| Comando | O que faz |
|---|---|
| `liveflow iniciar` | cria `.liveflow/cards.yaml` de exemplo |
| `liveflow prompt artefato [--de cards.txt]` | texto para o Claude criar o artefato com os seus cards (o arquivo traz os cards do seu quadro: id, título, critérios, branch) |
| `liveflow prompt passos <card>` | texto para o Claude escrever o passo a passo de um card |
| `liveflow gravar <card> [--caminho /x] [--salvar]` | grava o passo a passo enquanto você faz o fluxo |

## Ambiente e manutenção

| Comando | O que faz |
|---|---|
| `liveflow ambiente` | confere artefato, Playwright, navegador, trava de alvo, serviços, seed, paralelo, e-mail |
| `liveflow segredos` | quais segredos o artefato usa e quais estão definidos |
| `liveflow limpar [--dias N]` | apaga evidências mais antigas que N dias (0 = todas) |
| `liveflow hook instalar [--forcar]` | instala o pre-push |
| `liveflow ci gerar [--forcar]` | cria `.github/workflows/liveflow.yml` |
