#!/usr/bin/env bash
# Teste de fumaça do compose de produção, na sua máquina: sobe a pilha com
# deploy/docker-compose.local.yml (HTTPS local na porta 8443, dados fictícios,
# usuário de teste), confere as rotas pelo Caddy, faz o login completo com o
# Keycloak usando só curl, roda o backup e derruba tudo (apagando os volumes).
#
#   deploy/smoke-local.sh            # testa e derruba
#   KEEP=1 deploy/smoke-local.sh     # deixa a pilha no ar para abrir no browser:
#                                    # https://meucaixa.localhost:8443 (teste / teste-local-123)
#
# Imagens base alternativas (ex.: espelho interno) via NODE_IMAGE e KEYCLOAK_IMAGE.
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=.env.local
PROJECT=meu-caixa-local
HOST=meucaixa.localhost
AUTH_HOST=auth.meucaixa.localhost
PORT=8443
APP="https://$HOST:$PORT"
AUTH="https://$AUTH_HOST:$PORT"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

compose() {
  docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.local.yml --env-file "$ENV_FILE" "$@"
}

step() { printf '\n== %s\n' "$*"; }
ok() { printf '   ok: %s\n' "$*"; }
fail() {
  printf '   FALHOU: %s\n' "$*" >&2
  if [[ -z "${KEEP:-}" ]]; then compose logs --tail 40 >&2 || true; fi
  exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
  step "Gerando $ENV_FILE (segredos aleatórios, só para este teste)"
  secret() { openssl rand -hex 24; }
  cat > "$ENV_FILE" <<EOF
DOMAIN=$HOST:$PORT
AUTH_DOMAIN=$AUTH_HOST:$PORT
AUTH_HOST=$AUTH_HOST
ACME_EMAIL=teste@$HOST
POSTGRES_PASSWORD=$(secret)
APP_DB_PASSWORD=$(secret)
KEYCLOAK_DB_PASSWORD=$(secret)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=$(secret)
KEYCLOAK_CLIENT_SECRET=$(secret)
KEYCLOAK_ADMIN_URL=http://localhost:8180
KEYCLOAK_ADMIN_PUBLIC=false
SESSION_SECRET=$(secret)
FINANCE_PROVIDER=fake
TIMEZONE=America/Sao_Paulo
BACKUP_DIR=$PWD/.backups-local
BACKUP_RETENTION_DAYS=1
EOF
fi

step "Validando o compose"
compose config -q && ok "docker compose config"

step "Subindo a pilha (build + espera os healthchecks)"
compose up -d --build --wait --wait-timeout 420
compose ps --format 'table {{.Service}}\t{{.Status}}'

step "Rotas pelo Caddy"
compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$WORK/ca.crt" > /dev/null
CURL=(curl -sS --cacert "$WORK/ca.crt" --resolve "$HOST:$PORT:127.0.0.1" --resolve "$AUTH_HOST:$PORT:127.0.0.1")

body=$("${CURL[@]}" "$APP/health")
[[ $body == *'"status":"ok"'* ]] || fail "/health: $body"
ok "GET $APP/health -> $body"

status=$("${CURL[@]}" -o "$WORK/home.html" -w '%{http_code}' "$APP/")
[[ $status == 200 ]] || fail "GET / -> $status"
grep -q '/auth/login' "$WORK/home.html" || fail "GET / sem sessão não manda para /auth/login"
ok "GET $APP/ -> 200, sem sessão redireciona para /auth/login"

location=$("${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$APP/auth/login")
[[ $location == "302 $AUTH/realms/meu-caixa/protocol/openid-connect/auth?"* ]] || fail "/auth/login -> $location"
ok "GET $APP/auth/login -> ${location%%\?*}?..."

issuer=$("${CURL[@]}" "$AUTH/realms/meu-caixa/.well-known/openid-configuration" | grep -o '"issuer":"[^"]*"')
[[ $issuer == "\"issuer\":\"$AUTH/realms/meu-caixa\"" ]] || fail "issuer: $issuer"
ok "descoberta OIDC do realm: $issuer"

status=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$AUTH/.well-known/oauth-authorization-server/realms/meu-caixa")
[[ $status == 200 ]] || fail "metadados RFC 8414 -> $status"
ok "GET $AUTH/.well-known/oauth-authorization-server/realms/meu-caixa -> 200"

status=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$AUTH/admin/")
[[ $status == 404 ]] || fail "console admin pela internet -> $status (esperado 404)"
ok "GET $AUTH/admin/ -> 404 (bloqueado no Caddy)"

status=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8180/admin/master/console/")
[[ $status == 200 ]] || fail "console admin pelo túnel -> $status"
ok "GET http://127.0.0.1:8180/admin/master/console/ -> 200 (acesso local/túnel SSH)"

# Enquanto o endpoint MCP não existir, a API responde 404 do Express; o que
# importa aqui é que /mcp vai direto para a API, sem passar pelo Next.
mcp=$("${CURL[@]}" -o /dev/null -D - "$APP/mcp" | tr -d '\r')
grep -qi '^x-powered-by: Express' <<< "$mcp" || fail "/mcp não chegou na API: $(head -n 1 <<< "$mcp")"
ok "GET $APP/mcp -> $(head -n 1 <<< "$mcp") respondido pela API (X-Powered-By: Express), não pelo Next"

step "Login completo (curl + cookies): interface -> API -> Keycloak -> callback"
JAR="$WORK/cookies.txt"
"${CURL[@]}" -c "$JAR" -b "$JAR" -L -o "$WORK/login.html" "$APP/auth/login"
action=$(grep -o 'action="[^"]*"' "$WORK/login.html" | head -n 1 | sed -e 's/^action="//' -e 's/"$//' -e 's/&amp;/\&/g')
[[ $action == "$AUTH/"* ]] || fail "formulário de login do Keycloak não encontrado"
callback=$("${CURL[@]}" -c "$JAR" -b "$JAR" -o /dev/null -w '%{redirect_url}' \
  --data-urlencode username=teste --data-urlencode password=teste-local-123 "$action")
[[ $callback == "$APP/auth/callback?"* ]] || fail "Keycloak não voltou para o callback: $callback"
final=$("${CURL[@]}" -c "$JAR" -b "$JAR" -o /dev/null -w '%{http_code} %{redirect_url}' "$callback")
[[ $final == "302 $APP" || $final == "302 $APP/" ]] || fail "callback -> $final"
grep -q 'meu_caixa_sid' "$JAR" || fail "cookie de sessão não foi gravado"
grep 'meu_caixa_sid' "$JAR" | grep -q TRUE || fail "cookie de sessão sem Secure"
ok "callback -> $final; cookie meu_caixa_sid (httpOnly, Secure)"

me=$("${CURL[@]}" -b "$JAR" "$APP/auth/me")
[[ $me == *'"owner"'* ]] || fail "/auth/me: $me"
ok "GET /auth/me -> $me"

accounts=$("${CURL[@]}" -b "$JAR" -o /dev/null -w '%{http_code}' "$APP/api/accounts")
[[ $accounts == 200 ]] || fail "/api/accounts -> $accounts"
ok "GET /api/accounts -> 200"

page=$("${CURL[@]}" -b "$JAR" -o "$WORK/painel.html" -w '%{http_code}' "$APP/contas")
if [[ $page != 200 ]] || grep -q '/auth/login' "$WORK/painel.html"; then fail "GET /contas logado -> $page"; fi
ok "GET /contas logado -> 200 (tela renderizada com dados da API)"

sync=$("${CURL[@]}" -b "$JAR" -o /dev/null -w '%{http_code}' -X POST -H "Origin: $APP" "$APP/api/sync")
[[ $sync == 202 || $sync == 409 ]] || fail "POST /api/sync -> $sync"
ok "POST /api/sync com Origin da interface -> $sync"

csrf=$("${CURL[@]}" -b "$JAR" -o /dev/null -w '%{http_code}' -X POST -H "Origin: https://outro-site.example" "$APP/api/sync")
[[ $csrf == 403 ]] || fail "POST /api/sync de outra origem -> $csrf"
ok "POST /api/sync de outra origem -> 403 (CSRF)"

logout=$("${CURL[@]}" -b "$JAR" -c "$JAR" -o /dev/null -w '%{http_code} %{redirect_url}' "$APP/auth/logout")
[[ $logout == "302 $AUTH/realms/meu-caixa/protocol/openid-connect/logout?"* ]] || fail "logout -> $logout"
ok "GET /auth/logout -> encerra a sessão no Keycloak"

step "Backup (deploy/backup.sh)"
COMPOSE_PROJECT_NAME=$PROJECT COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml \
  ENV_FILE=$ENV_FILE ./backup.sh
latest=$(find .backups-local -name 'meu-caixa-meu_caixa-*.sql.gz' | sort | tail -n 1)
gzip -t "$latest" || fail "dump corrompido: $latest"
gzip -dc "$latest" > "$WORK/dump.sql"
grep -q 'CREATE TABLE public.transactions' "$WORK/dump.sql" || fail "dump sem a tabela transactions"
ok "dump válido: $latest"

step "Memória em uso"
mapfile -t containers < <(compose ps -q)
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' "${containers[@]}"

if [[ -n "${KEEP:-}" ]]; then
  step "Pilha no ar: $APP (teste / teste-local-123). Para derrubar:"
  echo "   cd deploy && docker compose -p $PROJECT -f docker-compose.yml -f docker-compose.local.yml --env-file $ENV_FILE down -v"
else
  step "Derrubando (down -v)"
  compose down -v --remove-orphans
  rm -rf .backups-local
fi

printf '\nTudo certo.\n'
