# Claude Code

O liveflow foi feito para trabalhar com IA sem depender dela na hora de testar: **o Claude escreve; o liveflow executa**, sempre do mesmo jeito.

## Plugin

```text
/plugin install liveflow --marketplace joaocarpim/live-flow
```

Ou pelo terminal:

```bash
claude plugin marketplace add joaocarpim/live-flow
claude plugin install liveflow@liveflow
```

O plugin traz a skill **liveflow** ([`plugin/skills/liveflow/SKILL.md`](../plugin/skills/liveflow/SKILL.md)), que o Claude usa quando você pede para:

- **escrever o passo a passo de um card**, lendo o código das telas para usar os textos exatos, ligando cada critério a um passo e terminando com uma prova do resultado;
- **criar o artefato** com os cards que você passar (do seu quadro), com o passo a passo de cada um;
- **corrigir uma falha confirmada**, decidindo primeiro se o problema é o código ou o passo a passo e, se for código, escrevendo antes um teste que reproduz a falha.

A skill também diz o que **não** fazer: corrigir código por causa de um resultado instável, mexer em `permitidos`, apontar para produção, colocar senha no YAML.

## Textos prontos

Sem o plugin, a CLI e a extensão geram os textos:

| Comando | Para |
|---|---|
| `liveflow prompt passos C-04` | escrever o passo a passo (critérios, arquivos e commits da branch, formato dos passos) |
| `liveflow prompt artefato --de cards.txt` | criar o artefato com os seus cards |
| `liveflow prompt resolver C-05` | corrigir a última falha (passo, erro, 3/3, banco zerado ou não, sugestões, print, trace) |

Os textos nunca levam valores de segredo, só os nomes.
