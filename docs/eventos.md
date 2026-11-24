# Eventos e resultado

Cada execução grava em `.liveflow/execucoes/<data>/`:

```
events.ndjson          uma linha JSON por evento (contrato v1)
resultado.json         resultado final por card
<card>/tentativa-N/    print da falha, quadros ao vivo, trace(s), vídeo
```

Terminal, extensão e CI leem o mesmo arquivo: muda a forma de mostrar, nunca a informação.

## `events.ndjson` (v1)

Todo evento tem `v: 1`, `ts` (ISO 8601) e `tipo`. Os ligados a um card têm `card`.

| `tipo` | Campos | Quando |
|---|---|---|
| `execucao_inicio` | `blocos`, `modo`, `aoVivo`, `paralelo` | começo |
| `bloco_inicio` | `bloco`, `branch`, `cards` | começo de cada bloco |
| `copia_pronta` | `servico`, `ref`, `sha`, `dependencias`, `observacao?` | cópia de cada serviço preparada |
| `app_no_ar` | `url`, `sha`, `codigo[]` | serviços respondendo |
| `card_inicio` | `card`, `branch`, `bloco` | |
| `tentativa` | `card`, `n` | 1, 2 ou 3 |
| `sessao` | `card`, `conta`, `reaproveitada` | login feito ou sessão reaproveitada |
| `passo_inicio` | `card`, `n`, `descricao`, `criterio?`, `etapa?` | |
| `passo_ok` | `card`, `n`, `ms`, `guardou?` | |
| `passo_falhou` | `card`, `n`, `erro`, `motivo`, `sugestoes[]`, `print`, `url` | `motivo`: `nao_encontrado`, `ambiguo`, `texto`, `url`, `api`, `email`, `login`, `seguranca`, `tempo` |
| `quadro` | `card`, `n`, `arquivo`, `url`, `como?` | ao vivo, depois de cada passo |
| `manual_pendente` | `card`, `n`, `texto` | `conferir_manual` |
| `aviso` | `card`, `regra`, `mensagem` | `erro_500`, `erro_js`, `navegador`, `video` |
| `ambiente` | `card`, `erro` | problema do ambiente (vira "não rodou") |
| `camada_fim` | `card`, `camada`, `resultado` ou `vizinhos` | |
| `card_fim` | `card`, `resultado`, `certeza?`, `motivo?`, `tentativas` | |
| `execucao_fim` | `resumo[]` | fim |

Campos novos podem aparecer em versões futuras; leitores devem ignorar o que não conhecem.

## `resultado.json`

Lista com um objeto por card:

```json
{
  "card": "C-05",
  "branch": "feat/botao-renomeado",
  "sha": "bd8a74f…",
  "resultado": "falhou",
  "certeza": "confirmado",
  "tentativas": 3,
  "bancoZerado": true,
  "falha": {
    "passo": 2,
    "descricao": "[cliente] clicar em \"Aceitar orçamento\"",
    "erro": "Não encontrei \"Aceitar orçamento\" na tela … Na tela existe: \"Confirmar orçamento\". …",
    "motivo": "nao_encontrado",
    "sugestoes": ["Confirmar orçamento"],
    "print": ".../tentativa-3/falha-passo-2.png",
    "url": "http://127.0.0.1:38615/aceite/1042"
  },
  "avisos": [],
  "pendencias": [],
  "codigo": [{ "servico": "app", "repo": ".", "ref": "feat/botao-renomeado", "sha": "bd8a74f…" }],
  "vizinhos": [{ "card": "C-01", "resultado": "ok" }],
  "pasta": ".liveflow/execucoes/…/C-05"
}
```

`resultado`: `passou`, `falhou`, `instavel`, `nao_rodou`. Vizinhos: `ok`, `quebrou_nesta_branch`, `ja_quebrado_na_base`, `nao_rodou`.
