# Exemplo: Marmoraria Pedra Fina

App sem dependências (`app/servidor.mjs`) com 6 cards que mostram o liveflow em ação:

| Card | Mostra |
|---|---|
| C-01 Login da equipe | critérios ligados a passos |
| C-02 Técnico envia as fotos e o cliente aceita | duas pessoas, guardar valor da URL, upload, conferência manual, `depende_de` |
| C-03 Agenda no celular | `dispositivo: celular` |
| C-04 Recuperar a senha | `ver_email` com a caixa de teste do próprio app |
| C-05 Botão renomeado | falha confirmada com sugestão do texto novo |
| C-06 Relatório em PDF | card sem passo a passo (não pode ser testado) |

```bash
bash exemplo/criar-demo.sh /tmp/pedra-fina
cd /tmp/pedra-fina && npm install && npx playwright install chromium
export LIVEFLOW_SEGREDO_SENHA=pedra123
npx liveflow rodar --todos
```

O script cria um repositório git com as branches `feat/aceite`, `feat/botao-renomeado` e `feat/relatorio`.
