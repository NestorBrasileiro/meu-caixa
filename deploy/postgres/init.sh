#!/bin/sh
# Roda UMA vez, na primeira subida do Postgres (volume vazio): cria um banco e
# um usuário para a aplicação e outro par, separado, para o Keycloak.
# Para mudar senhas depois disso, use ALTER ROLE (veja docs/deploy.md).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_password="$APP_DB_PASSWORD" \
  -v keycloak_password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
CREATE ROLE meu_caixa LOGIN PASSWORD :'app_password';
CREATE DATABASE meu_caixa OWNER meu_caixa;
REVOKE ALL ON DATABASE meu_caixa FROM PUBLIC;

CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_password';
CREATE DATABASE keycloak OWNER keycloak;
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
SQL
