#!/usr/bin/env bash
# Backup dos bancos do deploy/docker-compose.yml: meu_caixa e, se o Keycloak
# roda no próprio Droplet, keycloak. Com o Postgres em outro Droplet
# (docker-compose.external-db.yml), copia o meu_caixa de lá pela rede privada.
#
#   deploy/backup.sh
#
# Gera BACKUP_DIR/meu-caixa-<banco>-<data>.sql.gz (pg_dump em SQL, com
# --clean), apaga os arquivos com mais de BACKUP_RETENTION_DAYS dias e, se
# SPACES_BUCKET estiver definido, envia uma cópia para o DigitalOcean Spaces
# (com aws-cli ou s3cmd, o que estiver instalado).
#
# Configuração: variáveis do deploy/.env (ou do arquivo em ENV_FILE); variáveis
# de ambiente já definidas têm precedência. Para outro projeto do Compose, use
# as variáveis nativas COMPOSE_PROJECT_NAME e COMPOSE_FILE.
#
# Cron diário às 03:15 (crontab -e do usuário que roda o Docker):
#   15 3 * * * /home/deploy/meu-caixa/deploy/backup.sh >> /var/log/meu-caixa-backup.log 2>&1
#
# Restauração: veja "Backups e restauração" em docs/deploy.md.
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=${ENV_FILE:-.env}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "backup: arquivo de configuração $ENV_FILE não encontrado" >&2
  exit 1
fi

# Lê KEY=valor do .env sem executar o arquivo (variável de ambiente vence).
env_get() {
  local key=$1 default=${2:-} value
  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return
  fi
  value=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  value=${value%\"}
  value=${value#\"}
  printf '%s' "${value:-$default}"
}

BACKUP_DIR=$(env_get BACKUP_DIR /var/backups/meu-caixa)
RETENTION_DAYS=$(env_get BACKUP_RETENTION_DAYS 14)
SPACES_BUCKET=$(env_get SPACES_BUCKET)
SPACES_REGION=$(env_get SPACES_REGION nyc3)
SPACES_PREFIX=$(env_get SPACES_PREFIX meu-caixa)
SPACES_ACCESS_KEY=$(env_get SPACES_ACCESS_KEY)
SPACES_SECRET_KEY=$(env_get SPACES_SECRET_KEY)

compose() { docker compose --env-file "$ENV_FILE" "$@"; }

# Os dumps têm dados financeiros: só o dono lê.
umask 077
mkdir -p "$BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
created=()

databases=(meu_caixa)
if compose config --services | grep -qx postgres; then
  dump() { compose exec -T postgres pg_dump -U postgres --clean --if-exists "$1"; }
  # Com o Keycloak externo, não existe banco keycloak aqui.
  if [[ $(compose exec -T postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'keycloak'") == 1 ]]; then
    databases+=(keycloak)
  fi
else
  # Postgres em outro Droplet: pg_dump numa imagem descartável, com o usuário
  # da aplicação. A URL vai por variável de ambiente (fora da lista de processos).
  DATABASE_URL=$(env_get DATABASE_URL)
  DATABASE_HOST=$(env_get DATABASE_HOST)
  if [[ -z $DATABASE_URL && -z $DATABASE_HOST ]]; then
    echo "backup: sem serviço postgres aqui e sem DATABASE_HOST/DATABASE_URL no $ENV_FILE" >&2
    exit 1
  fi
  export DATABASE_URL=${DATABASE_URL:-postgres://meu_caixa:$(env_get APP_DB_PASSWORD)@$DATABASE_HOST:5432/meu_caixa}
  dump() {
    docker run --rm -e DATABASE_URL postgres:17-alpine \
      sh -c 'exec pg_dump --clean --if-exists "$DATABASE_URL"'
  }
fi

for db in "${databases[@]}"; do
  file="$BACKUP_DIR/meu-caixa-${db}-${stamp}.sql.gz"
  tmp="$file.partial"
  # pipefail: se o pg_dump falhar, o arquivo parcial não vira backup.
  if dump "$db" | gzip -9 > "$tmp"; then
    mv "$tmp" "$file"
    created+=("$file")
    echo "backup: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$tmp"
    echo "backup: falha no pg_dump de $db" >&2
    exit 1
  fi
done

# Retenção local.
find "$BACKUP_DIR" -maxdepth 1 -name 'meu-caixa-*.sql.gz' -mtime +"$RETENTION_DAYS" -print -delete |
  sed 's/^/backup: removido (retenção) /'

# Cópia opcional para o DigitalOcean Spaces (compatível com S3). A retenção lá
# é feita por uma regra de ciclo de vida no bucket (docs/deploy.md).
if [[ -n "$SPACES_BUCKET" ]]; then
  endpoint="https://${SPACES_REGION}.digitaloceanspaces.com"
  target="s3://${SPACES_BUCKET}/${SPACES_PREFIX}/"
  for file in "${created[@]}"; do
    if command -v aws > /dev/null; then
      AWS_ACCESS_KEY_ID=$SPACES_ACCESS_KEY AWS_SECRET_ACCESS_KEY=$SPACES_SECRET_KEY \
        aws s3 cp --only-show-errors --endpoint-url "$endpoint" "$file" "$target"
    elif command -v s3cmd > /dev/null; then
      s3cmd --quiet --access_key="$SPACES_ACCESS_KEY" --secret_key="$SPACES_SECRET_KEY" \
        --host="${SPACES_REGION}.digitaloceanspaces.com" \
        --host-bucket="%(bucket)s.${SPACES_REGION}.digitaloceanspaces.com" \
        put "$file" "$target"
    else
      echo "backup: SPACES_BUCKET definido, mas nem aws-cli nem s3cmd estão instalados" >&2
      exit 1
    fi
    echo "backup: enviado para ${target}$(basename "$file")"
  done
fi
