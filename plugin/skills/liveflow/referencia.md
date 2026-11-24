# Referência do cards.yaml (para a skill)

## Ações de passo (uma por passo)

| Ação | Formato | Observação |
|---|---|---|
| `abrir` | `abrir: /caminho` | sempre a primeira; caminho relativo |
| `clicar` | `clicar: Texto do botão` | texto visível, exato; se houver dois iguais, o teste falha por ambiguidade |
| `preencher` | `preencher: { campo: Rótulo, valor: texto }` | rótulo, placeholder ou nome acessível |
| `selecionar` | `selecionar: { campo: Rótulo, opcao: Texto }` | |
| `marcar` | `marcar: Rótulo da caixa` | |
| `enviar_arquivo` | `enviar_arquivo: { campo: Fotos, arquivos: [.liveflow/arquivos/a.jpg] }` | só arquivos dentro do projeto |
| `ver_texto` | `ver_texto: Orçamento aprovado` | espera aparecer |
| `nao_ver_texto` | `nao_ver_texto: Erro` | |
| `ver_url` | `ver_url: /orcamentos/*` | `*` vale um trecho sem barra; `**` vale qualquer coisa |
| `guardar` | `guardar: { nome: orc, da_url: "/orcamentos/(\\d+)" }` ou `do_texto: "nº (\\d+)"` | expressão com um grupo; use depois como `{{orc}}` |
| `api` | `api: { metodo: POST, rota: /api/x, corpo: {...}, status: 201, contem: {...}, guardar: { id: dados.id } }` | `contem` é parcial |
| `ver_email` | `ver_email: { para: a@b, assunto: Senha, guardar_link: { nome: link, contem: /redefinir } }` | precisa de `sistema.email.mailpit` |
| `conferir_manual` | `conferir_manual: O PDF sai com a logo` | vira pendência humana, não falha |
| `esperar_ms` | `esperar_ms: 500` | evite: prefira `ver_texto` |

Em qualquer passo: `criterio: N` (qual critério de aceite ele prova) e `como: conta` (quem faz).

## Card

```yaml
- id: C-02
  titulo: Técnico envia a foto e o cliente aceita o orçamento
  branch: feat/aceite
  criterios: [Técnico envia as fotos da vistoria, Cliente aceita pelo link]
  depende_de: [C-01]        # só roda se o C-01 passar (não carrega estado)
  altera: [orcamentos]      # não roda junto com outro card que altera orcamentos
  dispositivo: celular      # opcional
  como_testar:
    - abrir: /painel
      como: tecnico
    - ...
```

Outros campos: `arquivos` (padrões, para achar o card pela branch), `exclusivo: sim`, `entregue: sim` (roda na base como regressão), `tipo: jornada` + `etapas: [C-01, C-02]`, `testes` (perfil das camadas: `interface`, `upload`, `migracao`, `perfis`, `carga`, `vizinhos`).

## Contas (pessoas)

```yaml
contas:
  tecnico:
    entrar:
      - abrir: /login
      - preencher: { campo: E-mail, valor: tecnico@empresa.local }
      - preencher: { campo: Senha, valor: "{{segredo:senha_teste}}" }
      - clicar: Entrar
    verificar: [ { abrir: /painel }, { ver_texto: Sair } ]
    reaproveitar: sim
```
