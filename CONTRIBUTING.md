# Contribuindo com o liveflow

Obrigado pelo interesse! Algumas regras simples mantêm o liveflow confiável.

## Ambiente

```bash
git clone https://github.com/joaocarpim/live-flow && cd live-flow
npm install
npx playwright install chromium   # para os testes com navegador
npm run typecheck
npm test
```

Node 22.18+ roda o TypeScript direto: não há build no desenvolvimento. `npm run build` gera o `dist/` usado quando o liveflow é instalado como pacote.

## Regras

1. **Toda mudança vem com teste.** Mudou o comportamento? Um teste que falhava antes e passa depois.
2. **Princípios não negociáveis** (veja [CLAUDE.md](CLAUDE.md)): a IA não executa, não afirmar o que não foi verificado, repetir antes de acusar, nunca chutar, nada some em silêncio, alvo travado, segredo fora de arquivo.
3. **Camada nova só conta como "roda"** quando a execução existe e tem teste (`implementada: true` em `src/plano.ts`).
4. **Textos para quem usa em português simples**: diga o que aconteceu e o que fazer.
5. **Contrato de eventos**: só acrescente campos; nunca mude o significado dos que existem ([docs/eventos.md](docs/eventos.md)).

## Estrutura

| Pasta | O quê |
|---|---|
| `src/` | CLI e núcleo (sem dependências além de `yaml`) |
| `src/runtime/` | executor do navegador (processo filho) |
| `tests/` | `node:test`; os de ponta a ponta usam git e navegador de verdade |
| `extensao/` | extensão do VS Code (`node build.mjs`) |
| `plugin/` | plugin e skill do Claude Code |
| `exemplo/` | demo da Marmoraria Pedra Fina |
| `docs/` | documentação |

## Versões

Mude `version` no `package.json` (e em `extensao/package.json` e `plugin/.claude-plugin/plugin.json`) e escreva a seção no `CHANGELOG.md`. Ao chegar na `main`, o workflow `release` cria a tag e a release com o `.vsix`.

## Pull requests

- Um assunto por PR, com a descrição do problema e de como testar.
- `npm run typecheck` e `npm test` passando.
- Atualize a documentação quando mudar o formato do artefato, um comando ou um evento.
