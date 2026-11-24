#!/usr/bin/env bash
# Cria um projeto de demonstração com git e branches, pronto para testar com o liveflow.
# Uso: bash exemplo/criar-demo.sh /caminho/da/demo
set -euo pipefail
DESTINO="${1:-./liveflow-demo}"
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
LIVEFLOW="$(cd "$ORIGEM/.." && pwd)"
mkdir -p "$DESTINO" && cd "$DESTINO"
git init -q -b main
cp -r "$ORIGEM/app" "$ORIGEM/.liveflow" .
cat > package.json <<JSON
{ "name": "pedra-fina-demo", "private": true, "type": "module",
  "devDependencies": { "liveflow": "file:$LIVEFLOW", "playwright": "^1.57.0" } }
JSON
printf 'node_modules\n.liveflow/execucoes\n' > .gitignore
git add -A && git -c user.name=demo -c user.email=demo@local commit -q -m "Marmoraria Pedra Fina"
git branch feat/aceite
git branch feat/relatorio
git checkout -q -b feat/botao-renomeado
sed -i.bak "s/process.env.BOTAO_ACEITE || 'Aceitar orçamento'/process.env.BOTAO_ACEITE || 'Confirmar orçamento'/" app/servidor.mjs && rm -f app/servidor.mjs.bak
git -c user.name=demo -c user.email=demo@local commit -qam "Renomeia o botão de aceite"
git checkout -q main
echo "Demo criada em $DESTINO"
echo "Próximos passos:"
echo "  cd $DESTINO && npm install && npx playwright install chromium"
echo "  export LIVEFLOW_SEGREDO_SENHA=pedra123"
echo "  npx liveflow cards && npx liveflow rodar --todos"
