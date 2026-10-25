# Deploy na DigitalOcean

Passo a passo para colocar o Meu Caixa no ar num único Droplet da DigitalOcean, com HTTPS, login por um Keycloak, backups e atualização automática a cada release. Foi escrito para quem está fazendo isso pela primeira vez: siga na ordem.

Tudo roda com Docker Compose, a partir da pasta `deploy/` deste repositório. O login fica num **Keycloak que você já tem** (o caminho deste guia; ex.: `https://auth.cronoflow.app`). Não tem um? Dá para rodar o Keycloak no próprio Droplet: veja [Keycloak no próprio Droplet](#keycloak-no-próprio-droplet). O Postgres roda no mesmo Droplet do app; para deixá-lo num Droplet só dele, veja [Banco num Droplet separado](#banco-num-droplet-separado).

```
                 internet (80/443)
                        │
                     ┌──┴──┐  HTTPS automático (Let's Encrypt)
                     │Caddy│
                     └──┬──┘
                      DOMAIN
          ┌─────────────┴──────────────┐
   /mcp, /health,                 tudo o resto
   /.well-known/oauth-                 │
   protected-resource                  ▼
          │            ┌─────┐  /api, /auth  ┌────────┐ ──► Pluggy (internet)
          └──────────► │ web │ ────────────► │  api   │
                       │Next │               │ NestJS │ ──► Keycloak (KEYCLOAK_URL)
                       └─────┘               └───┬────┘
                                                 │
                                           ┌──────────┐
                                           │ Postgres │
                                           └──────────┘
```

| Arquivo | Para quê |
| --- | --- |
| `deploy/docker-compose.yml` | A pilha de produção: Postgres, API, interface e Caddy |
| `deploy/docker-compose.keycloak.yml` | Opcional: o Keycloak no próprio Droplet |
| `deploy/docker-compose.external-db.yml` | Opcional: o Postgres em outro Droplet (desliga o local) |
| `deploy/docker-compose.db.yml` e `deploy/.env.db.example` | O Droplet do banco, quando ele fica separado |
| `deploy/.env.example` | Todas as variáveis, comentadas. Vira o `deploy/.env` (que nunca vai para o git) |
| `deploy/caddy/` | Configuração do Caddy (HTTPS e rotas) |
| `deploy/keycloak/realm.json` | O realm `meu-caixa` (clients `web` e `claude`, role `owner`), para importar no Keycloak |
| `deploy/postgres/init.sh` | Cria o banco `meu_caixa` e o usuário dele na primeira subida |
| `deploy/backup.sh` | Backup dos bancos, com retenção e cópia opcional para o Spaces |
| `deploy/update.sh` | Atualiza o Droplet para uma versão publicada (backup, imagens, `/health` e volta se falhar) |
| `deploy/smoke-local.sh` | Testa a pilha inteira na sua máquina antes de subir ([Testar na sua máquina](#testar-na-sua-máquina)) |
| `.github/workflows/release.yml` | A cada tag `vX.Y.Z`: publica as imagens no ghcr.io e atualiza o Droplet |
| `.github/workflows/deploy.yml` | Atualiza o Droplet para uma versão (chamado pelo Release, ou à mão para voltar uma versão) |

## 1. Antes de começar

Você vai precisar de:

- **Uma conta na DigitalOcean.**
- **Um domínio** em que você consiga criar registros DNS (Registro.br, Cloudflare, o próprio DNS da DigitalOcean etc.). O exemplo usa `meucaixa.exemplo.com.br`.
- **Acesso de administrador a um Keycloak** que responda por HTTPS na internet (ex.: `https://auth.cronoflow.app`). O Meu Caixa ganha um realm próprio nele (`meu-caixa`), separado dos outros apps: usuários e sessões não se misturam.
- **As credenciais da Pluggy** (Client ID, Client Secret e os ids dos items), como no [README](../README.md#usando-seus-bancos-meu-pluggy). Elas são cadastradas na tela **Configurações** depois do primeiro login; até lá a API sobe normalmente, só sem sincronizar.
- **Uma chave SSH** no seu computador (`ssh-keygen -t ed25519` se ainda não tiver).

## 2. Criar o Droplet

No painel da DigitalOcean: **Create → Droplets**.

- **Imagem:** Ubuntu 24.04 LTS.
- **Tamanho:** Basic. Com o Keycloak fora do Droplet, a pilha usa pouca memória (no teste local: Postgres ~60 MB, API ~70 MB, interface ~60 MB, Caddy ~55 MB). **1 GB** basta para rodar as imagens prontas das releases; para gerar as imagens no próprio servidor (`--build`, o build do Next é pesado), use **2 GB**.
- **Região:** até onde sei, a DigitalOcean não tem datacenter no Brasil. Para quem está no Brasil, a costa leste da América do Norte costuma ter a menor latência: **NYC1/NYC3 (Nova York)**, **ATL1 (Atlanta)** ou **TOR1 (Toronto)**. Confira a lista atual na tela de criação.
- **Autenticação:** SSH key (cole a sua chave pública). Evite senha.
- Opcional: marque **Backups** (cópia semanal do Droplet inteiro, paga à parte). É uma camada a mais; o `backup.sh` continua recomendado.

Anote o **IP público** do Droplet.

## 3. DNS

No painel do seu domínio, crie um registro **A** apontando para o IP do Droplet:

| Tipo | Nome | Valor |
| --- | --- | --- |
| A | `meucaixa` (→ `meucaixa.exemplo.com.br`) | IP do Droplet |

Se usar a Cloudflare, deixe como **DNS only** (nuvem cinza) ao menos na primeira subida, para o Caddy conseguir emitir o certificado. Confira antes de seguir (pode levar alguns minutos): `dig +short meucaixa.exemplo.com.br`.

## 4. Firewall

O jeito mais simples é o **Cloud Firewall** da DigitalOcean (**Networking → Firewalls → Create Firewall**), aplicado ao Droplet:

| Entrada | Protocolo | Porta | Origem |
| --- | --- | --- | --- |
| SSH | TCP | 22 | o seu IP, se for fixo; senão, todos |
| HTTP | TCP | 80 | todos (o Let's Encrypt valida por aqui) |
| HTTPS | TCP | 443 | todos |
| HTTP/3 | UDP | 443 | todos (opcional) |

Saída: deixe tudo liberado (a API precisa falar com a Pluggy e com o Keycloak, e o Caddy com o Let's Encrypt).

Prefere o `ufw` dentro do Droplet? Funciona, com uma ressalva: portas publicadas pelo Docker **passam por fora do ufw**. Aqui isso não abre nada a mais, porque o compose só publica 80/443 (Caddy). Mesmo assim, o Cloud Firewall é mais previsível.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

## 5. Preparar o servidor

Entre como root (`ssh root@IP_DO_DROPLET`) e:

```bash
# Atualizações
apt update && apt upgrade -y

# Swap de 2 GB: folga para picos de memória (e para o build, se fizer no servidor)
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

Na versão que vai subir (a tag de uma release; a lista fica em **Releases**, no GitHub):

```bash
git clone https://github.com/NestorBrasileiro/meu-caixa.git ~/meu-caixa
cd ~/meu-caixa
git checkout v1.1.0     # troque pela versão que vai subir
cd deploy
```

## 7. Preencher o `.env`

```bash
cp .env.example .env
chmod 600 .env

# Gera as senhas e segredos de uma vez (letras e números, 64 caracteres)
for v in POSTGRES_PASSWORD APP_DB_PASSWORD SESSION_SECRET SETTINGS_ENCRYPTION_KEY \
         KEYCLOAK_CLIENT_SECRET; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
done

nano .env
```

No editor, preencha:

- `APP_VERSION`: a mesma versão do `git checkout` (ex.: `v1.1.0`);
- `DOMAIN` e `ACME_EMAIL`;
- `KEYCLOAK_URL`: o endereço do seu Keycloak, sem `/realms` no fim (ex.: `https://auth.cronoflow.app`). `KEYCLOAK_REALM=meu-caixa` e `KEYCLOAK_CLIENT_ID=web` ficam como estão;
- `FINANCE_PROVIDER=pluggy` (as credenciais da Pluggy você cadastra depois, na tela **Configurações**; o `SETTINGS_ENCRYPTION_KEY` gerado acima é o que cifra o Client Secret no banco);
- o resto pode ficar como está. A chave da Anthropic (análise pelo app, opcional) e o token do MCP também se cadastram em **Configurações**, cada usuário os seus.

O `KEYCLOAK_CLIENT_SECRET` gerado acima vai para o client `web` no próximo passo. Guarde uma cópia do `.env` num gerenciador de senhas.

> **Importante:** as senhas do Postgres são gravadas **na primeira subida** (no volume do banco). Mudar o `.env` depois não muda esses valores; veja [Trocar senhas e domínio](#trocar-senhas-e-domínio).

## 8. Criar o realm no Keycloak

O `deploy/keycloak/realm.json` tem o realm pronto: o client `web` (a API, confidencial), o client `claude` (o conector do Claude, público, com PKCE e a audiência do MCP) e a role `owner`. Ele tem dois marcadores, `${DOMAIN}` e `${KEYCLOAK_CLIENT_SECRET}`, que você troca pelos valores do `.env` antes de importar:

```bash
cd ~/meu-caixa/deploy
DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2-)
SECRET=$(grep '^KEYCLOAK_CLIENT_SECRET=' .env | cut -d= -f2-)
sed -e "s|\${DOMAIN}|$DOMAIN|g" -e "s|\${KEYCLOAK_CLIENT_SECRET}|$SECRET|g" \
  keycloak/realm.json > ~/meu-caixa-realm.json
grep -c '\${' ~/meu-caixa-realm.json     # 0 = nenhum marcador sobrou
```

Traga o arquivo para o seu computador (`scp deploy@IP_DO_DROPLET:meu-caixa-realm.json .`) e importe no console do Keycloak (ex.: `https://auth.cronoflow.app/admin`):

1. No seletor de realms (canto superior esquerdo), **Create realm**.
2. Em **Resource file**, escolha o `meu-caixa-realm.json` e clique em **Create**.
3. Confira em **Clients → web**: *Valid redirect URIs* = `https://<DOMAIN>/auth/callback`; e na aba *Credentials*, o mesmo segredo do `.env`.

Tem acesso ao `kcadm.sh` desse Keycloak? `kcadm.sh create realms -f meu-caixa-realm.json` faz o mesmo. Depois, **apague o arquivo** nas duas máquinas (`rm ~/meu-caixa-realm.json`): ele tem o segredo do client.

O realm foi exportado de um Keycloak 26. Se o seu for bem mais antigo e a importação reclamar de algum campo, crie os clients à mão com os mesmos valores (os do `realm.json` servem de roteiro).

**Para o conector do Claude (recomendado):** clientes MCP procuram os metadados do login primeiro em `https://<KEYCLOAK>/.well-known/oauth-authorization-server/realms/meu-caixa` (RFC 8414), e o Keycloak só responde em `/realms/meu-caixa/.well-known/...`. Se o proxy na frente do seu Keycloak for um Caddy, acrescente no site dele:

```caddy
@wellKnownInserted path_regexp wk ^/\.well-known/(oauth-authorization-server|openid-configuration)/realms/([^/]+)$
rewrite @wellKnownInserted /realms/{re.wk.2}/.well-known/{re.wk.1}
```

Em outro proxy (Nginx, Traefik), faça a reescrita equivalente. Sem ela, o login pelo app e pelo Claude Code com token pessoal funcionam normalmente; só o conector OAuth de algum cliente MCP pode não achar o login.

## 9. Subir

Com as imagens da release (publicadas pelo workflow Release, passo 13):

```bash
cd ~/meu-caixa/deploy
docker compose pull
docker compose up -d --wait
```

> **Ainda sem nenhuma release publicada?** Gere as imagens no próprio Droplet (precisa de 2 GB de RAM): `docker compose up -d --build --wait`. Deixe `APP_VERSION=latest` no `.env` nesse caso.
>
> **As imagens são privadas?** Depois da primeira release, os pacotes aparecem no seu perfil do GitHub, em **Packages**. Para o `docker compose pull` à mão funcionar sem login, deixe os três (`meu-caixa-api`, `meu-caixa-web`, `meu-caixa-keycloak`) **públicos** (*Package settings → Change visibility*): as imagens só têm o código, que já é público, e nenhum segredo (tudo vem do `.env`). O deploy automático entra no ghcr.io sozinho, públicos ou não.

O que acontece na primeira subida:

1. O Postgres cria o banco `meu_caixa` (`postgres/init.sh`).
2. A API aplica as migrations. A sincronização começa depois que você cadastrar a sua Pluggy (passo 11).
3. O Caddy pede o certificado ao Let's Encrypt.

Teste: `curl https://meucaixa.exemplo.com.br/health` deve responder `{"status":"ok","database":"up"}`.

## 10. Criar o seu usuário

O realm novo não tem usuário nenhum. No console do Keycloak, no realm **meu-caixa**:

1. **Users → Create new user**: usuário, e-mail, *Email verified* ligado → **Create**.
2. Aba **Credentials → Set password**, com *Temporary* desligado.
3. Aba **Role mapping → Assign role → Filter by clients** → `web owner` → **Assign**.

Sem a role `owner`, a interface mostra "sem acesso".

### Convidar outras pessoas

O app é multiusuário, com cadastro só por convite: cada pessoa que você criar assim, com a role `owner` do client `web`, entra com os próprios dados e não enxerga os seus (nem você os dela). No primeiro acesso, ela cadastra a própria Pluggy em **Configurações** (cada pessoa usa a sua aplicação da Pluggy, com o Meu Pluggy dela) e, se quiser, a própria chave da Anthropic.

Para cortar o acesso de alguém, desative o usuário no Keycloak (aba *Details* → *Enabled*). Se a pessoa tiver gerado um token do MCP, ele continua valendo até ser revogado: apague o usuário dela no app, o que leva junto todos os dados dela:

```bash
docker compose exec postgres psql -U postgres -d meu_caixa -c "delete from users where username = 'fulano'"
```

## 11. Primeiro acesso e primeira sincronização

Abra `https://meucaixa.exemplo.com.br`: você vai para o login do Keycloak e, depois, para a visão geral. Cadastre a sua Pluggy em **Configurações** e clique em **Sincronizar agora**.

A API sincroniza sozinha a cada `SYNC_INTERVAL_HOURS` horas, para cada usuário que cadastrou a Pluggy, um de cada vez. Para conferir pelo servidor:

```bash
docker compose logs api | grep Sync
```

Enquanto ninguém cadastrar a Pluggy, o log mostra "nenhum usuário com a Pluggy configurada". Trocou credencial ou conectou outro banco? Atualize na mesma tela e sincronize de novo, sem reiniciar nada. Se a sincronização falhar, a mensagem aparece nesse log e também em `GET /api/sync/runs`.

## 12. Conectar o Claude (MCP)

O endpoint MCP fica em `https://<DOMAIN>/mcp` e o login usa OAuth com o client público `claude` do realm (com os callbacks `https://claude.ai/api/mcp/auth_callback` e `https://claude.com/api/mcp/auth_callback`).

1. No Claude, vá em **Configurações → Conectores → Adicionar conector personalizado**.
2. URL: `https://meucaixa.exemplo.com.br/mcp`.
3. Nas opções avançadas, **OAuth Client ID:** `claude` (sem client secret).
4. Conecte: o Claude abre a tela de login do Keycloak; entre com o seu usuário (que tem a role `owner`). O Claude passa a ver só os dados de quem entrou.

No Claude Code ou Desktop sem OAuth, use o token pessoal gerado em **Configurações → Token do MCP** (a tela mostra o comando `claude mcp add` pronto).

Os tokens emitidos para o client `claude` trazem a audiência `https://<DOMAIN>/mcp` e a role `owner` do client `web`. O Caddy entrega `/mcp` e `/.well-known/oauth-protected-resource` direto para a API, com streaming.

## 13. Publicar versões e atualizar sozinho

Cada versão do Meu Caixa é uma **tag `vX.Y.Z`**. Ao receber uma tag, o workflow **Release**:

1. gera as imagens da API, da interface e do Keycloak e publica no ghcr.io (`ghcr.io/<usuário>/meu-caixa-api:vX.Y.Z`, e `latest` para versões que não são pré-release);
2. chama o workflow **Deploy**, que entra no Droplet por SSH e roda o `deploy/update.sh` da versão nova: backup dos bancos, arquivos do deploy na versão (`git checkout` da tag), `APP_VERSION` no `.env`, `docker compose pull` e `up -d` esperando os healthchecks, e `/health` pelo Caddy. Se algo falhar, ele volta para a versão anterior.

**Configurar uma vez** (*Settings → Secrets and variables → Actions*, no GitHub):

| Segredo | Valor |
| --- | --- |
| `DEPLOY_HOST` | IP do Droplet |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | uma chave privada **só para o deploy** (gere com `ssh-keygen -t ed25519 -f deploy_key`; a `.pub` vai no `~/.ssh/authorized_keys` do usuário `deploy`) |
| `DEPLOY_KNOWN_HOSTS` | opcional, recomendado: saída de `ssh-keyscan IP_DO_DROPLET` |
| `DEPLOY_PATH` | opcional: pasta do clone, se não for `~/meu-caixa` |

Sem os três primeiros, o Release só publica as imagens e o Deploy avisa e termina sem erro.

**Publicar uma versão:**

```bash
git tag -a v1.1.0 -m "Meu Caixa 1.1.0"
git push origin v1.1.0
```

Ou, no GitHub, **Releases → Draft a new release**, com uma tag nova. Acompanhe em **Actions → Release**; em poucos minutos o Droplet está na versão nova.

**Voltar uma versão:** **Actions → Deploy → Run workflow** com a versão anterior (ex.: `v1.0.1`). As migrations do banco não voltam sozinhas: se a versão nova mudou o banco de um jeito que a anterior não entende, restaure o backup que o `update.sh` fez antes de atualizar (passo 14).

**À mão, no Droplet:** `~/meu-caixa/deploy/update.sh v1.1.0` faz o mesmo que o workflow (as imagens precisam ser públicas, ou rode `docker login ghcr.io` antes).

**Sem release (gerando as imagens no servidor):**

```bash
cd ~/meu-caixa && git pull
cd deploy && docker compose up -d --build --wait
docker image prune -f     # apaga as imagens antigas
```

As migrations do banco rodam sozinhas na subida da API (`DATABASE_MIGRATE_ON_START=true`). Durante a atualização, o site continua no ar; cada container é trocado em poucos segundos.

### Atualizando de uma versão com as credenciais no `.env`

Antes, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_ITEM_IDS`, `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` ficavam no `deploy/.env`. Agora ficam no banco (tela **Configurações**), e a API não sobe sem a `SETTINGS_ENCRYPTION_KEY`. Para atualizar sem ficar fora do ar:

1. **Antes** de atualizar, crie a chave no `deploy/.env` (uma vez só, e guarde junto com o resto do `.env`):

   ```bash
   cd ~/meu-caixa/deploy
   echo "SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
   ```

2. Atualize.
3. Entre no app, abra **Configurações** e cadastre o Client ID, o Client Secret e os Item IDs da Pluggy (os mesmos valores que estavam no `.env`). Se usava a análise pelo app, cadastre também a chave da Anthropic e escolha o modelo.
4. Clique em **Sincronizar agora**. Até o passo 3, a API sobe normalmente mas pula a sincronização (`docker compose logs api | grep Sync` mostra "ignorada").
5. Apague do `deploy/.env` as cinco variáveis antigas: elas não são mais repassadas para a API.

### Atualizando para a versão multiusuário

A migration 0007 cria a tabela `users` e passa todos os dados que já existem (contas, transações, planejamento, análises, configurações) para um usuário só:

- se a Pluggy ou a chave da Anthropic já estavam cadastradas em **Configurações**, para quem as salvou;
- se não, para **o primeiro login depois da atualização**. Entre você primeiro, logo depois de atualizar, antes de convidar alguém.

O `MCP_ACCESS_TOKEN` deixa de valer: gere o seu token pessoal em **Configurações → Token do MCP**, troque no Claude Code ou Desktop e apague a variável do `deploy/.env`. O conector do claude.ai (OAuth) continua funcionando sem mudança.

### Atualizando para o Keycloak externo e as imagens das releases

Até a v1.0.0, o `deploy/` subia sempre o Keycloak no Droplet e gerava as imagens no servidor. Agora o padrão é o Keycloak externo e as imagens das releases. Já tem um Droplet com o Keycloak dele? Para manter tudo como está, antes de atualizar acrescente ao `deploy/.env`:

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.keycloak.yml
KEYCLOAK_URL=https://<AUTH_DOMAIN>
APP_VERSION=latest
```

## 14. Backups e restauração

O `deploy/backup.sh` faz o `pg_dump` do banco `meu_caixa` (e do `keycloak`, se ele roda no Droplet), comprime, guarda em `BACKUP_DIR` (padrão `/var/backups/meu-caixa`, só o dono lê) e apaga os arquivos com mais de `BACKUP_RETENTION_DAYS` dias. O `update.sh` também roda um antes de cada atualização.

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

Os usuários do login ficam no Keycloak externo: o backup deles é o daquele servidor.

**Restaurar** (ex.: no mesmo Droplet, ou num Droplet novo depois dos passos 5 a 7, com o **mesmo `.env`**):

```bash
cd ~/meu-caixa/deploy
docker compose up -d postgres                  # num Droplet novo, isso cria o banco vazio
docker compose stop api web

# escolha o arquivo (copie do Spaces com s3cmd get, se precisar)
gunzip -c /var/backups/meu-caixa/meu-caixa-meu_caixa-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose exec -T postgres psql -U postgres -d meu_caixa -v ON_ERROR_STOP=1 -q

docker compose up -d
```

Os dumps têm `DROP ... IF EXISTS` antes de cada objeto, então dá para restaurar por cima de um banco existente. Teste a restauração de vez em quando: backup que nunca foi restaurado não é backup.

## 15. Logs

```bash
docker compose ps                        # estado e healthchecks
docker compose logs -f api               # API (sincronização, login, erros)
docker compose logs -f --tail 100 caddy  # acessos e certificados
docker stats                             # memória e CPU por container
```

Os logs são rotacionados pelo Docker (3 arquivos de 10 MB por container). As atualizações automáticas ficam registradas em **Actions → Deploy**, no GitHub.

## 16. Problemas comuns

**O certificado HTTPS não sai** (`docker compose logs caddy` mostra erros de ACME)
: Confira se o registro DNS já aponta para o Droplet (`dig +short`), se as portas 80 e 443 estão liberadas no firewall e se o proxy da Cloudflare está desligado. O Let's Encrypt tem limite de tentativas; depois de corrigir, `docker compose restart caddy`.

**"Serviço de autenticação indisponível" (503) ao entrar**
: A API não conseguiu falar com o Keycloak. Teste de dentro do container:
  `docker compose exec api node -e "fetch(process.env.KEYCLOAK_URL+'/realms/'+process.env.KEYCLOAK_REALM).then(r=>console.log(r.status),e=>console.log(e.cause))"`
  Precisa dar `200`. `404` = o realm não existe com esse nome nesse Keycloak; erro de rede = `KEYCLOAK_URL` errado ou o Droplet não alcança o Keycloak.

**O Keycloak diz "Invalid parameter: redirect_uri"**
: O realm foi importado com outro `DOMAIN`. Ajuste no console (client `web` → *Valid redirect URIs* = `https://<DOMAIN>/auth/callback`, *Valid post logout redirect URIs* = `https://<DOMAIN>` e *Web origins* = `https://<DOMAIN>`).

**Volta para a tela "erro no login"**
: Veja `docker compose logs api | grep Callback`. `invalid_client` = o `KEYCLOAK_CLIENT_SECRET` do `.env` não é o do client `web` (copie o segredo do console, aba *Credentials* do client, para o `.env` e rode `docker compose up -d`).

**Entro, mas vejo "sem acesso"**
: Falta a role `owner` (client `web`) no seu usuário; passo 10.

**O deploy automático falhou**
: Abra o log em **Actions → Deploy**. O `update.sh` diz em que passo parou e, se voltou para a versão anterior, o site segue no ar nela. `manifest unknown` no `pull` = as imagens dessa versão não foram publicadas (veja **Actions → Release**).

**Container reiniciando** (`docker compose ps` mostra `Restarting`)
: `docker compose logs <serviço>`. A API recusa subir com configuração inválida e diz qual variável falta (ex.: `SETTINGS_ENCRYPTION_KEY` com `FINANCE_PROVIDER=pluggy`).

**Memória**
: `docker stats`. Se o Droplet ficar sem memória (containers mortos por OOM), confirme o swap (`swapon --show`) ou aumente o Droplet (Droplet → Resize).

## Trocar senhas e domínio

- **Senhas do Postgres** (`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`): troque no banco e no `.env`, e recrie os containers:
  ```bash
  docker compose exec postgres psql -U postgres -c "ALTER ROLE meu_caixa PASSWORD 'NOVA_SENHA'"
  # (postgres: ALTER ROLE postgres ...)
  docker compose up -d
  ```
- **`KEYCLOAK_CLIENT_SECRET`:** gere um novo no console (client `web` → *Credentials* → *Regenerate*) e copie para o `.env`; `docker compose up -d`.
- **`SESSION_SECRET`:** basta trocar no `.env` e `docker compose up -d` (todo mundo precisa entrar de novo).
- **Domínio:** troque `DOMAIN` no `.env`, crie o registro DNS novo, ajuste as URLs do client `web` e a audiência do client `claude` (`https://<DOMAIN>/mcp`) no console do Keycloak e rode `docker compose up -d`.

## Banco num Droplet separado

O Postgres num Droplet só dele, ligado ao do app pela rede privada (VPC) da DigitalOcean: o banco nunca fica exposto na internet, e o Droplet do app pode ser recriado ou aumentado sem tocar nos dados.

1. **Criar o Droplet do banco** (passo 2): Ubuntu 24.04, Basic de 1 GB, **na mesma região do app** (a VPC é por região; os dois entram na VPC padrão dela). Anote o **IP privado** dos dois Droplets (Droplet → *Networking* → *Private IP*, ou `ip -4 addr show eth1` dentro dele).
2. **Firewall do Droplet do banco** (um Cloud Firewall só para ele):

   | Entrada | Protocolo | Porta | Origem |
   | --- | --- | --- | --- |
   | SSH | TCP | 22 | o seu IP, se for fixo; senão, todos |
   | Postgres | TCP | 5432 | **só o Droplet do app** (escolha o Droplet ou uma tag dele) |

   Nada de 80/443 aqui. Saída liberada (atualizações e o Spaces, se usar).
3. **Preparar o servidor:** o passo 5, neste Droplet (Docker, usuário `deploy`, pasta dos backups).
4. **Subir o Postgres**, como `deploy`:

   ```bash
   git clone https://github.com/NestorBrasileiro/meu-caixa.git ~/meu-caixa
   cd ~/meu-caixa && git checkout v1.1.0 && cd deploy     # a mesma versão do app
   cp .env.db.example .env && chmod 600 .env
   for v in POSTGRES_PASSWORD APP_DB_PASSWORD; do
     sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
   done
   nano .env                  # DB_BIND_IP = o IP privado DESTE Droplet
   docker compose up -d --wait
   ```

   O `COMPOSE_FILE=docker-compose.db.yml` do `.env` faz o `docker compose` daqui subir só o Postgres, escutando apenas no IP privado. Guarde uma cópia deste `.env` também.
5. **Backups aqui**, onde os dados moram: o `backup.sh` e o cron do passo 14 funcionam igual neste Droplet.
6. **No Droplet do app**, no `deploy/.env`, descomente e preencha:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.external-db.yml
   DATABASE_HOST=10.116.0.3          # o IP privado do Droplet do banco
   APP_DB_PASSWORD=<a mesma do .env do Droplet do banco>
   ```

   Antes de subir (passo 9), confira que o app alcança o banco: `docker run --rm postgres:17-alpine pg_isready -h 10.116.0.3` deve dizer `accepting connections`. Daí em diante, as migrations rodam do app para o banco na subida, como sempre, e o backup que o `update.sh` faz antes de cada atualização copia o banco pela rede para o Droplet do app.

**Já tem um Postgres** (ex.: o servidor de banco do cronoflow)? Pule os passos 1 a 5 e crie o usuário e o banco do Meu Caixa nele, separados dos outros:

```sql
CREATE ROLE meu_caixa LOGIN PASSWORD 'SENHA';
CREATE DATABASE meu_caixa OWNER meu_caixa;
REVOKE ALL ON DATABASE meu_caixa FROM PUBLIC;
```

No `.env` do app, use `DATABASE_HOST` (porta 5432) ou, se o servidor usar outra porta ou exigir TLS, um `DATABASE_URL` completo (`postgres://meu_caixa:SENHA@host:porta/meu_caixa?...`). O app é testado com o Postgres 17; use 15 ou mais novo.

**Restaurar** com o banco separado: pare o app (`docker compose stop api web`, no Droplet do app), restaure **no Droplet do banco** e suba o app de novo (`docker compose up -d`):

```bash
cd ~/meu-caixa/deploy                          # no Droplet do banco
gunzip -c /var/backups/meu-caixa/meu-caixa-meu_caixa-AAAAMMDDTHHMMSSZ.sql.gz |
  docker compose exec -T postgres psql -U postgres -d meu_caixa -v ON_ERROR_STOP=1 -q
```

**Trocar a senha do `meu_caixa`:** `ALTER ROLE meu_caixa PASSWORD '...'` no Droplet do banco, a mesma senha no `APP_DB_PASSWORD` dos **dois** `.env`, e `docker compose up -d` no do app.

## Keycloak no próprio Droplet

Sem um Keycloak para usar, o `docker-compose.keycloak.yml` sobe um no Droplet, com banco próprio no mesmo Postgres e um segundo domínio para o login (ex.: `auth.meucaixa.exemplo.com.br`). Ele precisa de **2 GB de RAM** no mínimo (o Keycloak usa ~650 MB).

1. **DNS:** um segundo registro A, `auth.meucaixa`, para o mesmo IP.
2. **`.env`:** descomente o bloco "B" do `.env.example` e preencha:

   ```bash
   COMPOSE_FILE=docker-compose.yml:docker-compose.keycloak.yml
   AUTH_DOMAIN=auth.meucaixa.exemplo.com.br
   KEYCLOAK_URL=https://auth.meucaixa.exemplo.com.br
   KEYCLOAK_DB_PASSWORD=<openssl rand -hex 32>
   KEYCLOAK_ADMIN_PASSWORD=<openssl rand -hex 32>
   ```

   O `docker compose` lê o `COMPOSE_FILE` do `.env`: todos os comandos deste guia continuam iguais.
3. **Subir** (passo 9). Na primeira subida o Keycloak importa o `keycloak/realm.json` sozinho, já com o `DOMAIN` e o `KEYCLOAK_CLIENT_SECRET` do `.env` (pule o passo 8), e cria o admin temporário (`KEYCLOAK_ADMIN`). A API fala com ele pela URL pública, que dentro do Docker aponta para o Caddy (alias de rede): a conexão não sai do Droplet.
4. **Seu usuário**, pelo terminal do Droplet:

   ```bash
   cd ~/meu-caixa/deploy
   kc() { docker compose exec keycloak /opt/keycloak/bin/kcadm.sh "$@" --config /tmp/kcadm.config; }
   kc config credentials --server http://localhost:8080 --realm master --user admin   # senha: KEYCLOAK_ADMIN_PASSWORD
   kc create users -r meu-caixa -s username=nestor -s enabled=true \
     -s email=voce@exemplo.com.br -s emailVerified=true -s firstName=Nestor
   kc set-password -r meu-caixa --username nestor        # pede a nova senha (mín. 12 caracteres)
   kc add-roles -r meu-caixa --uusername nestor --cclientid web --rolename owner
   ```

   Ou pelo **console de administração**, por um túnel SSH (ele fica bloqueado na internet): `ssh -N -L 8180:127.0.0.1:8180 deploy@IP_DO_DROPLET` no seu computador e abra http://localhost:8180/admin. A tela de login do admin aparece no endereço público (`https://auth.../realms/master/...`), e isso é normal. Recomendado: no realm **master**, crie um admin definitivo (role `admin` do realm) e apague o admin temporário.

   Quer o console aberto na internet mesmo assim? `KEYCLOAK_ADMIN_URL=https://<AUTH_DOMAIN>` e `KEYCLOAK_ADMIN_PUBLIC=true` no `.env` e `docker compose up -d`. Não é recomendado.

Neste modo, o backup inclui o banco `keycloak` (restaure os dois: troque `meu_caixa` por `keycloak` no comando do passo 14 e pare também o `keycloak` antes), a senha `KEYCLOAK_DB_PASSWORD` se troca como as do Postgres (`ALTER ROLE keycloak ...`), e para trocar de domínio você ajusta também `AUTH_DOMAIN` e `KEYCLOAK_URL`.

## Decisões deste deploy

- **Um Droplet, Docker Compose, Caddy.** Para um painel pessoal, é o mais simples de operar: um `docker compose up -d` e HTTPS automático, sem Kubernetes nem load balancer.
- **Login num Keycloak externo por padrão.** Quem já tem um Keycloak (como o do cronoflow) ganha só um realm a mais, e o Droplet fica pequeno. O Keycloak no próprio Droplet continua a um `COMPOSE_FILE` de distância.
- **Imagens geradas uma vez, no GitHub.** O Droplet só baixa a versão publicada: nada de build pesado no servidor, e voltar uma versão é baixar as imagens anteriores. Cada atualização faz backup antes e confere o `/health` depois.
- **O proxy de `/api` e `/auth` do Next é gravado no build.** Os rewrites do `next.config.ts` são calculados no `next build`, então a imagem da interface recebe `API_URL=http://api:3000` (o nome do serviço no compose): a mesma imagem serve qualquer domínio.
- **O Postgres fica numa rede interna**, sem porta publicada; a API sai para a internet (Pluggy, Keycloak) pela rede do Caddy. Num Droplet separado, ele escuta só no IP privado da VPC, com o firewall liberando a porta apenas para o Droplet do app.
- **Limites de memória:** Postgres, API e interface 384 MB cada, Caddy 128 MB (e o Keycloak 1 GB, heap até 50%, se rodar aqui).

## Testar na sua máquina

Antes de mexer no Droplet, dá para subir a pilha localmente, com HTTPS da CA interna do Caddy, dados fictícios, o Keycloak do compose e um usuário de teste:

```bash
deploy/smoke-local.sh            # sobe, testa tudo (inclusive o login completo e o backup) e derruba
KEEP=1 deploy/smoke-local.sh     # deixa no ar: https://meucaixa.localhost:8443 (teste / teste-local-123)
```

Usa as portas 8443 e 8180 em `127.0.0.1`. O browser vai avisar do certificado (CA local do Caddy); aceite para testar. Para derrubar depois de `KEEP=1`, o script mostra o comando (`docker compose ... down -v`).
