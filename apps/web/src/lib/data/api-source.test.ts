import { afterEach, describe, expect, it, vi } from "vitest"
import type { Page } from "@/lib/api/types"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/server", () => ({ connection: vi.fn() }))

const { ApiError, collectPages, getAnalysis, getAnalysisStatus } = await import("./api-source")
const { cookies } = await import("next/headers")

type Row = { id: string }

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id }))

/** Fonte paginada por offset sobre uma lista que pode mudar entre uma página e outra. */
function pagedSource(snapshots: Row[][], pageSize: number) {
  let call = 0
  return async (offset: number): Promise<Page<Row>> => {
    const all = snapshots[Math.min(call++, snapshots.length - 1)]
    return { items: all.slice(offset, offset + pageSize), total: all.length, limit: pageSize, offset }
  }
}

describe("lib/data/api-source — collectPages", () => {
  it("junta todas as páginas, na ordem da API", async () => {
    const all = rows("e", "d", "c", "b", "a")
    expect(await collectPages(pagedSource([all], 2), 2)).toEqual(all)
  })

  it("sincronização inserindo no meio da leitura não repete transações", async () => {
    // Depois da 1ª página, chegam duas transações novas no topo: "d" e "c" escorregam para a 2ª página.
    const before = rows("d", "c", "b", "a")
    const after = rows("f", "e", "d", "c", "b", "a")
    const result = await collectPages(pagedSource([before, after], 2), 2)
    expect(result.map((row) => row.id)).toEqual(["d", "c", "b", "a"])
    expect(new Set(result.map((row) => row.id)).size).toBe(result.length)
  })

  it("lista vazia: uma consulta só", async () => {
    const fetchPage = vi.fn(pagedSource([[]], 2))
    expect(await collectPages(fetchPage, 2)).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})

describe("lib/data/api-source — análise", () => {
  vi.mocked(cookies).mockResolvedValue({ toString: () => "connect.sid=abc" } as never)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function respond(status: number, body: unknown = null) {
    const fetchMock = vi.fn(async () => new Response(body === null ? null : JSON.stringify(body), { status }))
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("404 em /api/analysis/latest: ainda não há análise (null, não erro)", async () => {
    const fetchMock = respond(404, { message: "Nenhuma análise" })
    expect(await getAnalysis()).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/analysis\/latest$/),
      expect.objectContaining({ headers: expect.objectContaining({ cookie: "connect.sid=abc" }) }),
    )
  })

  it("relatório da API é real (sample: false), com origem e modelo", async () => {
    respond(200, { id: "r1", source: "APP", model: "claude-sonnet-4-5", insights: [] })
    expect(await getAnalysis()).toMatchObject({ id: "r1", source: "APP", model: "claude-sonnet-4-5", sample: false })
  })

  it("outros erros sobem (a página mostra o erro)", async () => {
    respond(500)
    await expect(getAnalysis()).rejects.toBeInstanceOf(ApiError)
  })

  it("status", async () => {
    const status = { app: { enabled: true, model: "claude-sonnet-4-5" }, latestRun: null }
    const fetchMock = respond(200, status)
    expect(await getAnalysisStatus()).toEqual(status)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/analysis\/status$/), expect.anything())
  })
})
