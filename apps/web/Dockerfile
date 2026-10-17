# syntax=docker/dockerfile:1
#
# Imagem de produção da interface (Next.js, output "standalone"). O contexto de
# build é a RAIZ do repositório, por causa do pnpm-lock.yaml do workspace:
#
#   docker build -f apps/web/Dockerfile -t meu-caixa-web .
#
# API_URL entra em DOIS lugares, e só um deles é lido em tempo de execução:
#  - o proxy de /api/* e /auth/* (rewrites do next.config.ts) é calculado no
#    `next build` e fica gravado no build -> precisa vir como build arg;
#  - as telas (Server Components) leem process.env.API_URL a cada requisição.
# Por isso o padrão é o endereço interno da rede do Docker Compose
# (http://api:3000) nos dois. Se a API estiver em outro endereço, reconstrua a
# imagem com --build-arg API_URL=... e defina a mesma API_URL no container.
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
# Versão do pnpm vem do campo packageManager do package.json da raiz.
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN corepack install \
 && pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
ARG API_URL=http://api:3000
ENV API_URL=${API_URL}
RUN pnpm --filter web build

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG API_URL=http://api:3000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # Sem isso o server.js escuta no hostname do container, não em todas as interfaces.
    HOSTNAME=0.0.0.0 \
    API_URL=${API_URL} \
    DATA_SOURCE=api
WORKDIR /app
# O standalone reproduz a estrutura do monorepo: o servidor fica em apps/web/server.js.
# Estáticos (.next/static) e public/ não vão para o standalone; copiados à parte.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# O Next grava o cache de páginas/imagens em .next/cache: única pasta gravável.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
# /sem-acesso não depende da API nem do login: mede só o servidor do Next.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/sem-acesso',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
