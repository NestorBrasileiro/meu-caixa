import { notFound, redirect } from "next/navigation"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadOrNull } from "./fail-soft"

describe("shell/fail-soft", () => {
  afterEach(() => vi.restoreAllMocks())

  it("devolve o valor quando carrega", async () => {
    expect(await loadOrNull("teste", async () => 42)).toBe(42)
  })

  it("API fora do ar ou 5xx: null em vez de derrubar a página", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await loadOrNull("o menu", () => Promise.reject(new TypeError("fetch failed")))).toBeNull()
    expect(await loadOrNull("o menu", () => Promise.reject(new Error("API respondeu 503 em /auth/me")))).toBeNull()
    expect(log).toHaveBeenCalledTimes(2)
  })

  it("redirect (401 → login) e notFound do Next continuam subindo", async () => {
    await expect(loadOrNull("o menu", async () => redirect("/auth/login"))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    })
    await expect(loadOrNull("o menu", async () => notFound())).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK"),
    })
  })
})
