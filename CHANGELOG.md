# Changelog

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
