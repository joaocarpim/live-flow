# liveflow para VS Code

Testa o fluxo de tela de cada card, em blocos, antes de entregar. Sem IA na execução.

- **Cards**: lista do `.liveflow/cards.yaml`; card sem passo a passo não pode ser testado.
- **Card**: critérios, passo a passo, camadas de teste, histórico; gravar o fluxo no navegador ou pedir ao Claude.
- **Blocos**: como os cards vão rodar (um app por branch, dependências, paralelo seguro) e o modo.
- **Execução**: ao vivo com a tela dentro do painel (um card) ou progresso de vários cards.
- **Resultados e problema**: falha confirmada 3/3, sugestão quando o texto mudou, print, trace e "Resolver com Claude".
- **Criar cards** das branches locais e remotas, **Ambiente** (segredos no cofre do VS Code, hook e GitHub Actions) e **Histórico** com quarentena.

Requisitos: Node 22.18+ e Playwright no projeto (`npm i -D playwright`).
