#!/usr/bin/env bash
# Prepara este repositório numa máquina nova (Linux ou macOS):
#   1. configurações pessoais de IA (personal-ai-config), se você tiver acesso;
#   2. ferramentas do sistema, Node/pnpm (via mise) e Docker;
#   3. dependências do projeto;
#   4. arquivos .env com senhas geradas na hora.
#
# Pode rodar quantas vezes quiser: nada que já existe é sobrescrito
# (um .env existente nunca é tocado).
#
# Uso: ./install.sh [opções]
#   --no-ai-config   não clona/atualiza o personal-ai-config
#   --no-docker      não instala o Docker
#   --docker         instala o Docker mesmo se o projeto não precisar
#   --no-deps        não instala as dependências do projeto
#   --no-env         não gera arquivos .env
#   --up             sobe os serviços locais (docker compose) no final
#   --prod           também gera deploy/.env (produção) com todas as senhas
#   -h, --help       mostra esta ajuda
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

AI_CONFIG_REPO="NestorBrasileiro/personal-ai-config"
AI_CONFIG_DIR="${PERSONAL_AI_CONFIG_DIR:-$HOME/Projects/personal-ai-config}"

DO_AI_CONFIG=1 DO_DEPS=1 DO_ENV=1 DO_UP=0
DO_DOCKER=1
EXTRA_FLAGS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --no-ai-config) DO_AI_CONFIG=0 ;;
    --no-docker) DO_DOCKER=0 ;;
    --docker) DO_DOCKER=1 ;;
    --no-deps) DO_DEPS=0 ;;
    --no-env) DO_ENV=0 ;;
    --up) DO_UP=1 ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
    *) EXTRA_FLAGS+=("$1") ;;
  esac
  shift
done

has_flag() { local f; for f in "${EXTRA_FLAGS[@]:-}"; do [ "$f" = "$1" ] && return 0; done; return 1; }

# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------
step() { printf '\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m  x %s\033[0m\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then have sudo && SUDO="sudo"; fi

OS="$(uname -s)"
DISTRO=""
if [ -r /etc/os-release ]; then DISTRO="$(. /etc/os-release && echo "${ID:-}")"; fi

# ---------------------------------------------------------------------------
# 1. Configurações de IA
# ---------------------------------------------------------------------------
setup_ai_config() {
  step "Configurações de IA ($AI_CONFIG_REPO)"
  if [ -d "$AI_CONFIG_DIR/.git" ]; then
    git -C "$AI_CONFIG_DIR" pull --ff-only -q && info "atualizado em $AI_CONFIG_DIR" \
      || warn "não consegui atualizar $AI_CONFIG_DIR (seguindo com a cópia local)"
  else
    mkdir -p "$(dirname "$AI_CONFIG_DIR")"
    # Repositório privado: tenta SSH e depois HTTPS, sem pedir senha.
    # Sem acesso (ex.: outra pessoa clonando este repo), só pula.
    if GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10" \
         git clone -q "git@github.com:$AI_CONFIG_REPO.git" "$AI_CONFIG_DIR" 2>/dev/null \
       || GIT_TERMINAL_PROMPT=0 git clone -q "https://github.com/$AI_CONFIG_REPO.git" "$AI_CONFIG_DIR" 2>/dev/null; then
      info "clonado em $AI_CONFIG_DIR"
    else
      warn "sem acesso a $AI_CONFIG_REPO; pulando (isso é normal se você não é o Nestor)"
      return 0
    fi
  fi
  if [ -x "$AI_CONFIG_DIR/install.sh" ]; then "$AI_CONFIG_DIR/install.sh" | sed 's/^/    /'; fi
}

# ---------------------------------------------------------------------------
# 2. Sistema
# ---------------------------------------------------------------------------
pkg_install() {
  if [ "$OS" = "Darwin" ]; then
    have brew || die "instale o Homebrew primeiro: https://brew.sh"
    brew install "$@"
  elif have pacman; then $SUDO pacman -S --needed --noconfirm "$@"
  elif have apt-get; then $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@"
  elif have dnf; then $SUDO dnf install -y -q "$@"
  elif have zypper; then $SUDO zypper -n install "$@"
  elif have apk; then $SUDO apk add "$@"
  else die "gerenciador de pacotes não suportado; instale manualmente: $*"
  fi
}

setup_system() {
  step "Ferramentas do sistema"
  local missing=() t
  for t in git curl openssl; do have "$t" || missing+=("$t"); done
  if [ ${#missing[@]} -gt 0 ]; then pkg_install "${missing[@]}"; fi
  info "git, curl e openssl ok"
}

setup_mise() {
  if ! have mise; then
    step "Instalando mise (gerenciador de versões)"
    curl -fsSL https://mise.run | sh
    export PATH="$HOME/.local/bin:$PATH"
  fi
  export PATH="$HOME/.local/share/mise/shims:$PATH"
}

# setup_node <versão>  (ex.: 22, 24)
setup_node() {
  local want="$1"
  step "Node $want"
  local cur=""
  have node && cur="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [ "$cur" != "$want" ]; then
    setup_mise
    mise install "node@$want"
    export PATH="$(mise where "node@$want")/bin:$PATH"
  fi
  info "node $(node -v)"
}

# setup_pnpm [versão]  (sem versão: usa o packageManager do package.json)
setup_pnpm() {
  local ver="${1:-}"
  if [ -z "$ver" ] && [ -f package.json ]; then
    ver="$(node -p 'try{(require("./package.json").packageManager||"").split("@")[1]||""}catch(e){""}' | sed 's/+.*//')"
  fi
  if have pnpm && { [ -z "$ver" ] || [ "$(pnpm -v 2>/dev/null)" = "$ver" ]; }; then
    info "pnpm $(pnpm -v)"; return
  fi
  if have corepack && corepack enable pnpm 2>/dev/null; then
    [ -n "$ver" ] && corepack prepare "pnpm@$ver" --activate >/dev/null 2>&1 || true
  fi
  if ! have pnpm || { [ -n "$ver" ] && [ "$(pnpm -v 2>/dev/null)" != "$ver" ]; }; then
    npm install -g --silent "pnpm${ver:+@$ver}"
  fi
  info "pnpm $(pnpm -v)"
}

setup_docker() {
  step "Docker"
  if have docker; then
    info "já instalado ($(docker --version))"
  elif [ "$OS" = "Darwin" ]; then
    have brew || die "instale o Homebrew primeiro: https://brew.sh"
    brew install --cask docker
    warn "abra o Docker Desktop uma vez para terminar a instalação"
    return 0
  elif [ "$DISTRO" = "arch" ] || have pacman; then
    # O get.docker.com não suporta Arch; usa os pacotes oficiais.
    pkg_install docker docker-compose docker-buildx
  else
    curl -fsSL https://get.docker.com | $SUDO sh
  fi

  if [ "$OS" = "Linux" ]; then
    if have systemctl && ! systemctl is-active --quiet docker 2>/dev/null; then
      $SUDO systemctl enable --now docker || warn "não consegui iniciar o serviço docker"
    fi
    if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
      $SUDO usermod -aG docker "$USER" \
        && warn "você entrou no grupo docker; faça logout/login para usar sem sudo"
    fi
  fi
}

# Roda docker com ou sem sudo, conforme a permissão atual.
dk() {
  if docker info >/dev/null 2>&1; then docker "$@"; else $SUDO docker "$@"; fi
}
dc() { dk compose "$@"; }

# ---------------------------------------------------------------------------
# 4. Arquivos .env
# ---------------------------------------------------------------------------
gen_secret() { openssl rand -hex "${1:-32}"; }

# env_get <arquivo> <CHAVE>  → valor atual (vazio se não existir)
env_get() {
  [ -f "$1" ] || return 0
  sed -n "s/^$2=//p" "$1" | tail -n1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# env_set <arquivo> <CHAVE> <valor>  → troca a linha CHAVE=... (ou acrescenta)
env_set() {
  local file="$1" key="$2" val="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$val" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# make_env <exemplo> <destino> [CHAVE=valor ...]
# Copia o exemplo e aplica os valores. Não faz nada se o destino já existe.
# Retorna 1 quando o arquivo já existia (para o chamador saber).
make_env() {
  local src="$1" dst="$2"; shift 2
  if [ -f "$dst" ]; then info "mantido   ${dst#"$ROOT"/} (já existe)"; return 1; fi
  if [ -n "$src" ] && [ -f "$src" ]; then cp "$src" "$dst"; else : > "$dst"; fi
  local kv
  for kv in "$@"; do env_set "$dst" "${kv%%=*}" "${kv#*=}"; done
  chmod 600 "$dst"
  info "criado    ${dst#"$ROOT"/}"
  return 0
}

# ---------------------------------------------------------------------------
# Específico deste projeto
# ---------------------------------------------------------------------------
project_tools() { setup_node 24; setup_pnpm; }

project_deps() { step "Dependências (pnpm install)"; pnpm install; }

project_env() {
  make_env apps/api/.env.example apps/api/.env \
    "SESSION_SECRET=$(gen_secret)" \
    "SETTINGS_ENCRYPTION_KEY=$(gen_secret)" || true
  make_env apps/web/.env.example apps/web/.env.local || true

  if has_flag --prod; then
    # Só letras e números: as senhas vão dentro de URLs (ver deploy/.env.example).
    make_env deploy/.env.example deploy/.env \
      "POSTGRES_PASSWORD=$(gen_secret)" \
      "APP_DB_PASSWORD=$(gen_secret)" \
      "KEYCLOAK_DB_PASSWORD=$(gen_secret)" \
      "KEYCLOAK_ADMIN_PASSWORD=$(gen_secret)" \
      "KEYCLOAK_CLIENT_SECRET=$(gen_secret)" \
      "SESSION_SECRET=$(gen_secret)" \
      "SETTINGS_ENCRYPTION_KEY=$(gen_secret)" \
      && warn "deploy/.env: preencha DOMAIN, ACME_EMAIL e KEYCLOAK_URL (Pluggy e Anthropic vão na tela Configurações)" || true
  fi
}

project_up() { dc up -d; }

project_done() {
  info "docker compose up -d       # Postgres + Keycloak (se não usou --up)"
  info "pnpm --filter api start:dev  # API em :3000"
  info "pnpm --filter web dev        # interface em :3001 (login dev/dev)"
}

# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------
if [ "$DO_AI_CONFIG" = 1 ]; then setup_ai_config; fi
setup_system
project_tools
if [ "$DO_DOCKER" = 1 ]; then setup_docker; fi
if [ "$DO_DEPS" = 1 ]; then project_deps; fi
if [ "$DO_ENV" = 1 ]; then step "Arquivos .env"; project_env; fi
if [ "$DO_UP" = 1 ]; then step "Subindo serviços locais"; project_up; fi

step "Pronto!"
project_done
