import type { NextConfig } from "next"

/** Onde a API (apps/api) responde, visto do servidor do Next. */
const API_URL = process.env.API_URL ?? "http://localhost:3000"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /**
   * O browser fala só com o Next: `/api/*` (dados) e `/auth/*` (login com
   * Keycloak) seguem para a API. Assim o cookie de sessão é do mesmo site e o
   * callback do login volta por aqui.
   */
  /** Falha no callback do login: a API volta com `?authError`; mostra o erro em vez de tentar de novo. */
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "authError" }],
        destination: "/erro-login",
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/auth/:path*", destination: `${API_URL}/auth/:path*` },
    ]
  },
}

export default nextConfig
