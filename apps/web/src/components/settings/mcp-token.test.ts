import { describe, expect, it } from "vitest"
import { claudeMcpAddCommand } from "./mcp-token"

describe("claudeMcpAddCommand", () => {
  it("monta o comando do Claude Code com a URL e o token no header", () => {
    expect(claudeMcpAddCommand("https://caixa.example.com/mcp", "mcx_abc")).toBe(
      'claude mcp add --transport http meu-caixa https://caixa.example.com/mcp --header "Authorization: Bearer mcx_abc"',
    )
  })
})
