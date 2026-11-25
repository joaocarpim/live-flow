# Artefato de cards (`.liveflow/cards.yaml`)

O artefato tem quatro partes: `sistema` (onde e como testar), `variaveis`, `contas` (as pessoas de teste) e `cards`.

```yaml
versao: 1
sistema: { ... }
variaveis: { ... }
contas: { ... }
cards: [ ... ]
```

## `sistema`

| Campo | Padrão | O que é |
|---|---|---|
| `url` | `http://localhost:3000` | endereço do sistema; `{{porta}}` (primeiro serviço) ou `{{porta.nome}}` |
| `permitidos` | `[localhost, 127.0.0.1]` | hosts que podem ser testados |
| `producao` | `[]` | hosts que **nunca** são alvo, mesmo se aparecerem em `permitidos` |
| `base` | `main` | branch de comparação (vizinhos e regressão) |
| `iniciar` | | comando que sobe o app da branch, com `{{porta}}` |
| `servicos` | | vários processos (ver abaixo); substitui `iniciar` |
| `saude` | `/` | caminho que responde quando o app está pronto |
| `preparar` | | comando que prepara a cópia (ex.: `npm ci`), pulado quando o lockfile é igual |
| `seed` | | comando que zera o banco antes de cada tentativa; recebe `LIVEFLOW_URL` e `LIVEFLOW_EXECUCAO`; aceita `{{execucao}}` |
| `paralelo` | `1` | cards ao mesmo tempo; maior que 1 exige app por execução e `seed` com `{{execucao}}` |
| `email.mailpit` | | caixa de e-mail de teste (API do Mailpit); aceita `{{url}}` |
| `reaproveitar_dependencias` | `sim` | link para o `node_modules` do seu checkout quando o lockfile é idêntico |
| `guardar_dias` | `14` | dias que as evidências ficam guardadas (0 = sempre) |

### Vários serviços e repositórios

```yaml
sistema:
  url: http://127.0.0.1:{{porta.web}}
  servicos:
    - { nome: web, iniciar: "npm run dev -- --port {{porta}}", saude: / }
    - { nome: api, iniciar: "npm start -- --port {{porta}}", repo: ../api, saude: /saude, preparar: npm ci }
```

- `{{porta}}` é a porta do próprio serviço; `{{porta.api}}` e `{{url.api}}` apontam para outro.
- Cada processo recebe `PORT`, `LIVEFLOW_PORTA_<NOME>` e `LIVEFLOW_URL_<NOME>`.
- Serviço com `repo:` usa a branch de mesmo nome naquele repositório; sem ela, usa a `base` dele (ou `sistema.base`) e o resultado registra isso.

### Pasta raiz que junta vários repositórios

Se a pasta aberta no VS Code (onde fica `.liveflow/`) não é um repositório git, o liveflow procura os repositórios nas subpastas (até 3 níveis, sem entrar em `node_modules`). Exemplo:

```
reidseg/            ← pasta raiz, sem git, com .liveflow/cards.yaml
  frontend/         ← repositório
  backend/          ← repositório
```

```yaml
sistema:
  url: http://localhost:{{porta.web}}
  servicos:
    - { nome: api, iniciar: "npm start -- --port {{porta}}", repo: backend, saude: /saude }
    - { nome: web, iniciar: "npm run dev -- --port {{porta}}", repo: frontend }
```

- Cada serviço roda numa cópia do repositório dele, na branch do card; quem não tem a branch usa a base (anotado).
- Se a branch do card não existe em nenhum dos repositórios usados, o card fica "não rodou": o teste seria só da base.
- Serviço sem `repo:`: com um repositório só, usa ele; com vários, usa o único que tiver a branch do card. Se a branch estiver em mais de um, o card não roda e pede o `repo:`.
- `arquivos` dos cards ficam com o caminho a partir da raiz (`frontend/src/...`).
- O `seed` roda na cópia do primeiro serviço.
- Worktrees (ex.: `wt/cripto/backend`) contam como o mesmo repositório da pasta principal (`backend`). A branch aberta numa worktree roda mesmo assim, numa cópia própria.

## `variaveis`

Textos reaproveitados nos passos com `{{nome}}`. Valores guardados durante o fluxo (`guardar`, `api.guardar`, `ver_email.guardar_link`) entram no mesmo lugar.

## `contas`

Cada conta é uma pessoa de teste com sessão de navegador própria.

