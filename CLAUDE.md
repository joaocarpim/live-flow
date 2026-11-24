# liveflow

Testa o fluxo de tela de cada card, em blocos, de forma determinística, antes de entregar.
CLI em Node 22 (TypeScript rodando direto, sem build no desenvolvimento) + extensão do VS Code (`extensao/`) + plugin do Claude Code (`plugin/`) + GitHub Action (`action.yml`). Documentação de uso em `docs/`; demo em `exemplo/`.
Logo: commits formando um check dentro de um hexágono de quinas arredondadas (`assets/logo-liveflow.svg`). Independente do safemerge.

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
10. **O sistema em teste é o único destino.** Link vindo de e-mail ou variável só abre se for do próprio sistema; upload só de arquivo dentro do projeto.
11. **Código usado fica registrado.** Cada serviço anota branch e sha; se outro repositório não tem a branch, usa a base e escreve isso no resultado.
12. **Ambiente não é card.** Navegador ausente, dependência do sistema ou ffmpeg faltando viram "não rodou" (ou aviso, no caso do vídeo), nunca falha confirmada.
13. **Parar limpa tudo.** SIGINT/SIGTERM desligam apps (árvore de processos) e navegadores e removem as cópias (`pararTudo`).

## Decisão: só cards, em blocos (24/11/2026)

O liveflow testa **cards**. Não existe "rodar por branch" nem "como testar da branch": a branch é só o código que o card usa (`branch:` no card). Motivo: falha precisa apontar a entrega e o critério; um fluxo da branch inteira falha vago e envelhece a cada commit.

- Escolha: `liveflow rodar C-01 C-02`, `--todos`, `--da-branch` (cards da branch atual; o pre-push usa) ou `--regressao` (cards `entregue: sim`, no código da base). `liveflow blocos ...` mostra o agrupamento antes.
- Jornada (`tipo: jornada`, `etapas: [C-01, C-02]`): junta os passos dos cards num teste só, para o caminho de ponta a ponta. A falha diz a etapa.
- Branches servem para **criar** cards: `mapear`, `rascunho` e `prompt artefato` (rascunho sem passos, o Claude completa).

### Como os blocos são montados (`src/blocos.ts`, determinístico)

1. Bloco = cards com a mesma `branch`. Um app no ar por bloco (subir o app é a parte lenta).
2. Ondas por `depende_de`: o dependente roda depois; se a dependência não passou, ele vira "não rodou" com o motivo. `depende_de` não carrega estado: cada card prepara o seu no seed (para estado encadeado, use jornada). Dependência fora da seleção entra sozinha e aparece como incluída.
3. Paralelo só com dados isolados (`paralelo > 1`, que exige `iniciar` com `{{porta}}` e `seed` com `{{execucao}}`). Mesmo assim, cards que `altera` o mesmo recurso compartilhado vão em fila.
4. `exclusivo: sim` vira bloco sozinho. Com mais de um card no total, nunca ao vivo.

## Como um bloco é testado (`src/executar.ts`)

1. Trava de alvo (`seguranca.ts`).
2. Com `sistema.servicos` (ou `iniciar`, que vira o serviço `app`): para cada serviço, cópia da branch → dependências (node_modules do seu checkout via link quando o lockfile é idêntico; senão `preparar`) → portas livres para todos → sobe cada um (`{{porta}}`, `{{porta.x}}`, `{{url.x}}`, env `LIVEFLOW_URL_X`) → espera `saude`. Serviço com `repo:` usa a branch de mesmo nome naquele repositório, senão a base dele (anotado). Sem serviços: só testa se o checkout atual É a branch do bloco; senão todos ficam "não rodou". Cópias de execuções interrompidas são limpas com `git worktree prune`.
3. Antes de cada tentativa: `seed` (com `{{execucao}}`).
4. Fluxo num processo filho (`runtime/fluxo.ts`) com Playwright do projeto testado; sem o Chromium do Playwright, usa o Google Chrome instalado. Uma sessão de navegador por conta (`como:`); login na primeira vez que a conta aparece; com `reaproveitar`, a sessão fica guardada no bloco e é confirmada pelos passos de `verificar` antes de usar. `dispositivo: celular` emula iPhone 13 (390 px, toque).
   Quando um alvo não é encontrado, lista os parecidos que existem na tela (sem IA) para separar "texto mudou" de "bug".
