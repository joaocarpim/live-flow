# Roadmap

Cada camada só muda para "roda" quando a execução existe e tem teste. Até lá, ela aparece no `liveflow plano` como "ainda não roda".

## As 25 camadas

| Grupo | Camada | Estado |
|---|---|---|
| Código | Estática (diff-aware: Semgrep, gitleaks) | 0.3 |
| | Dependências vulneráveis (OSV, só o que o card mudou) | 0.3 |
| | Unitária (testes que tocam os arquivos do card) | 0.3 |
| | Propriedades, datas e formatos BR | 0.3 |
| | Mutação (só as linhas do card) | 0.3 |
| API e dados | Integração | 0.4 |
| | Contrato (OpenAPI) | 0.4 |
| | Permissões por perfil | 0.4 |
| | Webhooks e filas (duplicado, fora de ordem) | 0.4 |
| | Migração de banco | 0.4 |
| Interface | **Fluxo completo** | ✅ 0.1 |
| | Navegadores e celular | 0.6 |
| | Offline e rede ruim | 0.6 |
| | Acessibilidade e visual | 0.6 |
| | Desempenho da página | 0.6 |
| Segurança | Ataques comuns (só em permitidos) | 0.5 |
| | Sessão e cabeçalhos | 0.5 |
| | Upload de arquivos | 0.5 |
| | Entradas aleatórias (fuzzing) | 0.5 |
| | Concorrência e envio duplo | 0.5 |
| | Dados pessoais (LGPD) | 0.5 |
| Robustez | Resiliência | 0.7 |
| | **Regressão dos vizinhos** | ✅ 0.1 |
| | Carga e sobrecarga | 0.7 |
| | Teste longo (soak) | 0.7 |

## Versões

| Versão | Entrega |
|---|---|
| **0.1** (atual) | cards e blocos, passo a passo (contas, guardar, upload, e-mail, celular, conferência manual, jornadas), vários serviços e repositórios, repetição 3/3, quarentena, sugestões de texto, vizinhos, gravador, extensão do VS Code, plugin do Claude Code, Action, pre-push |
| 0.2 | testes no Windows e no macOS, publicação no npm e no Marketplace, mapa critérios × testes no resultado, baseline da base por sha, SARIF |
| 0.3 | camadas de Código |
| 0.4 | camadas de API e dados |
| 0.5 | camadas de Segurança |
| 0.6 | camadas de Interface |
| 0.7 | Robustez e modo noturno completo |

## Ideias em avaliação

- Importar cards de Jira, Trello, Linear ou GitHub Issues.
- Integração opcional com o [safemerge](https://github.com/joaocarpim/safe-merge): ler os resultados do liveflow no pré-merge.
- Ver o vídeo da falha dentro da extensão; "testar de novo só os que falharam".
