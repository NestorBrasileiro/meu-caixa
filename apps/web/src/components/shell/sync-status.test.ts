import { describe, expect, it } from "vitest"
import type { SyncRun } from "@/lib/api/types"
import { findActiveRun, isInterruptedRun, summarizeSync, syncIndicatorView, type SyncSummary } from "./sync-status"

const NOW = "2026-10-08T12:00:00.000Z"

const run = (id: string, status: SyncRun["status"], startedAt: string, finishedAt: string | null = null): SyncRun => ({
  id,
  provider: "fake",
  trigger: "SCHEDULED",
  status,
  startedAt,
  finishedAt: status === "RUNNING" ? null : (finishedAt ?? startedAt),
  stats: null,
  errors: [],
})

const summary = (patch: Partial<SyncSummary> = {}): SyncSummary => ({
  runningRunId: null,
  lastSyncAt: "2026-10-08T09:00:00.000Z",
  lastStatus: "SUCCEEDED",
  attention: { count: 0, critical: false },
  now: NOW,
  ...patch,
})

describe("shell/sync-status", () => {
  it("execução em andamento há mais de 30 min foi interrompida", () => {
    expect(isInterruptedRun(run("a", "RUNNING", "2026-10-08T11:40:00.000Z"), NOW)).toBe(false)
    expect(isInterruptedRun(run("a", "RUNNING", "2026-10-08T11:00:00.000Z"), NOW)).toBe(true)
    expect(isInterruptedRun(run("a", "FAILED", "2026-10-08T01:00:00.000Z"), NOW)).toBe(false)
  })

  it("acha a execução ativa ignorando as interrompidas", () => {
    const stuck = run("stuck", "RUNNING", "2026-10-07T10:00:00.000Z")
    expect(findActiveRun([stuck], NOW)).toBeNull()
    const live = run("live", "RUNNING", "2026-10-08T11:59:00.000Z")
    expect(findActiveRun([live, stuck], NOW)?.id).toBe("live")
  })

  it("resume: última com dados, como terminou a última e conexões com problema", () => {
    const runs = [
      run("r3", "RUNNING", "2026-10-08T11:59:00.000Z"),
      run("r2", "FAILED", "2026-10-08T10:00:00.000Z"),
      run("r1", "PARTIAL", "2026-10-08T06:00:00.000Z", "2026-10-08T06:01:00.000Z"),
    ]
    const result = summarizeSync(runs, [{ status: "ACTIVE" }, { status: "UPDATING" }, { status: "ACTION_REQUIRED" }], NOW)
    expect(result).toEqual({
      runningRunId: "r3",
      lastSyncAt: "2026-10-08T06:01:00.000Z",
      lastStatus: "FAILED",
      attention: { count: 1, critical: false },
      now: NOW,
    })
  })

  it("instalação nova: nada sincronizado, nada pedindo atenção", () => {
    expect(summarizeSync([], [], NOW)).toEqual({
      runningRunId: null,
      lastSyncAt: null,
      lastStatus: null,
      attention: { count: 0, critical: false },
      now: NOW,
    })
  })

  it("nunca sincronizado não é um check verde", () => {
    const view = syncIndicatorView(summary({ lastSyncAt: null, lastStatus: null }))
    expect(view).toEqual({ tone: "neutral", status: "Nunca sincronizado", attention: null, compact: "Nunca sincronizado" })
  })

  it("tudo certo: check e há quanto tempo; no celular só o ícone", () => {
    expect(syncIndicatorView(summary())).toEqual({ tone: "good", status: "Atualizado há 3 h", attention: null, compact: null })
  })

  it("rodando (no servidor ou pelo clique no browser) vence o resto", () => {
    const running = { tone: "running", status: "Sincronizando…", attention: null, compact: "Sincronizando…" }
    expect(syncIndicatorView(summary({ runningRunId: "r", lastStatus: "FAILED" }))).toEqual(running)
    expect(syncIndicatorView(summary({ lastSyncAt: null, lastStatus: null }), true)).toEqual(running)
  })

  it("última execução falhou ou foi parcial", () => {
    expect(syncIndicatorView(summary({ lastStatus: "FAILED" }))).toMatchObject({
      tone: "critical",
      status: "Falha na sincronização",
    })
    // Falhou antes de qualquer sucesso: a falha é a notícia, não o "nunca".
    expect(syncIndicatorView(summary({ lastStatus: "FAILED", lastSyncAt: null })).tone).toBe("critical")
    expect(syncIndicatorView(summary({ lastStatus: "PARTIAL" }))).toEqual({
      tone: "warning",
      status: "Atualizado há 3 h, com erros",
      attention: null,
      compact: "Atualizado com erros",
    })
  })

  it("conexões pedindo atenção sobem o tom e são o que aparece no celular", () => {
    expect(syncIndicatorView(summary({ attention: { count: 2, critical: false } }))).toEqual({
      tone: "warning",
      status: "Atualizado há 3 h",
      attention: "2 conexões pedem atenção",
      compact: "2 conexões pedem atenção",
    })
    expect(syncIndicatorView(summary({ attention: { count: 1, critical: true } })).tone).toBe("critical")
    // Uma falha (crítica) não é rebaixada por um login pendente (aviso).
    expect(syncIndicatorView(summary({ lastStatus: "FAILED", attention: { count: 1, critical: false } })).tone).toBe(
      "critical",
    )
  })
})
