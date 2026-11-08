import { describe, expect, it, vi } from "vitest"
import { ExportError, fetchExportFile, fetchExportText, requestExport, type ExportDeps } from "./download"

const PATH = "/api/export?format=xlsx&from=2026-08-01&to=2026-10-23&sections=resumo"

function deps(response: Response | Error): ExportDeps & { fetch: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  return { fetch: fetchMock as never, onUnauthorized: vi.fn() } as never
}

describe("requestExport", () => {
  it("pede na mesma origem, com o cookie", async () => {
    const d = deps(new Response("ok"))
    await requestExport(PATH, d)
    expect(d.fetch).toHaveBeenCalledWith(PATH, expect.objectContaining({ credentials: "same-origin", method: "GET" }))
  })

  it("401 leva ao login", async () => {
    const d = deps(new Response(null, { status: 401 }))
    await expect(requestExport(PATH, d)).rejects.toMatchObject({ status: 401 })
    expect(d.onUnauthorized).toHaveBeenCalledOnce()
  })

  it("400 traz a mensagem da API", async () => {
    const d = deps(new Response(JSON.stringify({ message: "O período pode ter no máximo 24 meses." }), { status: 400 }))
    await expect(requestExport(PATH, d)).rejects.toEqual(new ExportError(400, "O período pode ter no máximo 24 meses."))
    expect(d.onUnauthorized).not.toHaveBeenCalled()
  })

  it("5xx sem corpo e falha de rede viram mensagens claras", async () => {
    await expect(requestExport(PATH, deps(new Response("", { status: 502 })))).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("erro 502"),
    })
    await expect(requestExport(PATH, deps(new TypeError("Failed to fetch")))).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Sem resposta do servidor"),
    })
  })
})

describe("fetchExportFile / fetchExportText", () => {
  it("nome do Content-Disposition", async () => {
    const response = new Response("conteúdo", {
      headers: { "content-disposition": 'attachment; filename="meu-caixa-2026-10.xlsx"' },
    })
    const file = await fetchExportFile(PATH, "meu-caixa.xlsx", deps(response))
    expect(file.filename).toBe("meu-caixa-2026-10.xlsx")
    expect(await file.blob.text()).toBe("conteúdo")
  })

  it("sem cabeçalho: o nome de reserva", async () => {
    const file = await fetchExportFile(PATH, "meu-caixa.zip", deps(new Response("zip")))
    expect(file.filename).toBe("meu-caixa.zip")
  })

  it("o Markdown como texto", async () => {
    expect(await fetchExportText(PATH, deps(new Response("# Meu Caixa\n")))).toBe("# Meu Caixa\n")
  })
})
