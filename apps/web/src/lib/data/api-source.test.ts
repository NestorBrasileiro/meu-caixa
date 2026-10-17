import { describe, expect, it, vi } from "vitest"
import type { Page } from "@/lib/api/types"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/server", () => ({ connection: vi.fn() }))

const { collectPages } = await import("./api-source")

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
