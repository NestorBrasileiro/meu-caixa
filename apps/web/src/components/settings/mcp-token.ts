/** Nome do servidor no Claude Code (o mesmo do README). */
export const MCP_SERVER_NAME = "meu-caixa"

/** Comando que conecta o Claude Code ao servidor MCP com o token pessoal. */
export function claudeMcpAddCommand(url: string, token: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`
}
