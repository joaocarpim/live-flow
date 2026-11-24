# Como funciona

## A ideia central

O **card** diz o que verificar (critérios + passo a passo). A **branch** diz qual código está sendo verificado. O liveflow testa cards; a branch de cada card decide o código.

## Blocos

`liveflow blocos` mostra o agrupamento antes de rodar. É determinístico: os mesmos cards geram sempre os mesmos blocos.

1. **Um bloco por branch.** Cards com a mesma `branch` dividem uma cópia e um app no ar (subir o app é a parte lenta). Cards `entregue: sim` entram no bloco da base.
2. **Ondas por dependência.** `depende_de` faz o dependente rodar depois; se a dependência não passar, ele fica "não rodou" com o motivo. Dependência fora da seleção entra sozinha.
3. **Paralelo seguro.** Só com dados isolados por execução (`paralelo > 1`, `seed` com `{{execucao}}`). Mesmo assim, cards que `altera` o mesmo recurso vão em fila.
4. **Exclusivos sozinhos.** `exclusivo: sim` vira um bloco só dele.

## Código certo

Para cada bloco:

1. `git worktree add --detach` da branch numa pasta temporária. O seu checkout não é tocado.
2. Dependências: se o lockfile da cópia for idêntico ao seu e você tiver `node_modules`, a cópia ganha um link para ele. Senão, roda `preparar`.
3. Cada serviço ganha uma porta livre e sobe com `iniciar`. O liveflow espera `saude` responder (até 2 minutos).
4. O resultado registra o sha de cada serviço. Serviço de outro repositório sem a branch usa a base, e isso fica escrito.

No fim do bloco (ou no "Parar"/Ctrl+C), os apps são desligados com os processos filhos e as cópias são removidas. Cópias de execuções interrompidas à força são limpas com `git worktree prune` na próxima vez.

## Uma tentativa

1. `seed` com `LIVEFLOW_URL` e `LIVEFLOW_EXECUCAO`.
2. Um processo separado abre o navegador (Playwright do seu projeto; sem o Chromium dele, o Google Chrome instalado).
3. Cada `como:` ganha uma sessão. O login acontece na primeira vez; com `reaproveitar`, a sessão guardada no bloco é confirmada com `verificar` antes de ser usada.
4. Cada passo vira um evento. Ao vivo, cada passo também gera um quadro (imagem) que a extensão mostra.
5. Na falha: print da página, URL e, se o alvo não foi encontrado, a lista do que existe parecido na tela.
6. Trace do Playwright de cada sessão e vídeo (se o `ffmpeg` do Playwright estiver instalado).

## Veredito

| Resultado | Quando |
|---|---|
| **passou** | passou na primeira tentativa |
| **falhou (confirmado)** | falhou nas 3 tentativas, com o banco zerado a cada uma |
| **instável** | falhou e depois passou: quarentena, não bloqueia |
| **não rodou** | o liveflow não pôde garantir o código ou o ambiente; o motivo diz o que resolver |

Problemas do ambiente (navegador ausente, dependência do sistema) são sempre **não rodou**, nunca falha do card.

## Localizadores sem chute

`clicar` procura, nesta ordem: papel acessível (`button`, `link`, `menuitem`, `tab`, `checkbox`, `radio`, `option`) com o nome exato, rótulo exato e texto exato. A primeira forma que achar **um** elemento ganha; se achar mais de um, o passo falha por ambiguidade. `preencher` procura rótulo, placeholder, caixa de texto e lista.

## Sugestões quando o alvo some

Quando um botão ou campo não é encontrado, o liveflow lê os textos visíveis da página (botões, links, rótulos) e mostra até três parecidos (sem acento e sem diferença de maiúsculas, com distância de edição). "Aceitar orçamento" → `Na tela existe: "Confirmar orçamento"`. Isso separa "o texto mudou de propósito" de "a ação sumiu".

## Vizinhos

No modo completo, cards prontos cujos `arquivos` a branch mexeu rodam de novo no mesmo app. Se um falha, o liveflow sobe a base e roda o mesmo card lá: passou na base = **quebrou nesta branch**; falhou também = **já falhava na base**.