5. `comRepeticao` → passou / falhou confirmado / instável.
6. Modo completo: vizinhos = cards prontos cujos `arquivos` a branch mexeu. Falhou na branch → roda na base: passa na base = "quebrou nesta branch"; falha na base = "já quebrado".
7. Tudo vira evento em `.liveflow/execucoes/<data>/events.ndjson` (contrato v1, `eventos.ts`) + `resultado.json`, print da falha, vídeo e `trace.zip`.

## Formato do artefato

`.liveflow/cards.yaml`. Exemplo completo: `liveflow iniciar`.

- Ações de passo: `abrir` (sempre a primeira, caminho relativo), `clicar`, `preencher`, `selecionar`, `marcar`, `enviar_arquivo` (arquivos dentro do projeto, ex.: `.liveflow/arquivos/`), `ver_texto`, `nao_ver_texto`, `ver_url` (glob), `guardar` (`da_url` ou `do_texto`, expressão com um grupo → `{{nome}}` nos passos seguintes), `api` (status, `contem` parcial, `guardar: { nome: caminho.no.json }`), `ver_email` (Mailpit; `guardar_link`), `conferir_manual` (vira pendência humana, não falha), `esperar_ms` (evitar).
- Em cada passo: `criterio: N` (qual critério prova) e `como: conta` (quem faz).
- `contas`: `entrar` (passos de login), `verificar` (passos que confirmam a sessão), `reaproveitar`.
- Card: `branch`, `arquivos`, `criterios`, `como_testar`, `altera`, `depende_de`, `exclusivo`, `dispositivo` (desktop/celular), `entregue`, `tipo: jornada` + `etapas`, `testes` (perfil das camadas).
- Card sem `como_testar` = "sem passos", não selecionável.

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
| `src/email.ts` | leitura de e-mail de teste (Mailpit) |
| `src/sugestoes.ts` | elementos parecidos quando o alvo some |
| `src/gravar.ts` | gravador: navegador → passos; salva no YAML mantendo comentários |
| `src/relatorios.ts` | JUnit, histórico, quarentena de instáveis |
| `src/integracoes.ts` | hook pre-push, workflow do GitHub, segredos usados |
| `src/descricao.ts` | passo em linguagem simples |
| `src/ambiente.ts` | diagnóstico (`liveflow ambiente`) |
| `src/cli.ts` | comandos; trata SIGINT/SIGTERM |
| `bin/liveflow.js` | usa `src/` num repositório clonado e `dist/` quando instalado como pacote |
| `extensao/` | extensão do VS Code: `src/extensao.ts` (fala com a CLI empacotada em `dist/cli`), `media/app.js` (telas), `teste/prints.mjs` (prints com dados reais) |
| `plugin/` | plugin do Claude Code: skill `liveflow` (+ `referencia.md`); catálogo em `.claude-plugin/marketplace.json` |
| `action.yml` | GitHub Action composta |
| `exemplo/` | Marmoraria Pedra Fina + `criar-demo.sh` |

## Comandos de desenvolvimento

- `npm test`: 67 testes (git real com branch local e remota, dois repositórios, app subindo por branch, Mailpit falso).
- `LIVEFLOW_PW_NODE_MODULES=/caminho/node_modules npm test`: inclui os 3 testes com navegador de verdade (duas pessoas, foto, celular, e-mail, sessão reaproveitada, sugestão de texto, gravador).
- `npm run typecheck`, `npm run build` (gera `dist/`; roda sozinho no `prepare` ao instalar pelo GitHub).
- Extensão: `cd extensao && node build.mjs` e `npx --prefix .. vsce package --no-dependencies` (publisher no Marketplace: `JooVitorAparecidoCarpimdeSouza`).
- Prints da documentação: `node extensao/teste/prints.mjs <repo-demo> <saida>` (precisa de execuções reais na demo).
- Plugin: `claude plugin validate .` e `claude plugin validate ./plugin`.

## Próximas fases

Veja `docs/roadmap.md`. Cada fase muda `implementada: true` da camada em `plano.ts` só quando a execução existir e tiver teste.
