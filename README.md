# Meu Caixa

Painel financeiro pessoal. Junta num só lugar os dados de todos os bancos (saldo, limite, fatura, Pix, fluxo de caixa) via Open Finance, para planejamento financeiro — com leitura humana na interface e análise do Claude via MCP.

Arquitetura completa: [Painel Financeiro Pessoal — Arquitetura](https://claude.ai/code/artifact/b3e24946-b468-45bd-b529-eb65c3949204).

## Como funciona

```
Bancos → Open Finance → Meu Pluggy → integrations/pluggy (ACL) → Postgres → API → interface / MCP
```

- **A Pluggy é plugável.** O sistema depende só da interface `FinanceProvider` (`apps/api/src/integrations/finance-provider.ts`). O módulo `integrations/pluggy` traduz o formato da Pluggy para o modelo de domínio próprio (`src/domain/finance.ts`). Trocar de agregador = escrever outro adapter.
- **Postgres é a fonte de verdade.** O módulo `sync` copia os dados do provedor para o banco a cada `SYNC_INTERVAL_HOURS` (e sob demanda em `POST /sync`). A API sempre lê do banco; se a Pluggy cair, as telas continuam funcionando com o último dado sincronizado.
- **Login com Keycloak no backend (padrão BFF).** A API faz o fluxo OIDC (Authorization Code + PKCE) com o Keycloak e guarda os tokens numa sessão do `express-session` no Postgres. O browser só recebe um cookie `httpOnly`; os tokens nunca chegam ao frontend.
- **O adapter trata o que um ORM de banco não precisa:** timeout por requisição, retry com backoff (rede, 429, 5xx, respeitando `Retry-After`), renovação automática da API key, paginação, cache em memória e validação do formato das respostas (mudança de contrato falha alto, em vez de gravar lixo).

## Estrutura

```
apps/api/                  NestJS 12 + TypeScript (ESM)
  src/auth/                login com Keycloak, sessão, guard global e CSRF
  src/domain/              modelo próprio: Conta, Transação, Fatura, Conexão
  src/integrations/        FinanceProvider + adapters (pluggy, fake) + cache
  src/database/            schema Drizzle (Postgres)
  src/sync/                sincronização provedor → Postgres
  src/accounts/            GET /connections, GET /accounts
  src/transactions/        GET /transactions, GET /invoices
  src/planning/            compromissos fixos, metas, categorias (marco de 75%)
  drizzle/                 migrations SQL
  test/                    testes e2e contra Postgres real
```

## Rodando local

Requisitos: Node 22.12+ (CI usa 24), pnpm 10 e Docker.

```bash
docker compose up -d                 # Postgres 17 (meu_caixa e meu_caixa_test) + Keycloak
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter api start:dev          # aplica as migrations e sincroniza na subida
```

Abra http://localhost:3000/auth/login e entre com `dev` / `dev` (realm `meu-caixa` importado de `docker/keycloak`). Depois do login o Keycloak volta para `FRONTEND_URL`; as rotas da API já respondem com o cookie de sessão. O console do Keycloak fica em http://localhost:8080 (`admin` / `admin`).

Com `FINANCE_PROVIDER=fake` (padrão do `.env.example`) a API sobe com dados fictícios, sem credenciais da Pluggy — útil para desenvolver a interface.

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
| `GET /auth/callback` | Troca o code por tokens, gera um novo id de sessão e volta para `FRONTEND_URL` (em caso de erro, `FRONTEND_URL?authError=login_failed`) |
| `GET /auth/logout` | Apaga a sessão e encerra o SSO no Keycloak, voltando para `FRONTEND_URL` |
| `GET /auth/me` | Usuário logado (`id`, `name`, `email`, `roles`) |

- Todas as rotas, exceto `/health` e `/auth/login|callback|logout`, exigem sessão válida e a role `KEYCLOAK_REQUIRED_ROLE` (padrão `owner`, do client ou do realm). A cada requisição o token é validado por introspecção no Keycloak e renovado com o refresh token quando está para expirar.
- Respostas: `401` sem sessão (a interface redireciona para `/auth/login`), `403` sem a role, `503` se o Keycloak estiver fora do ar.
- Requisições mutantes (`POST`, …) de uma origem diferente de `FRONTEND_URL`/`APP_URL` levam `403` (proteção CSRF por `Origin`).
- Na interface: `fetch(url, { credentials: 'include' })`. O cookie é `SameSite=Lax`, então em produção API e interface devem ficar no mesmo site — o mais simples é o Next fazer proxy de `/auth` e da API e apontar `APP_URL` para a URL pública.

## API

| Rota | O que devolve |
| --- | --- |
| `GET /health` | Status da API e do banco (pública) |
| `GET /connections` | Bancos conectados e o estado de cada conexão |
| `GET /accounts` | Contas e cartões com saldo, limite e até quando foram sincronizados |
| `GET /transactions` | Lista unificada; filtros `accountId`, `from`, `to`, `status`, `search`, `limit`, `offset` |
| `GET /invoices` | Faturas de cartão; filtro `accountId` |
| `POST /sync` | Dispara uma sincronização (202); 409 se já houver uma rodando |
| `GET /sync/runs` | Histórico das sincronizações, com contagens e erros |

Convenções: valores monetários em **centavos** (inteiros); transações negativas são saídas e positivas, entradas; datas `YYYY-MM-DD` no fuso `TIMEZONE` (padrão `America/Sao_Paulo`).

## Scripts (`apps/api`)

| Script | Para quê |
| --- | --- |
| `pnpm start:dev` | API em modo watch |
| `pnpm test` | Testes unitários |
| `pnpm test:e2e` | Testes e2e; usam `TEST_DATABASE_URL` (padrão: `meu_caixa_test` local) e apagam as tabelas |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualidade |
| `pnpm db:generate` | Gera migration a partir de mudanças em `src/database/schema.ts` |
| `pnpm db:migrate` | Aplica as migrations no `DATABASE_URL` |

## Roadmap

- [x] **25% — Fundação e dados reais:** esqueleto Nest com os módulos e a `FinanceProvider`; adapter da Pluggy (contas, transações, faturas); Postgres modelado; `sync` gravando os dados; CI (lint, build, testes). Falta validar com 1 banco real usando as suas credenciais.
- [x] **Autenticação:** login com Keycloak (OIDC + PKCE) e sessão `express-session` no Postgres.
- [ ] **50% — Interface completa, mocada:** telas em Next.js + shadcn/ui (visão geral, contas, transações, planejamento, análise).
- [ ] **75% — Interface ligada no back-end:** fim do mock; módulo `planning` com compromissos fixos, metas e categorias.
- [ ] **100% — Análise via MCP e deploy:** MCP expondo os dados para o Claude; deploy na DigitalOcean.
