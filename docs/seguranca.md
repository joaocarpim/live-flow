# Segurança

## Alvo travado

- Só hosts em `sistema.permitidos` recebem testes. O padrão é `localhost` e `127.0.0.1`.
- Hosts em `sistema.producao` nunca são alvo, mesmo se alguém os colocar em `permitidos`.
- Só `http` e `https`.
- `abrir` aceita só caminho relativo. Um link vindo de e-mail ou variável só abre se for do próprio sistema em teste; outro host é recusado.
- `enviar_arquivo` aceita só arquivos dentro do projeto (sem `..`, sem caminho absoluto).

## Segredos

- `{{segredo:nome}}` vem de `LIVEFLOW_SEGREDO_NOME`; na extensão, do cofre do VS Code.
- O valor nunca vai para o `cards.yaml`, para os eventos, para o `resultado.json` nem para os textos do Claude.
- O gravador troca o que for digitado em campo de senha por `{{segredo:senha}}`.
- Valores guardados durante o fluxo (`guardar`) não são escritos nos eventos.

## Execução

- O git é chamado sempre com lista de argumentos (sem shell) e nomes de branch perigosos são recusados.
- Os comandos `preparar`, `iniciar` e `seed` vêm do seu artefato e rodam com shell, na cópia da branch.
- O seu checkout não é tocado: cada branch roda num `git worktree` temporário, removido no fim.
- A IA nunca executa o teste.

## Evidências e LGPD

Prints, quadros, vídeos e traces podem mostrar dados pessoais da tela. Por isso:

- ficam em `.liveflow/execucoes/` (coloque no `.gitignore`);
- são apagados depois de `sistema.guardar_dias` (14 por padrão) a cada execução, ou com `liveflow limpar --dias N`;
- no CI, envie como artefato com `retention-days` curto.

Use dados de teste no `seed`, nunca cópia de produção.

## Reportar uma vulnerabilidade

Veja [SECURITY.md](../SECURITY.md).
