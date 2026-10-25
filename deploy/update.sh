#!/usr/bin/env bash
# Atualiza o Meu Caixa no Droplet para uma versão publicada: uma tag vX.Y.Z cujas
# imagens o workflow Release já publicou no ghcr.io.
#
#   deploy/update.sh v1.1.0
#
# 1. backup dos bancos (deploy/backup.sh);
# 2. arquivos do deploy na versão (git checkout da tag: compose, Caddy, scripts);
# 3. APP_VERSION no .env, `docker compose pull` e `up -d` esperando os healthchecks;
# 4. confere https://DOMAIN/health pelo Caddy.
#
# Se o passo 3 ou 4 falhar, volta para a versão anterior (arquivos e imagens). As
# migrations do banco não voltam sozinhas: para desfazê-las, restaure o backup do
# passo 1 (docs/deploy.md, "Backups e restauração").
#
# O workflow Deploy roda este script por SSH; à mão, rode no Droplet com o
# usuário que usa o Docker.
set -euo pipefail

VERSION=${1:-}
if [[ ! $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "uso: deploy/update.sh vX.Y.Z (a tag de uma release)" >&2
  exit 2
fi

DEPLOY_DIR=${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
REPO_DIR=$(git -C "$DEPLOY_DIR" rev-parse --show-toplevel)

# Roda sempre o update.sh da versão de destino, a partir de uma cópia fora do
# repositório: o checkout do passo 2 troca os arquivos, e não pode trocar o
# script no meio da execução.
if [[ ${UPDATE_SCRIPT_VERSION:-} != "$VERSION" ]]; then
  git -C "$REPO_DIR" fetch --quiet --tags --force origin
  script=$(mktemp)
  if ! git -C "$REPO_DIR" show "refs/tags/$VERSION:deploy/update.sh" > "$script" 2> /dev/null; then
    rm -f "$script"
    echo "update: a tag $VERSION não existe ou é anterior ao deploy/update.sh" >&2
    exit 1
  fi
  UPDATE_SCRIPT_VERSION=$VERSION DEPLOY_DIR=$DEPLOY_DIR exec bash "$script" "$VERSION"
fi
# Apaga a cópia temporária ao sair (nunca o script do repositório).
if [[ $0 == "${TMPDIR:-/tmp}"/* ]]; then trap 'rm -f "$0"' EXIT; fi

cd "$DEPLOY_DIR"
ENV_FILE=.env
if [[ ! -f $ENV_FILE ]]; then
  echo "update: $DEPLOY_DIR/$ENV_FILE não encontrado" >&2
  exit 1
fi

log() { printf '[update %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# Lê KEY=valor do .env sem executar o arquivo.
env_get() {
  local value
  value=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  value=${value%\"}
  printf '%s' "${value#\"}"
}

set_version() {
  if grep -qE '^APP_VERSION=' "$ENV_FILE"; then
    sed -i "s|^APP_VERSION=.*|APP_VERSION=$1|" "$ENV_FILE"
  else
    printf 'APP_VERSION=%s\n' "$1" >> "$ENV_FILE"
  fi
}

DOMAIN=$(env_get DOMAIN)
previous_version=$(env_get APP_VERSION)
previous_ref=$(git -C "$REPO_DIR" rev-parse HEAD)

start() {
  docker compose pull --quiet &&
    docker compose up -d --remove-orphans --wait --wait-timeout 600
}

# O /health pelo Caddy, como a internet vê (certificado incluído).
healthy() {
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/health" 2> /dev/null |
      grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

rollback() {
  log "falhou; voltando para ${previous_version:-a versão anterior}"
  git -C "$REPO_DIR" checkout --quiet --detach "$previous_ref"
  set_version "$previous_version"
  if docker compose up -d --remove-orphans --wait --wait-timeout 600; then
    log "de volta em ${previous_version:-$(git -C "$REPO_DIR" rev-parse --short HEAD)}"
  else
    log "a volta também falhou: confira docker compose ps e docker compose logs"
  fi
  exit 1
}

log "backup antes de atualizar"
./backup.sh

log "arquivos do deploy em $VERSION"
git -C "$REPO_DIR" checkout --quiet --detach "refs/tags/$VERSION"
set_version "$VERSION"

log "baixando as imagens de $VERSION e subindo"
start || rollback

log "conferindo https://$DOMAIN/health"
healthy || rollback

docker image prune -f > /dev/null
log "Meu Caixa $VERSION no ar (antes: ${previous_version:-sem versão})"
