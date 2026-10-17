/**
 * Conectar o Claude do usuário ao servidor MCP. O Next faz proxy de `/mcp` para a API, então a URL
 * é a própria origem da interface (calculada no browser: atrás de proxy, o servidor não sabe o
 * domínio público).
 */

export const MCP_PATH = "/mcp"
/** Client público do Keycloak para os conectores do Claude (ver README, "Client claude"). */
export const MCP_OAUTH_CLIENT_ID = "claude"
/** O que pedir ao Claude depois de conectar. */
export const MCP_PROMPT = "Analise minhas finanças e salve o relatório"

export function mcpUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${MCP_PATH}`
}

/**
 * Aviso quando o claude.ai não vai alcançar a URL: ele conecta a partir dos servidores da Anthropic,
 * então só endereços públicos com HTTPS funcionam. Localmente, o Claude Code conecta.
 */
export function mcpReachabilityNote(origin: string): string | null {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }
  const host = url.hostname
  const local =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (local) {
    return "Este endereço é local: o claude.ai não o alcança. Para testar aqui, conecte pelo Claude Code (veja o README); em produção, use o domínio público com HTTPS."
  }
  if (url.protocol !== "https:") return "O claude.ai só conecta em endereços com HTTPS."
  return null
}
