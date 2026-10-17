# Deploy na DigitalOcean

Passo a passo para colocar o Meu Caixa no ar num único Droplet da DigitalOcean, com HTTPS, login pelo Keycloak e backups. Foi escrito para quem está fazendo isso pela primeira vez: siga na ordem.

Tudo roda com Docker Compose, a partir da pasta `deploy/` deste repositório:

```
                 internet (80/443)
                        │
                     ┌──┴──┐  HTTPS automático (Let's Encrypt)
                     │Caddy│
                     └──┬──┘
       DOMAIN ──────────┼────────────── AUTH_DOMAIN
          │             │                     │
   /mcp, /health,   tudo o resto              │
   /.well-known/       │                      │
   oauth-protected-    ▼                      ▼
   resource         ┌─────┐  /api, /auth  ┌────────┐
       │            │ web │ ────────────► │  api   │ ──► Pluggy (internet)
       └──────────► │Next │               │ NestJS │
                    └─────┘               └───┬────┘
                                              │        ┌──────────┐
                                              ├──────► │ Postgres │ ◄── keycloak
                                              │        └──────────┘
                                              └──► https://AUTH_DOMAIN (pelo Caddy)
```

| Arquivo | Para quê |
| --- | --- |
| `deploy/docker-compose.yml` | A pilha de produção: Postgres, Keycloak, API, interface e Caddy |
| `deploy/.env.example` | Todas as variáveis, comentadas. Vira o `deploy/.env` (que nunca vai para o git) |
| `deploy/caddy/` | Configuração do Caddy (HTTPS, rotas, bloqueio do console do Keycloak) |
| `deploy/keycloak/` | Imagem do Keycloak para produção e o realm `meu-caixa` (sem usuário nem segredo) |
| `deploy/postgres/init.sh` | Cria os bancos `meu_caixa` e `keycloak`, cada um com seu usuário |
| `deploy/backup.sh` | Backup dos dois bancos, com retenção e cópia opcional para o Spaces |
| `deploy/smoke-local.sh` | Testa a pilha inteira na sua máquina antes de subir (seção [Testar na sua máquina](#testar-na-sua-máquina)) |
| `.github/workflows/deploy.yml` | Deploy manual pelo GitHub Actions (opcional) |

## 1. Antes de começar

Você vai precisar de:

- **Uma conta na DigitalOcean.**
- **Um domínio** em que você consiga criar registros DNS (Registro.br, Cloudflare, o próprio DNS da DigitalOcean etc.). O exemplo usa `meucaixa.exemplo.com.br` para a interface e `auth.meucaixa.exemplo.com.br` para o login.
- **As credenciais da Pluggy** (Client ID, Client Secret e os ids dos items), como no [README](../README.md#usando-seus-bancos-meu-pluggy). Dá para subir sem elas usando `FINANCE_PROVIDER=fake`, mas aí os dados são fictícios.
- **Uma chave SSH** no seu computador (`ssh-keygen -t ed25519` se ainda não tiver).

## 2. Criar o Droplet

No painel da DigitalOcean: **Create → Droplets**.

- **Imagem:** Ubuntu 24.04 LTS.
- **Tamanho:** Basic, **no mínimo 2 GB de RAM** (1 vCPU). O Keycloak é o serviço que mais usa memória (cerca de 550 MB no teste local); com 1 GB a pilha não cabe. Se puder, 4 GB dão folga para o build das imagens no próprio servidor.
- **Região:** até onde sei, a DigitalOcean não tem datacenter no Brasil. Para quem está no Brasil, a costa leste da América do Norte costuma ter a menor latência: **NYC1/NYC3 (Nova York)**, **ATL1 (Atlanta)** ou **TOR1 (Toronto)**. Confira a lista atual na tela de criação; para um painel pessoal, qualquer uma delas atende bem.
- **Autenticação:** SSH key (cole a sua chave pública). Evite senha.
- Opcional: marque **Backups** (cópia semanal do Droplet inteiro, paga à parte). É uma camada a mais; o `backup.sh` continua recomendado.

Anote o **IP público** do Droplet.

## 3. DNS

No painel do seu domínio, crie dois registros **A** apontando para o IP do Droplet:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `meucaixa` (→ `meucaixa.exemplo.com.br`) | IP do Droplet |
| A | `auth.meucaixa` (→ `auth.meucaixa.exemplo.com.br`) | IP do Droplet |

Se usar a Cloudflare, deixe os dois como **DNS only** (nuvem cinza) ao menos na primeira subida, para o Caddy conseguir emitir os certificados.

Confira antes de seguir (pode levar alguns minutos):

```bash
dig +short meucaixa.exemplo.com.br
dig +short auth.meucaixa.exemplo.com.br
```

## 4. Firewall

O jeito mais simples é o **Cloud Firewall** da DigitalOcean (**Networking → Firewalls → Create Firewall**), aplicado ao Droplet:

| Entrada | Protocolo | Porta | Origem |
| --- | --- | --- | --- |
| SSH | TCP | 22 | o seu IP, se for fixo; senão, todos |
| HTTP | TCP | 80 | todos (o Let's Encrypt valida por aqui) |
| HTTPS | TCP | 443 | todos |
| HTTP/3 | UDP | 443 | todos (opcional) |

Saída: deixe tudo liberado (a API precisa falar com a Pluggy e o Caddy com o Let's Encrypt).

Prefere o `ufw` dentro do Droplet? Funciona, com uma ressalva: portas publicadas pelo Docker **passam por fora do ufw**. Aqui isso não abre nada a mais, porque o compose só publica 80/443 (Caddy) e a 8180 em `127.0.0.1` (console do Keycloak, só local). Mesmo assim, o Cloud Firewall é mais previsível.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

## 5. Preparar o servidor

Entre como root (`ssh root@IP_DO_DROPLET`) e:

```bash
# Atualizações
apt update && apt upgrade -y

# Swap de 2 GB: dá folga para o build das imagens e para picos de memória
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker (script oficial; instala também o plugin "docker compose")
curl -fsSL https://get.docker.com | sh

# Usuário sem privilégios para o deploy, com a mesma chave SSH do root
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Pasta dos backups
mkdir -p /var/backups/meu-caixa && chown deploy:deploy /var/backups/meu-caixa && chmod 700 /var/backups/meu-caixa
```

Daqui em diante, use o usuário `deploy`: `ssh deploy@IP_DO_DROPLET`. Confira com `docker compose version`.

## 6. Clonar o repositório

```bash
git clone https://github.com/NestorBrasileiro/meu-caixa.git ~/meu-caixa
cd ~/meu-caixa/deploy
```

## 7. Preencher o `.env`

```bash
cp .env.example .env
chmod 600 .env

# Gera todas as senhas e segredos de uma vez (letras e números, 64 caracteres)
for v in POSTGRES_PASSWORD APP_DB_PASSWORD KEYCLOAK_DB_PASSWORD \
         KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET SESSION_SECRET; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
done

nano .env
```

No editor, preencha:

- `DOMAIN`, `AUTH_DOMAIN` e `ACME_EMAIL`;
- `FINANCE_PROVIDER=pluggy` com `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS`;
- o resto pode ficar como está. `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` e `MCP_ACCESS_TOKEN` são opcionais.

Guarde uma cópia do `.env` num gerenciador de senhas: sem ele, os backups do Keycloak e as sessões não se recuperam com as mesmas credenciais.

> **Importante:** as senhas do Postgres e o segredo do client `web` são gravados **na primeira subida** (no volume do banco e no realm do Keycloak). Mudar o `.env` depois não muda esses valores; veja [Trocar senhas e domínio](#trocar-senhas-e-domínio).

## 8. Subir

```bash
docker compose up -d --build
```

A primeira vez demora alguns minutos (build das três imagens). Acompanhe:

```bash
docker compose ps          # todos devem ficar "healthy"
docker compose logs -f caddy keycloak api
```

O que acontece na primeira subida:

1. O Postgres cria os bancos `meu_caixa` e `keycloak` (`postgres/init.sh`).
2. O Keycloak importa o realm `meu-caixa` (`keycloak/realm.json`), com os clients `web` e `claude` já apontando para o seu domínio, e cria o admin temporário (`KEYCLOAK_ADMIN`).
3. A API aplica as migrations e faz a primeira sincronização com a Pluggy.
4. O Caddy pede os certificados ao Let's Encrypt para os dois domínios.

Teste: `curl https://meucaixa.exemplo.com.br/health` deve responder `{"status":"ok","database":"up"}`.

## 9. Criar o seu usuário no Keycloak

O realm de produção não vem com nenhum usuário. Crie o seu e dê a role `owner` (sem ela, a interface mostra "sem acesso").

**Pelo terminal do Droplet** (mais rápido; troque o usuário, o e-mail e o nome):

```bash
cd ~/meu-caixa/deploy
kc() { docker compose exec keycloak /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/kcadm.config; }

# Login no admin (pede a senha: KEYCLOAK_ADMIN_PASSWORD do .env)
kc config credentials --server http://localhost:8080 --realm master --user admin

kc create users -r meu-caixa -s username=nestor -s enabled=true \
  -s email=voce@exemplo.com.br -s emailVerified=true -s firstName=Nestor
kc set-password -r meu-caixa --username nestor        # pede a nova senha (mín. 12 caracteres)
kc add-roles -r meu-caixa --uusername nestor --cclientid web --rolename owner
```

**Ou pelo console de administração**, por um túnel SSH (o console fica bloqueado na internet):

```bash
# no seu computador
ssh -N -L 8180:127.0.0.1:8180 deploy@IP_DO_DROPLET
```

Abra http://localhost:8180/admin. A tela de login do admin aparece no endereço público (`https://auth.../realms/master/...`), e isso é normal; depois do login você volta para o console em `localhost:8180`. Troque para o realm **meu-caixa** e:

1. **Users → Create new user**: usuário, e-mail, *Email verified* ligado → **Create**.
2. Aba **Credentials → Set password**, com *Temporary* desligado.
3. Aba **Role mapping → Assign role → Filter by clients** → `web owner` → **Assign**.

Recomendado: no realm **master**, crie um admin definitivo (Users → Create, role `admin` do realm) e apague o admin temporário: o próprio console mostra um aviso até você fazer isso.

> Quer o console aberto na internet mesmo assim? Defina `KEYCLOAK_ADMIN_URL=https://<AUTH_DOMAIN>` e `KEYCLOAK_ADMIN_PUBLIC=true` no `.env` e rode `docker compose up -d`. Não é recomendado.

## 10. Primeiro acesso e primeira sincronização

Abra `https://meucaixa.exemplo.com.br`: você vai para o login do Keycloak e, depois, para a visão geral.

A API já sincroniza na subida e depois a cada `SYNC_INTERVAL_HOURS` horas. Para forçar, use **Sincronizar agora** na interface. Para conferir pelo servidor:

```bash
docker compose logs api | grep SyncService
```

Mudou alguma credencial da Pluggy no `.env`? Rode `docker compose up -d` (recria só o que mudou) e sincronize de novo. Se a sincronização falhar, a mensagem aparece nesse log e também em `GET /api/sync/runs`.

## 11. Conectar o Claude (MCP)

O endpoint MCP fica em `https://<DOMAIN>/mcp` e o login usa OAuth com o client público `claude` do Keycloak (já importado no realm, com os callbacks `https://claude.ai/api/mcp/auth_callback` e `https://claude.com/api/mcp/auth_callback`).

1. No Claude, vá em **Configurações → Conectores → Adicionar conector personalizado**.
2. URL: `https://meucaixa.exemplo.com.br/mcp`.
3. Nas opções avançadas, **OAuth Client ID:** `claude` (sem client secret).
4. Conecte: o Claude abre a tela de login do Keycloak; entre com o seu usuário (que tem a role `owner`).

Os tokens emitidos para o client `claude` trazem a audiência `https://<DOMAIN>/mcp` e a role `owner` do client `web`.

O Caddy entrega `/mcp` e `/.well-known/oauth-protected-resource` direto para a API (com streaming), e publica os metadados do Keycloak também no formato de caminho que os clientes MCP procuram primeiro (`https://<AUTH_DOMAIN>/.well-known/oauth-authorization-server/realms/meu-caixa`).

## 12. Atualizar

```bash
cd ~/meu-caixa
git pull
cd deploy
docker compose up -d --build
docker image prune -f     # apaga as imagens antigas
```

As migrations do banco rodam sozinhas na subida da API (`DATABASE_MIGRATE_ON_START=true`). Durante o build, o site continua no ar; cada container é trocado em poucos segundos.

**Pelo GitHub Actions (opcional):** o workflow **Deploy** (`.github/workflows/deploy.yml`) faz o mesmo por SSH, só quando você manda (Actions → Deploy → Run workflow); nunca roda em push. Configure em *Settings → Secrets and variables → Actions*:

| Segredo | Valor |
| --- | --- |
| `DEPLOY_HOST` | IP do Droplet |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | uma chave privada **só para o deploy** (gere com `ssh-keygen -t ed25519 -f deploy_key`; a `.pub` vai no `~/.ssh/authorized_keys` do usuário `deploy`) |
| `DEPLOY_KNOWN_HOSTS` | opcional, recomendado: saída de `ssh-keyscan IP_DO_DROPLET` |
| `DEPLOY_PATH` | opcional: pasta do clone, se não for `~/meu-caixa` |

Sem os três primeiros, o workflow só mostra um aviso e termina sem erro. O clone no Droplet passa a seguir exatamente a branch escolhida (`git checkout -B <branch> origin/<branch>`), então não faça commits direto no servidor.

## 13. Backups e restauração

O `deploy/backup.sh` faz o `pg_dump` dos bancos `meu_caixa` e `keycloak`, comprime, guarda em `BACKUP_DIR` (padrão `/var/backups/meu-caixa`, só o dono lê) e apaga os arquivos com mais de `BACKUP_RETENTION_DAYS` dias.

Rode uma vez à mão para conferir:

```bash
~/meu-caixa/deploy/backup.sh
ls -lh /var/backups/meu-caixa
```

Agende todo dia às 03:15 (`crontab -e` como `deploy`):

```cron
15 3 * * * /home/deploy/meu-caixa/deploy/backup.sh >> /home/deploy/backup.log 2>&1
```

**Cópia fora do Droplet (recomendado):** um backup que fica só no próprio servidor some junto com ele.

1. Crie um bucket no **Spaces** (Spaces Object Storage → Create), na mesma região do Droplet, e uma chave em **API → Spaces Keys**.
2. Instale um cliente: `sudo apt install -y s3cmd` (ou o `aws-cli`).
3. No `.env`: `SPACES_BUCKET`, `SPACES_REGION` (ex.: `nyc3`), `SPACES_ACCESS_KEY`, `SPACES_SECRET_KEY`.
4. Para apagar as cópias antigas lá também, crie uma regra de ciclo de vida no bucket (expiração em N dias). O script não apaga nada no Spaces.

**Restaurar** (ex.: no mesmo Droplet, ou num Droplet novo depois dos passos 5 a 7, com o **mesmo `.env`**):

```bash
cd ~/meu-caixa/deploy
docker compose up -d postgres                  # num Droplet novo, isso cria os bancos vazios
docker compose stop api web keycloak

# escolha os arquivos (copie do Spaces com s3cmd get, se precisar)
gunzip -c /var/backups/meu-caixa/meu-caixa-meu_caixa-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose exec -T postgres psql -U postgres -d meu_caixa -v ON_ERROR_STOP=1 -q
gunzip -c /var/backups/meu-caixa/meu-caixa-keycloak-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose exec -T postgres psql -U postgres -d keycloak -v ON_ERROR_STOP=1 -q

docker compose up -d
```

Os dumps têm `DROP ... IF EXISTS` antes de cada objeto, então dá para restaurar por cima de um banco existente. Teste a restauração de vez em quando: backup que nunca foi restaurado não é backup.

## 14. Logs

```bash
docker compose ps                        # estado e healthchecks
docker compose logs -f api               # API (sincronização, login, erros)
docker compose logs -f --tail 100 caddy  # acessos e certificados
docker compose logs keycloak
docker stats                             # memória e CPU por container
```

Os logs são rotacionados pelo Docker (3 arquivos de 10 MB por container).

## 15. Problemas comuns

**O certificado HTTPS não sai** (`docker compose logs caddy` mostra erros de ACME)
: Confira se os dois registros DNS já apontam para o Droplet (`dig +short`), se as portas 80 e 443 estão liberadas no firewall e se o proxy da Cloudflare está desligado. O Let's Encrypt tem limite de tentativas; depois de corrigir, `docker compose restart caddy`.

**"Serviço de autenticação indisponível" (503) ao entrar**
: A API não conseguiu falar com o Keycloak. Ela usa a URL pública (`https://AUTH_DOMAIN`), que dentro do Docker aponta para o Caddy. Teste de dentro do container:
  `docker compose exec api node -e "fetch(process.env.KEYCLOAK_URL+'/realms/meu-caixa').then(r=>console.log(r.status),e=>console.log(e.cause))"`
  Precisa dar `200`. Se o Keycloak ainda estiver subindo (até 2 minutos na primeira vez), espere ficar `healthy`.

**O Keycloak diz "Invalid parameter: redirect_uri"**
: O realm foi importado com outro `DOMAIN`. A importação só acontece uma vez; ajuste no console (client `web` → *Valid redirect URIs* = `https://<DOMAIN>/auth/callback`, *Valid post logout redirect URIs* = `https://<DOMAIN>` e *Web origins* = `https://<DOMAIN>`).

**Volta para a tela "erro no login"**
: Veja `docker compose logs api | grep Callback`. `invalid_client` = o `KEYCLOAK_CLIENT_SECRET` do `.env` não é o do client `web` (copie o segredo do console, aba *Credentials* do client, para o `.env` e rode `docker compose up -d`).

**Entro, mas vejo "sem acesso"**
: Falta a role `owner` (client `web`) no seu usuário; passo 9.

**Container reiniciando** (`docker compose ps` mostra `Restarting`)
: `docker compose logs <serviço>`. A API recusa subir com configuração inválida e diz qual variável falta (ex.: credenciais da Pluggy com `FINANCE_PROVIDER=pluggy`).

**Memória**
: `docker stats`. Se o Droplet ficar sem memória (Keycloak lento, containers mortos por OOM), confirme o swap (`swapon --show`) ou passe para 4 GB (Droplet → Resize).

## Trocar senhas e domínio

- **Senhas do Postgres** (`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `KEYCLOAK_DB_PASSWORD`): troque no banco e no `.env`, e recrie os containers:
  ```bash
  docker compose exec postgres psql -U postgres -c "ALTER ROLE meu_caixa PASSWORD 'NOVA_SENHA'"
  # (keycloak: ALTER ROLE keycloak ...; postgres: ALTER ROLE postgres ...)
  docker compose up -d
  ```
- **`KEYCLOAK_CLIENT_SECRET`:** gere um novo no console (client `web` → *Credentials* → *Regenerate*) e copie para o `.env`; `docker compose up -d`.
- **`SESSION_SECRET`:** basta trocar no `.env` e `docker compose up -d` (todo mundo precisa entrar de novo).
- **Domínio:** troque `DOMAIN`/`AUTH_DOMAIN` no `.env`, crie os registros DNS novos, ajuste as URLs dos clients `web` e `claude` (audiência) no console do Keycloak e rode `docker compose up -d`.

## Decisões deste deploy

- **Um Droplet, Docker Compose, Caddy.** Para um painel pessoal, é o mais simples de operar: um `docker compose up -d` e HTTPS automático, sem Kubernetes nem load balancer.
- **A API fala com o Keycloak pela URL pública.** O `issuer` dos tokens precisa ser o mesmo que o browser vê (`https://AUTH_DOMAIN/realms/meu-caixa`). Em vez de manter duas URLs (interna e pública), o Caddy tem o alias de rede `AUTH_DOMAIN` dentro do Docker: a API usa `https://AUTH_DOMAIN`, a conexão fica dentro do Droplet e o certificado é o mesmo do Let's Encrypt.
- **O proxy de `/api` e `/auth` do Next é gravado no build.** Os rewrites do `next.config.ts` são calculados no `next build`, então a imagem da interface recebe `API_URL=http://api:3000` como build arg (e o mesmo valor em tempo de execução, para as telas). Para mudar o endereço da API, reconstrua a imagem.
- **Keycloak em modo de produção** (`start --optimized`), com imagem própria já "buildada" para Postgres, atrás do Caddy (`KC_PROXY_HEADERS=xforwarded`). O console de administração fica bloqueado na internet e acessível por túnel SSH.
- **Bancos e usuários separados** para a aplicação e para o Keycloak; o Postgres fica numa rede interna, sem porta publicada.
- **Limites de memória** pensados para 2 GB: Keycloak 1 GB (heap até 50%), Postgres, API e interface 384 MB cada, Caddy 128 MB. Uso medido no teste local: Keycloak ~550 MB, Postgres ~70 MB, API ~55 MB, interface ~60 MB, Caddy ~15 MB.

## Testar na sua máquina

Antes de mexer no Droplet, dá para subir a mesma pilha localmente, com HTTPS da CA interna do Caddy, dados fictícios e um usuário de teste:

```bash
deploy/smoke-local.sh            # sobe, testa tudo (inclusive o login completo e o backup) e derruba
KEEP=1 deploy/smoke-local.sh     # deixa no ar: https://meucaixa.localhost:8443 (teste / teste-local-123)
```

Usa as portas 8443 e 8180 em `127.0.0.1`. O browser vai avisar do certificado (CA local do Caddy); aceite para testar. Para derrubar depois de `KEEP=1`, o script mostra o comando (`docker compose ... down -v`).
