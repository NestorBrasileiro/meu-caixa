import { describe, expect, it } from "vitest"
import { mcpReachabilityNote, mcpUrl } from "./mcp"

describe("analysis/mcp", () => {
  it("URL do servidor a partir da origem da interface", () => {
    expect(mcpUrl("https://caixa.exemplo.com")).toBe("https://caixa.exemplo.com/mcp")
    expect(mcpUrl("https://caixa.exemplo.com/")).toBe("https://caixa.exemplo.com/mcp")
  })

  it("endereço local ou sem HTTPS: avisa que o claude.ai não alcança", () => {
    expect(mcpReachabilityNote("http://localhost:3001")).toMatch(/Claude Code/)
    expect(mcpReachabilityNote("http://127.0.0.1:3001")).toMatch(/local/)
    expect(mcpReachabilityNote("http://192.168.0.10:3001")).toMatch(/local/)
    expect(mcpReachabilityNote("http://caixa.exemplo.com")).toMatch(/HTTPS/)
  })

  it("domínio público com HTTPS: nada a avisar", () => {
    expect(mcpReachabilityNote("https://caixa.exemplo.com")).toBeNull()
    expect(mcpReachabilityNote("https://172.217.0.1")).toBeNull()
  })
})
