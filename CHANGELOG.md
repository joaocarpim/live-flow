# Changelog

## 0.1.10 (2026-11-25)

- Worktrees contam uma vez: pastas como `wt/cripto/backend` são cópias de trabalho do mesmo repositório (`backend`), não repositórios novos. Antes, uma raiz com `backend`, `frontend` e as worktrees aparecia como 13 repositórios.
- Levantamento do projeto, sem IA: repositórios, tecnologias, scripts de subir e de seed, docker e os nomes das variáveis do `.env` de exemplo. Aparece na aba Criar artefato e vai no texto para o Claude, que agora escreve também o bloco `sistema` (como subir cada serviço, com `repo:`), não só os cards.
- Artefato de exemplo: enquanto o `cards.yaml` for o do `liveflow iniciar`, nada roda e o motivo manda criar o artefato. A aba Ambiente avisa.

## 0.1.9 (2026-11-25)

- Pasta raiz que junta vários repositórios (ex.: `reidseg/frontend` e `reidseg/backend`): quando a pasta aberta não é um repositório git, o liveflow procura os repositórios nas subpastas (até 3 níveis, sem `node_modules`). Cada serviço roda no repositório dele (`repo: frontend`); sem `repo:`, usa o único repositório ou o único que tem a branch do card. A aba Ambiente mostra os repositórios achados.
- Branch do card ausente em todos os repositórios usados: o card fica "não rodou" (o teste seria só da base).

## 0.1.8 (2026-11-24)

- A aba Ambiente não mostra mais o quadro "Automatizar" (hook de pre-push e GitHub Actions). Os comandos continuam na CLI (`liveflow hook instalar`, `liveflow ci gerar`) para quem quiser.

## 0.1.7 (2026-11-24)

- A aba do painel usa a logo (hexágono com o check), não mais o ícone em contorno da barra lateral. No tema escuro, a logo ganha um contorno sutil para o hexágono não sumir; o mesmo vale para o cabeçalho do painel.

## 0.1.6 (2026-11-24)

- Pasta sem git: em vez do erro cru do git ("not a git repository"), cada card fica "não rodou" com o motivo e o comando que resolve. A aba Ambiente ganhou o item "Repositório git".
- Gravar numa pasta sem git: o app sobe direto na pasta, com o código como está, e o liveflow avisa que não é a branch do card.
- O artefato de exemplo (`liveflow iniciar`) agora diz no topo que os cards e as branches dele são de mentira e precisam ser trocados.

## 0.1.5 (2026-11-24)

- Ao vivo com vários cards: rodam um por vez, e a tela mostra o card que está rodando, com a fila em cima (dá para clicar e rever um card que já terminou).
- Quando a janela do navegador não pode abrir (WSL, SSH, contêiner sem tela), o teste não para mais: roda escondido e a tela continua aparecendo no painel, com um aviso.
- Card que não rodou mostra o motivo na tela da execução, em vez de ficar em "Preparando…".
- O aviso do canto conta cada resultado (passou, falha confirmada, instável, não rodou) e diz por que um card não rodou. Antes dizia "1 card testado" mesmo quando ele não tinha rodado.
- Segredo sem valor (ex.: a senha) vira "não rodou" na hora, com o que fazer, em vez de falhar o card 3 vezes com sugestões de texto.
- Navegador: tenta o Chromium do Playwright e o Google Chrome, cada um com janela e escondido, antes de desistir; o motivo lista o que foi tentado.
- Fim da criação de cards a partir de branches: saíram `liveflow branches`, `mapear` e `rascunho`, e a aba "Criar cards". No lugar, a aba **Criar artefato**: você cola os cards do seu quadro e o Claude escreve o `.liveflow/cards.yaml` com o passo a passo (`liveflow prompt artefato --de cards.txt`). Gravar o passo a passo de um card continua.

## 0.1.4 (2026-11-24)

- Nova logo: o check de commits agora fica dentro de um hexágono de quinas levemente arredondadas. Vale para o ícone da extensão, o ícone da barra lateral e as logos em `assets/`.

## 0.1.3 (2026-11-24)

- Ícone da extensão corrigido: o PNG tinha sido gerado cortado (só o canto do fundo). Agora é a logo inteira em 256 px.

## 0.1.2 (2026-11-24)

- Extensão no Marketplace com o identificador `liveflow-cards` e o nome "liveflow cards: testes de fluxo" (o nome `liveflow` já existia lá). Comandos, configurações e a CLI continuam `liveflow`.

## 0.1.1 (2026-11-24)

- Extensão do VS Code pronta para o Marketplace: publisher `JooVitorAparecidoCarpimdeSouza`, página da extensão com prints, licença no pacote.
- CI e workflow gerado em `ubuntu-24.04` (o Playwright ainda não instala o navegador no 26.04); Playwright 1.65.1; actions v5.
- Release automática quando a versão do `package.json` muda.

## 0.1.0 (2026-11-24)

Primeira versão.

- Artefato `.liveflow/cards.yaml` com validação em linguagem simples.
- Passo a passo determinístico: abrir, clicar, preencher, selecionar, marcar, enviar arquivo, ver texto/URL, guardar valor, API, e-mail de teste, conferência manual.
- Contas (várias pessoas no mesmo card) com login reaproveitável e verificado; tela de celular; jornadas.
- Blocos: um app por branch, ondas por `depende_de`, paralelo seguro por `altera`, exclusivos.
- Cópia isolada por branch (`git worktree`), vários serviços e repositórios, dependências reaproveitadas pelo lockfile, cards entregues rodando na base.
- Repetição 3/3 com banco zerado, quarentena de instáveis, sugestões quando o texto mudou, regressão dos vizinhos.
- Problemas de ambiente viram "não rodou", nunca falha do card; vídeo opcional sem o ffmpeg.
- "Parar"/Ctrl+C desliga apps e navegadores e remove as cópias.
- Gravador de passo a passo, textos prontos para o Claude, histórico, JUnit, limpeza de evidências.
- Extensão do VS Code com execução ao vivo; plugin e skill do Claude Code; GitHub Action; hook de pre-push.