```yaml
contas:
  tecnico:
    entrar:                                  # passos de login
      - abrir: /login
      - preencher: { campo: E-mail, valor: tecnico@empresa.local }
      - preencher: { campo: Senha, valor: "{{segredo:senha}}" }
      - clicar: Entrar
    verificar: [ { abrir: /painel }, { ver_texto: Sair } ]   # a sessão ainda vale?
    reaproveitar: sim                        # guarda a sessão entre cards do bloco
```

O login acontece na primeira vez que a conta aparece num passo (`como: tecnico`). Com `reaproveitar`, a sessão guardada só é usada depois que os passos de `verificar` passam; se não passarem, a pessoa faz login de novo.

## `cards`

| Campo | O que é |
|---|---|
| `id`, `titulo` | obrigatórios; `id` único |
| `descricao` | texto livre |
| `branch` | onde está o código do card (`feat/x` ou `origin/feat/x`) |
| `arquivos` | padrões (`src/orcamento/**`): ligam o card a branches sem `branch:` e definem os vizinhos |
| `criterios` | critérios de aceite; os passos apontam para eles com `criterio: N` |
| `como_testar` | o passo a passo; sem ele o card fica "sem passos" e não pode ser testado |
| `depende_de` | cards que precisam passar antes; não carrega estado |
| `altera` | recursos compartilhados que o card muda; dois cards com o mesmo recurso não rodam juntos |
| `exclusivo` | roda sozinho, sem nada em paralelo |
| `dispositivo` | `desktop` (1280 px) ou `celular` (iPhone 13, toque) |
| `entregue` | depois do merge: roda no código da base, como regressão (`rodar --regressao`) |
| `tipo: jornada` + `etapas` | junta os passos de outros cards num teste de ponta a ponta |
| `testes` | perfil das camadas: `interface`, `upload`, `migracao`, `perfis`, `carga`, `vizinhos` |

## Passos

Cada passo tem **uma** ação. Em qualquer passo: `criterio: N` e `como: conta`.

| Ação | Exemplo | Observação |
|---|---|---|
| `abrir` | `abrir: /orcamentos/1042` | primeiro passo; caminho relativo; link guardado só abre se for do próprio sistema |
| `clicar` | `clicar: Aceitar orçamento` | papel acessível → rótulo → texto exato; dois iguais = falha por ambiguidade |
| `preencher` | `preencher: { campo: E-mail, valor: "{{usuario}}" }` | rótulo, placeholder ou nome acessível |
| `selecionar` | `selecionar: { campo: Cidade, opcao: Campinas }` | |
| `marcar` | `marcar: Aceito os termos` | |
| `enviar_arquivo` | `enviar_arquivo: { campo: Fotos, arquivos: [.liveflow/arquivos/a.jpg] }` | só arquivos dentro do projeto |
| `ver_texto` | `ver_texto: Orçamento aprovado` | espera aparecer |
| `nao_ver_texto` | `nao_ver_texto: Erro ao salvar` | |
| `ver_url` | `ver_url: /orcamentos/*` | `*` = um trecho sem barra, `**` = qualquer coisa |
| `guardar` | `guardar: { nome: orc, da_url: "/orcamentos/(\\d+)" }` | ou `do_texto`; expressão com um grupo |
| `api` | `api: { metodo: POST, rota: /api/x, corpo: {a: 1}, status: 201, contem: {ok: true}, guardar: {id: dados.id} }` | usa a sessão da conta |
| `ver_email` | `ver_email: { para: a@b, assunto: Senha, guardar_link: { nome: link, contem: /redefinir } }` | só e-mails que chegaram depois do início da tentativa |
| `conferir_manual` | `conferir_manual: O PDF sai com a logo` | vira pendência humana no resultado; não é falha |
| `esperar_ms` | `esperar_ms: 500` | evite; prefira `ver_texto` |

## Segredos

`{{segredo:nome}}` vem da variável de ambiente `LIVEFLOW_SEGREDO_NOME` (na extensão, do cofre do VS Code). O valor nunca é gravado em arquivo nem colocado nos textos para o Claude.

## Validação

`liveflow cards` mostra cada problema em linguagem simples: ação desconhecida, critério inexistente, conta que não existe, dependência circular, arquivo fora do projeto, expressão sem grupo. Card com problema fica **inválido** e não pode ser testado.
