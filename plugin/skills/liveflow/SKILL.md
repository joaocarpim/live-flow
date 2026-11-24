---
name: liveflow
description: Use quando a pessoa quiser criar ou completar cards do liveflow (.liveflow/cards.yaml), escrever o passo a passo de um card, testar cards com o liveflow, ou corrigir uma falha que o liveflow encontrou. Também quando ela colar um texto que começa com "Corrija esta falha que o liveflow encontrou".
---

# liveflow

O liveflow testa o fluxo de tela de cada card, de forma determinística. **Você escreve; o liveflow executa.** Nunca tente "rodar o teste" você mesmo clicando ou imitando o navegador: rode os comandos do liveflow e leia o resultado.

Antes de qualquer coisa, confira se o projeto tem `.liveflow/cards.yaml` e se o liveflow está instalado (`npx liveflow --ajuda`). Se não estiver: `npm i -D github:joaocarpim/live-flow playwright`.

## O que você pode ser chamado para fazer

### 1. Escrever o passo a passo de um card

1. Leia o card no `.liveflow/cards.yaml` e os critérios de aceite.
2. Rode `npx liveflow prompt passos <ID>` para ver o contexto (arquivos e commits da branch).
3. **Leia o código das telas** que o card usa. Use exatamente os textos que a pessoa vê: texto do botão, rótulo do campo, mensagem de sucesso. Não invente nem traduza.
4. Escreva `como_testar` seguindo `referencia.md`:
   - o primeiro passo é `abrir` (caminho relativo, nunca endereço completo);
   - cada critério de aceite tem pelo menos um passo com `criterio: N`;
   - termine provando o resultado (`ver_texto`, `ver_url` ou `api` com `contem`), nunca só em um clique;
   - senha e token sempre como `{{segredo:nome}}`;
   - mais de uma pessoa no fluxo: declare em `contas` e use `como: nome` em cada passo.
5. Rode `npx liveflow cards` e confirme que o card aparece como **pronto**. Corrija até aparecer.
6. Rode `npx liveflow rodar <ID> --modo rapido` e mostre o resultado.

### 2. Criar cards a partir das branches

1. `npx liveflow mapear --branches <a,b>` mostra quais branches já têm card.
2. `npx liveflow prompt artefato --branches <a,b>` dá o contexto de cada branch.
3. Um card por entrega que faça sentido para quem usa o sistema (uma branch pode virar mais de um card). Campos: `id`, `titulo`, `descricao`, `branch`, `criterios`, `como_testar`.
4. Feche com `npx liveflow cards`: todos prontos.

### 3. Corrigir uma falha confirmada

O texto de falha do liveflow traz o passo, o erro, quantas vezes falhou e, às vezes, "Na tela existe algo parecido".

1. **Decida se o problema é o código ou o passo a passo.**
   - "Na tela existe: X" com X parecido com o alvo → o texto mudou. Pergunte se a mudança foi de propósito. Se foi, atualize só o passo no `cards.yaml`. Se não foi, é bug na tela.
   - Erro de API, texto que não aparece, URL errada → provavelmente código.
2. Se for código: **escreva primeiro um teste que reproduz a falha**, veja ele falhar, depois corrija.
3. Nunca altere outros testes nem o passo a passo só para fazer passar.
4. Rode `npx liveflow rodar <ID>` e mostre o resultado final.

## Regras que não se quebram

- Resultado **instável** (falhou e passou nas repetições) não é falha confirmada: não "corrija" código por causa dele. Investigue o próprio teste (tempo, dado compartilhado) e diga isso.
- **Não rodou** quer dizer que o liveflow não conseguiu garantir o código testado. Leia o motivo (falta `iniciar`, checkout em outra branch, seed falhou) e resolva o ambiente, não o código.
- Nunca coloque valores de senha, token ou dados pessoais reais no `cards.yaml`.
- Nunca aponte o sistema para produção. `sistema.producao` existe para isso.
- Não mude `sistema.permitidos` para incluir um endereço que a pessoa não pediu.

## Comandos úteis

| Para | Comando |
|---|---|
| ver os cards e o que falta | `npx liveflow cards` |
| ver os blocos antes de rodar | `npx liveflow blocos C-01 C-02` |
| testar | `npx liveflow rodar C-01 C-02 [--modo rapido\|completo]` |
| testar os cards da branch atual | `npx liveflow rodar --da-branch` |
| o que cada camada faz no card | `npx liveflow plano C-01` |
| texto da última falha | `npx liveflow prompt resolver C-01` |
| conferir o ambiente | `npx liveflow ambiente` |

Formato completo do passo a passo: `referencia.md`.
