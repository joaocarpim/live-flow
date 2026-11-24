# liveflow

Testa o fluxo de tela de cada card ou branch, de forma determinística, antes de entregar.
CLI em Node 22 (TypeScript rodando direto, sem build no desenvolvimento) + extensão do VS Code (próxima fase).
Logo: commits formando um check (`assets/logo-liveflow.svg`). Independente do safemerge.

## Princípios (não negociáveis)

1. **A IA só escreve, nunca executa.** O Claude escreve passo a passo, cards e correções. Quem roda é o liveflow, sem IA, e sempre do mesmo jeito.
2. **Só afirmar o que foi verificado.** "Passou" e "falhou" só quando sabemos QUAL código foi testado (sha). Sem garantia, o resultado é "não rodou" com o motivo.
3. **Repetir antes de acusar.** Falha = 3 de 3 tentativas, banco zerado em cada uma. Falhou e depois passou = instável (quarentena, não bloqueia).
4. **Nunca chutar.** Botão ou campo que bate com mais de um elemento é falha por ambiguidade, não um clique no primeiro.
5. **Nada some em silêncio.** Camada que não roda aparece com o motivo: não se aplica, outro modo, falta ferramenta ou ainda não implementada.
6. **Alvo travado.** Só hosts em `sistema.permitidos`; `sistema.producao` nunca, mesmo que esteja nos permitidos.
7. **Segredo não vai para arquivo.** `{{segredo:nome}}` vem de `LIVEFLOW_SEGREDO_NOME` (a extensão vai usar SecretStorage). Prompts levam o nome, nunca o valor.
8. **O checkout da pessoa não é tocado.** Cada branch roda numa cópia (`git worktree`) que é removida no fim.
9. **Com mais de um card, nunca ao vivo.** Ao vivo é só para um card.

## Decisão: só cards, em blocos (24/11/2026)

O liveflow testa **cards**. Não existe "rodar por branch" nem "como testar da branch": a branch é só o código que o card usa (`branch:` no card). Motivo: falha precisa apontar a entrega e o critério; um fluxo da branch inteira falha vago e envelhece a cada commit.

- Escolha: `liveflow rodar C-01 C-02` ou `--todos`. `liveflow blocos ...` mostra o agrupamento antes.
- Jornada (`tipo: jornada`, `etapas: [C-01, C-02]`): junta os passos dos cards num teste só, para o caminho de ponta a ponta. A falha diz a etapa.
- Branches servem para **criar** cards: `mapear`, `rascunho` e `prompt artefato` (rascunho sem passos, o Claude completa).

### Como os blocos são montados (`src/blocos.ts`, determinístico)

1. Bloco = cards com a mesma `branch`. Um app no ar por bloco (subir o app é a parte lenta).
2. Ondas por `depende_de`: o dependente roda depois; se a dependência não passou, ele vira "não rodou" com o motivo. `depende_de` não carrega estado: cada card prepara o seu no seed (para estado encadeado, use jornada). Dependência fora da seleção entra sozinha e aparece como incluída.
3. Paralelo só com dados isolados (`paralelo > 1`, que exige `iniciar` com `{{porta}}` e `seed` com `{{execucao}}`). Mesmo assim, cards que `altera` o mesmo recurso compartilhado vão em fila.
4. `exclusivo: sim` vira bloco sozinho. Com mais de um card no total, nunca ao vivo.

## Como um bloco é testado (`src/executar.ts`)

