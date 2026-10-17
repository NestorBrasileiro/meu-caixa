# Meu Caixa

Painel financeiro pessoal. Junta num só lugar os dados de todos os bancos (saldo, limite, fatura, Pix, fluxo de caixa) via Open Finance, para planejamento financeiro — com leitura humana na interface e análise do Claude via MCP.

Arquitetura completa: [Painel Financeiro Pessoal — Arquitetura](https://claude.ai/code/artifact/b3e24946-b468-45bd-b529-eb65c3949204).

## Como funciona

```
Bancos → Open Finance → Meu Pluggy → integrations/pluggy (ACL) → Postgres → API → interface / MCP
```

- **A Pluggy é plugável.** O sistema depende só da interface `FinanceProvider` (`apps/api/src/integrations/finance-provider.ts`). O módulo `integrations/pluggy` traduz o formato da Pluggy para o modelo de domínio próprio (`src/domain/finance.ts`). Trocar de agregador = escrever outro adapter.
- **Postgres é a fonte de verdade.** O módulo `sync` copia os dados do provedor para o banco a cada `SYNC_INTERVAL_HOURS` (e sob demanda em `POST /api/sync`, o botão "Sincronizar agora"). A API sempre lê do banco; se a Pluggy cair, as telas continuam funcionando com o último dado sincronizado.
- **Login com Keycloak no backend (padrão BFF).** A API faz o fluxo OIDC (Authorization Code + PKCE) com o Keycloak e guarda os tokens numa sessão do `express-session` no Postgres. O browser só recebe um cookie `httpOnly`; os tokens nunca chegam ao frontend.
- **O browser fala só com o Next.** O `next.config.ts` faz proxy de `/api/*` e `/auth/*` para a API, então o cookie de sessão é do mesmo site e não há CORS. As telas (Server Components) chamam a API direto do servidor repassando o cookie; as ações (salvar, sincronizar) saem do browser por `/api`.
- **O Claude analisa via MCP.** A API expõe um servidor MCP em `/mcp` (também pelo proxy do Next) com ferramentas de leitura dos dados já agregados e uma para salvar o relatório da análise. Ver [Conectar no Claude (MCP)](#conectar-no-claude-mcp).
- **O adapter trata o que um ORM de banco não precisa:** timeout por requisição, retry com backoff (rede, 429, 5xx, respeitando `Retry-After`), renovação automática da API key, paginação, cache em memória e validação do formato das respostas (mudança de contrato falha alto, em vez de gravar lixo).

## Estrutura

```
apps/web/                  Next.js 16 + shadcn/ui (interface)
  src/app/(painel)/        telas: visão geral, contas, transações, planejamento, análise
  src/app/(acesso)/        sem acesso (403) e erro de login, fora do painel
  src/lib/data/            ponto único de acesso a dados: API real ou mock (DATA_SOURCE)
  src/lib/api/             contratos da API e cliente do browser para as ações
  src/lib/finance/         regras compartilhadas (fluxo de caixa, gasto por categoria)
apps/api/                  NestJS 12 + TypeScript (ESM)
  src/auth/                login com Keycloak, sessão, guard global e CSRF
  src/domain/              modelo próprio: Conta, Transação, Fatura, Conexão
  src/integrations/        FinanceProvider + adapters (pluggy, fake) + cache
  src/database/            schema Drizzle (Postgres)
  src/sync/                sincronização provedor → Postgres
  src/accounts/            GET /api/connections, GET /api/accounts
  src/transactions/        transações (lista e recategorização) e faturas
  src/planning/            compromissos fixos, metas, categorias e projeção
  src/insights/            dados para a análise do Claude (agregações, recorrências), ferramentas e relatórios salvos
  src/mcp/                 servidor MCP em /mcp (Streamable HTTP) e autenticação OAuth do Claude
  drizzle/                 migrations SQL
  test/                    testes e2e contra Postgres real
```

## Rodando local

Requisitos: Node 22.12+ (CI usa 24), pnpm 10 e Docker.

```bash
docker compose up -d                 # Postgres 17 (meu_caixa e meu_caixa_test) + Keycloak
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter api start:dev          # API em :3000; aplica as migrations e sincroniza na subida
pnpm --filter api db:seed            # opcional: compromissos, metas e categorias de exemplo
pnpm --filter web dev                # interface em :3001
```

Abra http://localhost:3001 e entre com `dev` / `dev` (realm `meu-caixa` importado de `docker/keycloak`). O console do Keycloak fica em http://localhost:8080 (`admin` / `admin`).

Com `FINANCE_PROVIDER=fake` (padrão do `.env.example`) a API sobe com dados fictícios, sem credenciais da Pluggy.

### Interface

`apps/web/.env.local`:

| Variável | Para quê |
| --- | --- |
| `DATA_SOURCE` | `api` (padrão): dados reais da API. `mock`: dataset fictício (`src/lib/mock`), sem API, banco nem Keycloak — bom para mexer só no visual; as ações de escrita ficam desabilitadas |
| `API_URL` | Onde a API responde, visto do servidor do Next (padrão `http://localhost:3000`); também é o destino do proxy de `/api` e `/auth` |
| `TIMEZONE` | Fuso do "hoje" das telas (padrão `America/Sao_Paulo`) |

Na API, `APP_URL` e `FRONTEND_URL` apontam para a interface (`http://localhost:3001`): o callback do login passa pelo proxy do Next.

### Usando seus bancos (Meu Pluggy)

1. Crie a conta no [Meu Pluggy](https://meu.pluggy.ai) e conecte seus bancos (gratuito para uso pessoal, até 5 conexões do mesmo titular).
2. No [dashboard da Pluggy](https://dashboard.pluggy.ai), pegue o Client ID e o Client Secret da sua aplicação e os ids dos items (um por banco conectado).
3. No `apps/api/.env`: `FINANCE_PROVIDER=pluggy`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS` (separados por vírgula).

As credenciais ficam só no backend; a interface conversa apenas com esta API.

## Autenticação

Fluxo igual ao do cronoflow: a API é o cliente confidencial do Keycloak e a interface só lida com o cookie de sessão.

| Rota | O que faz |
| --- | --- |
| `GET /auth/login` | Redireciona para o login do Keycloak (PKCE + state guardados na sessão) |
| `GET /auth/callback` | Troca o code por tokens, gera um novo id de sessão e volta para `FRONTEND_URL` (em caso de erro, `FRONTEND_URL?authError=login_failed`, que a interface manda para `/erro-login`) |
| `GET /auth/logout` | Apaga a sessão e encerra o SSO no Keycloak, voltando para `FRONTEND_URL` |
| `GET /auth/me` | Usuário logado (`id`, `name`, `email`, `roles`) |

- Todas as rotas, exceto `/health` e `/auth/login|callback|logout`, exigem sessão válida e a role `KEYCLOAK_REQUIRED_ROLE` (padrão `owner`, do client ou do realm). A cada requisição o token é validado por introspecção no Keycloak e renovado com o refresh token quando está para expirar.
- Respostas: `401` sem sessão (a interface redireciona para `/auth/login`), `403` sem a role (a interface mostra `/sem-acesso`), `503` se o Keycloak estiver fora do ar.
- Requisições mutantes (`POST`, `PATCH`, `DELETE`) de uma origem diferente de `FRONTEND_URL`/`APP_URL` levam `403` (proteção CSRF por `Origin`).
- O cookie é `SameSite=Lax`: API e interface ficam no mesmo site porque o Next faz proxy de `/auth` e `/api`. Em produção, `APP_URL` e `FRONTEND_URL` são a URL pública da interface.

## API

Rotas de dados sob `/api`; `/health` e `/auth/*` ficam na raiz.

| Rota | O que faz |
| --- | --- |
| `GET /health` | Status da API e do banco (pública) |
| `GET /api/connections` | Bancos conectados e o estado de cada conexão |
| `GET /api/accounts` | Contas e cartões com saldo, limite e até quando foram sincronizados |
| `GET /api/transactions` | Lista unificada; filtros `accountId`, `from`, `to`, `status`, `search`, `limit`, `offset`. Cada item traz a categoria efetiva (`category`) e a do agregador (`originalCategory`) |
| `PATCH /api/transactions/:id` | Recategoriza (`{ category }`); `null` volta para a categoria do agregador. A sincronização não desfaz |
| `GET /api/invoices` | Faturas de cartão; filtro `accountId` |
| `POST /api/sync` | Dispara uma sincronização (202); 409 se já houver uma rodando |
| `GET /api/sync/runs` | Histórico das sincronizações, com contagens e erros |
| `GET /api/planning` | Categorias de orçamento, compromissos fixos (com parcelas pagas), metas e a projeção dos próximos 6 meses |
| `POST/PATCH/DELETE /api/planning/commitments[/:id]` | Compromissos fixos (ex.: parcela do terreno); com `installmentsTotal`, o fim sai do total de parcelas |
| `POST/PATCH/DELETE /api/planning/goals[/:id]` | Metas de economia (ex.: entrada do carro) |
| `POST/PATCH/DELETE /api/planning/categories[/:id]` | Categorias de orçamento: agrupam categorias do agregador e têm um teto mensal |
| `GET /api/analysis/latest` | Última análise do Claude (formato `AnalysisReport` da interface, mais `id`, `source` e `model`); 404 se ainda não houver |
| `GET /api/analysis` | Análises salvas, da mais recente para a mais antiga; `limit` de 1 a 50 (padrão 10) |

A projeção usa a média dos últimos 3 meses fechados: renda esperada menos compromissos ativos no mês, aportes das metas até serem atingidas e o gasto variável médio (gasto total menos os compromissos). Pagamento de fatura e transferência entre contas próprias não contam como renda nem gasto.

Convenções: valores monetários em **centavos** (inteiros); transações negativas são saídas e positivas, entradas; datas `YYYY-MM-DD` no fuso `TIMEZONE` (padrão `America/Sao_Paulo`).

## Conectar no Claude (MCP)

A API tem um servidor [MCP](https://modelcontextprotocol.io) em `/mcp` (transporte Streamable HTTP, sem estado, respostas JSON) para o Claude ler os dados e analisar onde dá para cortar, os "gastos do pecado" (supérfluos recorrentes), vazamentos (assinaturas esquecidas, tarifas), gasto fixo vs. discricionário e o planejamento. O servidor manda instruções de análise para o Claude e, no fim, ele salva o relatório com `salvar_analise` — que aparece em `GET /api/analysis/latest`.

URL do servidor: `https://<domínio>/mcp` (a interface faz proxy de `/mcp` e `/.well-known/oauth-protected-resource/*` para a API). Em desenvolvimento: `http://localhost:3001/mcp` (pelo Next) ou `http://localhost:3000/mcp` (direto na API).

Peça, por exemplo: *"Analise minhas finanças dos últimos 3 meses: o que dá para cortar, quais são meus gastos do pecado e se tem assinatura esquecida. Salve a análise no Meu Caixa."*

### Ferramentas

| Ferramenta | O que devolve |
| --- | --- |
| `resumo_financeiro` | Saldo das contas, dívida e limite dos cartões, resultado do mês atual (parcial) e do anterior, conexões e última sincronização |
| `listar_contas` | Contas e cartões com saldo, limite e ids |
| `buscar_transacoes` | Transações com filtros (período, conta, categoria, texto, tipo `gastos`/`receitas`/`pagamentos_fatura`/`transferencias_proprias`), por data ou maior valor; até 200 itens, com a soma de todas as encontradas |
| `gastos_por_categoria` | Total, quantidade, participação, média mensal, valor de cada mês e variação do último mês por categoria (padrão: 3 meses fechados) |
| `fluxo_de_caixa` | Receitas, gastos, resultado e taxa de poupança mês a mês (até 24 meses) e a média dos meses fechados |
| `recorrencias` | Gastos que se repetem: assinaturas e contas fixas, hábitos frequentes (delivery, corridas), parcelamentos e mensais variáveis — valor típico, meses com cobrança, se está ativa, custo mensal e anual |
| `planejamento` | Compromissos fixos, metas (progresso e aporte necessário), tetos das categorias vs. gasto real, gasto essencial vs. discricionário e projeção de 6 meses |
| `salvar_analise` | Salva o relatório (formato `AnalysisReport`: `headline`, `summary`, `period`, `monthlyFixed`, `monthlyDiscretionary`, `potentialMonthlySavings` e `insights` dos tipos `CUT`/`SIN`/`LEAK`/`SUGGESTION`); o servidor gera ids e data |
| `ultima_analise` | Última análise salva |

Valores saem em centavos e em reais (`{ "centavos": 5590, "brl": "R$ 55,90" }`) e toda resposta diz o período usado. As regras são as do app: pagamento de fatura e transferência entre contas próprias não contam como gasto nem renda, e vale a categoria escolhida pelo usuário. As ferramentas ficam em `src/insights/tools.ts` sem depender do MCP, para a análise feita pela interface (API da Anthropic) usar as mesmas.

### Autenticação do /mcp

São dados financeiros: o `/mcp` só aceita `Authorization: Bearer <token>` — o cookie de sessão da interface **não** vale lá. Sem token, a resposta é `401` com `WWW-Authenticate: Bearer resource_metadata="https://<domínio>/.well-known/oauth-protected-resource/mcp"`, e esses metadados (RFC 9728) apontam o realm do Keycloak como servidor de autorização. É o fluxo OAuth 2.1 da especificação de autorização do MCP: o cliente descobre o Keycloak, faz o login do usuário (Authorization Code + PKCE) e chama o `/mcp` com o access token.

Um token do Keycloak vale quando (checado por introspecção a cada requisição):

- está ativo e o usuário tem a role `KEYCLOAK_REQUIRED_ROLE` (`owner`) — sem ela, `403`;
- foi emitido **para o servidor MCP**: a audiência (`aud`) inclui `${APP_URL}/mcp`. Assim um token do realm emitido para outra aplicação (inclusive o da sessão da interface, client `web`) é recusado com `401`. Se preferir confiar no client em vez da audiência, liste os clients aceitos em `MCP_ALLOWED_CLIENTS` (ex.: `claude`).

Alternativa simples para o Claude Code/Desktop: defina `MCP_ACCESS_TOKEN` (segredo longo, `openssl rand -hex 32`) e mande-o no header `Authorization: Bearer ...`. Comparado em tempo constante; deixe vazio para desligar.

#### Client "claude" no Keycloak

O realm de desenvolvimento (`docker/keycloak/meu-caixa-realm.json`) já traz o client `claude`:

- público (sem secret), só Standard Flow com PKCE `S256`;
- redirect URIs: `https://claude.ai/api/mcp/auth_callback` e `https://claude.com/api/mcp/auth_callback` (conectores do claude.ai/Claude Desktop) e `http://localhost/*` e `http://127.0.0.1/*` para o Claude Code — o Keycloak ignora a porta em redirects de loopback `http` (RFC 8252), então `http://localhost:<qualquer porta>/callback` é aceito; `http://localhost:*/*` **não** funciona (o Keycloak não tem curinga de porta);
- mapper de audiência `audiencia-mcp`, que põe `http://localhost:3001/mcp` no `aud` dos tokens;
- escopo restrito (`fullScopeAllowed: false`) com só a role `owner` do client `web`.

Em produção, troque a audiência do mapper para `https://<domínio>/mcp` (console do Keycloak → Clients → `claude` → Client scopes → `claude-dedicated` → `audiencia-mcp` → *Included Custom Audience*). O valor tem que ser igual a `${APP_URL}/mcp`. O claude.ai renova o token com o refresh token enquanto a sessão do Keycloak valer (*SSO Session Idle/Max* do realm); depois disso, pede o login de novo.

### claude.ai e Claude Desktop

O servidor e o Keycloak precisam estar na internet com HTTPS (o claude.ai conecta a partir dos servidores da Anthropic; não alcança `localhost`).

1. Em **Configurações → Conectores → Adicionar conector personalizado**: nome `Meu Caixa`, URL `https://<domínio>/mcp`.
2. Em **Configurações avançadas**, preencha **OAuth Client ID** com `claude` (deixe o secret vazio).
3. Clique em **Conectar** e entre no Keycloak com o seu usuário. O conector fica disponível também no Claude Desktop logado na mesma conta.

### Claude Code

Com OAuth (abre o login do Keycloak no browser; a porta do callback é livre):

```bash
claude mcp add --transport http --client-id claude --callback-port 8765 meu-caixa https://<domínio>/mcp
# dentro do Claude Code: /mcp → meu-caixa → Authenticate
```

Com o `MCP_ACCESS_TOKEN` (sem login):

```bash
claude mcp add --transport http meu-caixa https://<domínio>/mcp --header "Authorization: Bearer <MCP_ACCESS_TOKEN>"
```

Em desenvolvimento, troque a URL por `http://localhost:3001/mcp`.

### Variáveis (`apps/api/.env`)

| Variável | Para quê |
| --- | --- |
| `APP_URL` | URL pública da interface; o recurso MCP é `${APP_URL}/mcp` (vai nos metadados e é a audiência exigida) |
| `MCP_ACCESS_TOKEN` | Opcional: segredo (mín. 32 caracteres) aceito como Bearer token no `/mcp` |
| `MCP_ALLOWED_CLIENTS` | Opcional: clients do Keycloak (`azp`) aceitos mesmo sem a audiência do MCP, separados por vírgula |
| `KEYCLOAK_REQUIRED_ROLE` | Role exigida também no `/mcp` (padrão `owner`) |

## Scripts (`apps/api`)

| Script | Para quê |
| --- | --- |
| `pnpm start:dev` | API em modo watch |
| `pnpm test` | Testes unitários |
| `pnpm test:e2e` | Testes e2e; usam `TEST_DATABASE_URL` (padrão: `meu_caixa_test` local) e apagam as tabelas |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualidade |
| `pnpm db:generate` | Gera migration a partir de mudanças em `src/database/schema.ts` |
| `pnpm db:migrate` | Aplica as migrations no `DATABASE_URL` |
| `pnpm db:seed` | Planejamento de exemplo (compromissos, metas, categorias) para desenvolvimento; não duplica se rodar de novo |

No `apps/web`: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.

## Roadmap

- [x] **25% — Fundação e dados reais:** esqueleto Nest com os módulos e a `FinanceProvider`; adapter da Pluggy (contas, transações, faturas); Postgres modelado; `sync` gravando os dados; CI (lint, build, testes). Falta validar com 1 banco real usando as suas credenciais.
- [x] **Autenticação:** login com Keycloak (OIDC + PKCE) e sessão `express-session` no Postgres.
- [x] **50% — Interface completa, mocada:** telas em Next.js + shadcn/ui (visão geral, contas, transações, planejamento, análise), com dados mocados no formato da API, temas claro/escuro e layout para celular.
- [x] **75% — Interface ligada no back-end:** telas lendo a API real (proxy do Next, sessão do Keycloak); módulo `planning` com compromissos fixos, metas, categorias e projeção, editáveis na interface; recategorização de transações; "Sincronizar agora". A análise do Claude segue como exemplo, identificado nas telas.
- [ ] **100% — Análise via MCP e deploy:** MCP expondo os dados para o Claude; deploy na DigitalOcean.
  - [x] Servidor MCP em `/mcp` com OAuth via Keycloak, ferramentas de análise e relatórios salvos (`/api/analysis`).
