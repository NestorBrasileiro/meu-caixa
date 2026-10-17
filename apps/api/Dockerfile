# syntax=docker/dockerfile:1
#
# Imagem de produção da API (NestJS). O contexto de build é a RAIZ do
# repositório, por causa do pnpm-lock.yaml do workspace:
#
#   docker build -f apps/api/Dockerfile -t meu-caixa-api .
#
# NODE_IMAGE permite fixar um digest (ex.: node:24-alpine@sha256:...).
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Versão do pnpm vem do campo packageManager do package.json da raiz.
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN corepack install \
 && pnpm install --frozen-lockfile --filter api...
COPY apps/api apps/api
RUN pnpm --filter api build \
 # Só as dependências de produção, numa pasta autocontida (sem symlinks para o
 # workspace). --legacy: a API não depende de outros pacotes do workspace.
 && pnpm --filter api deploy --prod --legacy /out

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Só o necessário: dependências de produção, o build e as migrations SQL.
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
# Usuário sem privilégios que já existe na imagem oficial do Node.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# As migrations rodam na subida quando DATABASE_MIGRATE_ON_START=true.
CMD ["node", "dist/main.js"]
