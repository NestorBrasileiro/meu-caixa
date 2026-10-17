import { describe, expect, it } from "vitest"
import type { SyncRun } from "@/lib/api/types"
import { abandonsRun, pollStep, runNotice, syncRequestErrorMessage, trackNotice } from "./sync-run"

const run = (id: string, status: SyncRun["status"], patch: Partial<SyncRun> = {}): SyncRun => ({
  id,
  provider: "fake",
  trigger: "MANUAL",
  status,
  startedAt: "2026-10-08T12:00:00.000Z",
  finishedAt: status === "RUNNING" ? null : "2026-10-08T12:00:02.000Z",
  stats:
    status === "RUNNING"
      ? null
      : { connections: 2, accounts: 3, transactions: 345, removedPendingTransactions: 0, invoices: 7 },
  errors: [],
  ...patch,
})

describe("shell/sync-run", () => {
  describe("pollStep", () => {
    it("espera enquanto a execução acompanhada roda e termina quando ela termina", () => {
      expect(pollStep([run("a", "RUNNING")], "a")).toEqual({ done: false, runId: "a" })
      const finished = run("a", "SUCCEEDED")
      expect(pollStep([run("b", "RUNNING"), finished], "a")).toEqual({ done: true, run: finished })
    })

    it("continua esperando se a execução ainda não aparece na lista", () => {
      expect(pollStep([run("x", "SUCCEEDED")], "a")).toEqual({ done: false, runId: "a" })
    })

    it("depois de um 409, adota a execução que está rodando", () => {
      expect(pollStep([run("b", "RUNNING"), run("a", "SUCCEEDED")], null)).toEqual({ done: false, runId: "b" })
    })

    it("depois de um 409, se ela já terminou, o resultado é o da mais recente", () => {
      const latest = run("b", "PARTIAL")
      expect(pollStep([latest, run("a", "SUCCEEDED")], null)).toEqual({ done: true, run: latest })
      expect(pollStep([], null)).toEqual({ done: false, runId: null })
    })

    it("depois de um 409, só a mais recente conta: uma em andamento mais antiga ficou para trás", () => {
      // A API caiu no meio de "old"; "new" já terminou depois dela. Não há nada rodando.
      const latest = run("new", "SUCCEEDED")
      expect(pollStep([latest, run("old", "RUNNING")], null)).toEqual({ done: true, run: latest })
    })
  })

  describe("abandonsRun", () => {
    it("qualquer fim sem ver a execução terminar abandona a execução", () => {
      expect(abandonsRun({ kind: "timeout" })).toBe(true)
      expect(abandonsRun({ kind: "error", message: "Sem conexão" })).toBe(true)
      expect(abandonsRun({ kind: "unauthorized" })).toBe(true)
      expect(abandonsRun({ kind: "finished", run: run("a", "SUCCEEDED") })).toBe(false)
    })
  })

  describe("avisos", () => {
    it("concluída: quantas transações vieram", () => {
      expect(runNotice(run("a", "SUCCEEDED"))).toEqual({
        tone: "success",
        title: "Sincronização concluída",
        description: "345 transações atualizadas.",
      })
      const one = run("a", "SUCCEEDED", {
        stats: { connections: 1, accounts: 1, transactions: 1, removedPendingTransactions: 0, invoices: 0 },
      })
      expect(runNotice(one).description).toBe("1 transação atualizada.")
      expect(runNotice(run("a", "SUCCEEDED", { stats: null })).description).toBe("Contas e saldos atualizados.")
    })

    it("parcial: quantos erros e o primeiro", () => {
      const partial = run("a", "PARTIAL", { errors: ['Faturas de "Cartão": tempo esgotado', "outro"] })
      expect(runNotice(partial)).toEqual({
        tone: "warning",
        title: "Sincronização parcial",
        description: '2 erros: Faturas de "Cartão": tempo esgotado',
      })
    })

    it("falhou: o primeiro erro, cortado se for longo", () => {
      expect(runNotice(run("a", "FAILED", { errors: ["Pluggy fora do ar"] }))).toEqual({
        tone: "error",
        title: "A sincronização falhou",
        description: "Pluggy fora do ar",
      })
      const long = runNotice(run("a", "FAILED", { errors: ["x".repeat(400)] })).description
      expect(long).toHaveLength(160)
      expect(long.endsWith("…")).toBe(true)
      expect(runNotice(run("a", "FAILED")).description).toBe("O banco não informou o motivo.")
    })

    it("tempo esgotado e erro de consulta têm aviso; sessão expirada não", () => {
      expect(trackNotice({ kind: "timeout" })?.tone).toBe("info")
      expect(trackNotice({ kind: "error", message: "Sem conexão" })).toMatchObject({ tone: "error", description: "Sem conexão" })
      expect(trackNotice({ kind: "unauthorized" })).toBeNull()
    })
  })

  describe("syncRequestErrorMessage", () => {
    it("usa a mensagem da API quando ela diz algo", () => {
      expect(syncRequestErrorMessage({ status: 400, message: "Provedor não configurado" })).toBe("Provedor não configurado")
      expect(syncRequestErrorMessage({ status: 404, message: "Erro 404" })).toBe("A API recusou o pedido (erro 404).")
    })

    it("frases nossas para 5xx e falta de rede", () => {
      expect(syncRequestErrorMessage({ status: 502, message: "Bad Gateway" })).toMatch(/não respondeu/)
      expect(syncRequestErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem conexão com a API/)
    })
  })
})