1. Trava de alvo (`seguranca.ts`).
2. Com `sistema.iniciar`: cópia da branch do bloco → `preparar` → sobe o app numa porta livre (`{{porta}}`) → espera `saude`. Sem `iniciar`: só testa se o checkout atual É a branch do bloco; senão todos os cards do bloco ficam "não rodou".
3. Antes de cada tentativa: `seed` (com `{{execucao}}`).
4. Fluxo num processo filho (`runtime/fluxo.ts`) com Playwright do projeto testado; sem o Chromium do Playwright, usa o Google Chrome instalado.
5. `comRepeticao` → passou / falhou confirmado / instável.
6. Modo completo: vizinhos = cards prontos cujos `arquivos` a branch mexeu. Falhou na branch → roda na base: passa na base = "quebrou nesta branch"; falha na base = "já quebrado".
7. Tudo vira evento em `.liveflow/execucoes/<data>/events.ndjson` (contrato v1, `eventos.ts`) + `resultado.json`, print da falha, vídeo e `trace.zip`.

## Formato do artefato

`.liveflow/cards.yaml`. Exemplo completo: `liveflow iniciar`. Ações de passo: `abrir` (sempre a primeira, caminho relativo), `clicar`, `preencher`, `selecionar`, `marcar`, `ver_texto`, `nao_ver_texto`, `ver_url` (glob), `api` (status + `contem` parcial), `esperar_ms` (evitar). `criterio: N` liga o passo ao critério de aceite. Card sem `como_testar` = "sem passos", não selecionável. Campos de execução: `altera`, `depende_de`, `exclusivo`, `tipo: jornada` + `etapas`.

## Mapa do código

| Arquivo | O quê |
|---|---|
| `src/tipos.ts` | tipos compartilhados |
| `src/artefato.ts` | lê e valida o YAML; estado de cada card |
| `src/blocos.ts` | blocos (1 app por branch), ondas por dependência e `altera`, exclusivos |
| `src/fontes.ts` | branch → cards (para criar cards), rascunho, glob |
| `src/git.ts` | branches locais/remotas, diff de três pontos, commits, worktree (sempre execFile) |
| `src/runtime/fluxo.ts` | executor do navegador (processo filho), localizadores sem chute |
| `src/executar.ts` | orquestração, app da branch, seed, repetição, vizinhos |
| `src/plano.ts` | 25 camadas, modos rápido/completo/noturno e motivos |
| `src/comparacao.ts` | impressão digital de achados, novo × já existia, regressão |
| `src/prompts.ts` | textos para o Claude (passos, artefato, resolver) |
| `src/eventos.ts` | contrato de eventos v1 |
| `src/cli.ts` | comandos |

## Comandos de desenvolvimento

- `npm test`: 46 testes (git real com branch local e remota, app subindo por branch).
- `LIVEFLOW_PW_NODE_MODULES=/caminho/node_modules npm test`: inclui o ponta a ponta com navegador de verdade.
- `npm run typecheck`, `npm run build` (gera `dist/` para publicar).

## Próximas fases

| Versão | Entrega |
|---|---|
| 0.1 (feita) | artefato, passo a passo determinístico, jornadas, blocos (1 app por branch, ondas, paralelo seguro), seed por tentativa, repetição, vizinhos, trava de alvo, eventos, prompts, CLI |
| 0.2 | extensão VS Code: lista de cards, prévia dos blocos, criar cards das branches locais/remotas, ao vivo com navegador visível, resultados, botões "Resolver com Claude" (copiar + abrir Claude Code), segredos no SecretStorage |
| 0.3 | Código: estática diff-aware (Semgrep, gitleaks), dependências (OSV), unitária dos arquivos do card, cobertura só das linhas do diff |
| 0.4 | API e dados: permissões por perfil (a partir de `perfis`), contrato OpenAPI, webhooks repetidos e fora de ordem |
| 0.5 | Segurança, só em permitidos: ataques comuns, sessão e cabeçalhos, upload, fuzzing, LGPD |
| 0.6 | Interface: navegadores e celular, offline e rede ruim, acessibilidade (axe-core), Web Vitals |
| 0.7 | Robustez: resiliência por interceptação, carga (k6), teste longo; modo noturno |
| 0.8 | mapa critérios × testes, baseline da base guardada por sha, SARIF |

Cada fase muda `implementada: true` da camada em `plano.ts` só quando a execução existir e tiver teste.
