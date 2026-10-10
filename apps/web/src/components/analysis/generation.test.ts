import { describe, expect, it } from "vitest"
import type { AnalysisRun } from "@/lib/api/analysis"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import {
  appAvailability,
  generateButton,
  generationReducer,
  IDLE,
  initialGeneration,
  MAX_POLL_FAILURES,
  NOT_CONFIGURED_HINT,
  STATUS_UNKNOWN_HINT,
  type GenerationEvent,
  type GenerationState,
} from "./generation"

const NOW = "2026-10-10T15:00:00.000Z"

const run = (patch: Partial<AnalysisRun> = {}): AnalysisRun => ({
  id: "run-1",
  status: "RUNNING",
  startedAt: "2026-10-10T14:58:00.000Z",
  finishedAt: null,
  error: null,
  reportId: null,
  model: "claude-sonnet-4-5",
  ...patch,
})

const reduce = (state: GenerationState, ...events: GenerationEvent[]) => events.reduce(generationReducer, state)
const running = reduce(IDLE, { type: "start" }, { type: "started", run: run() })

describe("analysis/generation — disponibilidade", () => {
  const status = (enabled: boolean) => ({ app: { enabled, model: enabled ? "claude-sonnet-4-5" : null }, latestRun: null })

  it("mock (somente leitura) vence tudo, mesmo com a chave configurada", () => {
    expect(appAvailability(status(true), false)).toEqual({ kind: "readOnly" })
  })

  it("sem ANTHROPIC_API_KEY, com chave, e status que não respondeu", () => {
    expect(appAvailability(status(false), true)).toEqual({ kind: "notConfigured" })
    expect(appAvailability(status(true), true)).toEqual({ kind: "ready", model: "claude-sonnet-4-5" })
    expect(appAvailability(null, true)).toEqual({ kind: "unknown" })
  })
})

describe("analysis/generation — botão", () => {
  it("rótulo depende de já haver relatório", () => {
    expect(generateButton({ kind: "ready", model: null }, IDLE, false)).toEqual({
      label: "Gerar análise",
      busy: false,
      hint: null,
    })
    expect(generateButton({ kind: "ready", model: null }, IDLE, true).label).toBe("Gerar nova análise")
  })

  it("indisponível explica o porquê no tooltip; sem chave, aponta o MCP", () => {
    expect(generateButton({ kind: "readOnly" }, IDLE, true).hint).toBe(READ_ONLY_HINT)
    expect(generateButton({ kind: "notConfigured" }, IDLE, true).hint).toBe(NOT_CONFIGURED_HINT)
    expect(NOT_CONFIGURED_HINT).toMatch(/ANTHROPIC_API_KEY/)
    expect(NOT_CONFIGURED_HINT).toMatch(/MCP/)
    expect(generateButton({ kind: "unknown" }, IDLE, true).hint).toBe(STATUS_UNKNOWN_HINT)
  })

  it("gerando: ocupado, sem dica", () => {
    expect(generateButton({ kind: "ready", model: null }, running, true)).toEqual({
      label: "Analisando…",
      busy: true,
      hint: null,
    })
    expect(generateButton({ kind: "ready", model: null }, { phase: "starting" }, false).busy).toBe(true)
  })
})

describe("analysis/generation — acompanhamento", () => {
  it("POST 202 → acompanha a execução", () => {
    expect(running).toEqual({ phase: "running", runId: "run-1", startedAt: run().startedAt, failures: 0 })
  })

  it("clique duplo não dispara outra geração", () => {
    expect(generationReducer(running, { type: "start" })).toBe(running)
    const starting = generationReducer(IDLE, { type: "start" })
    expect(generationReducer(starting, { type: "start" })).toBe(starting)
  })

  it("409: segue a execução que já estava rodando (status.latestRun)", () => {
    const adopted = reduce(IDLE, { type: "start" }, { type: "adopted", run: run({ id: "run-0" }) })
    expect(adopted).toMatchObject({ phase: "running", runId: "run-0" })
  })

  it("409 e a outra terminou nesse meio-tempo: usa o resultado dela", () => {
    const done = reduce(IDLE, { type: "start" }, { type: "adopted", run: run({ status: "SUCCEEDED" }) })
    expect(done).toEqual({ phase: "refreshing", runId: "run-1" })
    const failed = reduce(IDLE, { type: "start" }, { type: "adopted", run: run({ status: "FAILED", error: "Sem saldo." }) })
    expect(failed).toMatchObject({ phase: "idle", notice: { tone: "error", message: "Sem saldo." } })
    const gone = reduce(IDLE, { type: "start" }, { type: "adopted", run: null })
    expect(gone).toMatchObject({ phase: "idle", notice: { tone: "error" } })
  })

  it("503/erro ao iniciar: volta ao início com a mensagem da API", () => {
    const state = reduce(IDLE, { type: "start" }, { type: "startFailed", message: "ANTHROPIC_API_KEY não configurada." })
    expect(state).toEqual({
      phase: "idle",
      notice: { tone: "error", title: "Não foi possível gerar a análise", message: "ANTHROPIC_API_KEY não configurada." },
    })
  })

  it("RUNNING continua; SUCCEEDED atualiza a tela; depois volta ao início", () => {
    const still = generationReducer(running, { type: "polled", run: run() })
    expect(still).toMatchObject({ phase: "running", runId: "run-1" })
    expect(still).not.toBe(running) // estado novo: o efeito agenda a próxima consulta
    const refreshing = generationReducer(still, { type: "polled", run: run({ status: "SUCCEEDED", reportId: "r1" }) })
    expect(refreshing).toEqual({ phase: "refreshing", runId: "run-1" })
    expect(generationReducer(refreshing, { type: "refreshed" })).toEqual(IDLE)
  })

  it("FAILED mostra o erro da execução (ou um texto nosso quando ela não diz)", () => {
    const failed = generationReducer(running, { type: "polled", run: run({ status: "FAILED", error: "Limite da API." }) })
    expect(failed).toEqual({
      phase: "idle",
      notice: { tone: "error", title: "A análise não foi concluída", message: "Limite da API." },
    })
    const silent = generationReducer(running, { type: "polled", run: run({ status: "FAILED", error: null }) })
    expect(silent).toMatchObject({ notice: { message: expect.stringMatching(/não informou/) } })
  })

  it("resposta atrasada de outra execução é ignorada", () => {
    expect(generationReducer(running, { type: "polled", run: run({ id: "outra", status: "SUCCEEDED" }) })).toBe(running)
    expect(generationReducer(IDLE, { type: "polled", run: run({ status: "SUCCEEDED" }) })).toBe(IDLE)
  })

  it("falhas seguidas ao consultar: tolera algumas, depois desiste avisando", () => {
    let state = running
    for (let i = 1; i < MAX_POLL_FAILURES; i++) {
      state = generationReducer(state, { type: "pollFailed", message: "Sem conexão." })
      expect(state).toMatchObject({ phase: "running", failures: i })
    }
    // Uma consulta boa zera a contagem.
    expect(generationReducer(state, { type: "polled", run: run() })).toMatchObject({ failures: 0 })
    state = generationReducer(state, { type: "pollFailed", message: "Sem conexão." })
    expect(state).toMatchObject({
      phase: "idle",
      notice: { title: "Não foi possível acompanhar a análise", message: expect.stringMatching(/^Sem conexão\. /) },
    })
  })

  it("execução sumiu (404) e tempo esgotado", () => {
    expect(generationReducer(running, { type: "lost" })).toMatchObject({ phase: "idle", notice: { tone: "error" } })
    expect(generationReducer(running, { type: "timedOut" })).toMatchObject({
      phase: "idle",
      notice: { tone: "info", message: expect.stringMatching(/segundo plano/) },
    })
  })

  it("fechar o aviso", () => {
    const failed = generationReducer(running, { type: "lost" })
    expect(generationReducer(failed, { type: "dismiss" })).toEqual(IDLE)
    expect(generationReducer(running, { type: "dismiss" })).toBe(running)
  })
})

describe("analysis/generation — estado ao abrir a tela", () => {
  it("sem execução: parado", () => {
    expect(initialGeneration(null, null, NOW)).toEqual(IDLE)
  })

  it("execução rodando: a tela já abre acompanhando", () => {
    expect(initialGeneration(run(), null, NOW)).toEqual({
      phase: "running",
      runId: "run-1",
      startedAt: run().startedAt,
      failures: 0,
    })
  })

  it("'rodando' há mais de uma hora ficou para trás: não espera por ela", () => {
    expect(initialGeneration(run({ startedAt: "2026-10-10T13:30:00.000Z" }), null, NOW)).toEqual(IDLE)
  })

  it("falha recente e mais nova que o relatório: avisa", () => {
    const failed = run({ status: "FAILED", finishedAt: "2026-10-10T14:59:00.000Z", error: "Tempo esgotado." })
    expect(initialGeneration(failed, "2026-10-09T10:00:00.000Z", NOW)).toEqual({
      phase: "idle",
      notice: { tone: "error", title: "A última análise pedida falhou", message: "Tempo esgotado." },
    })
    expect(initialGeneration(failed, null, NOW)).toMatchObject({ notice: { tone: "error" } })
  })

  it("falha antiga, ou anterior ao relatório mostrado: não avisa", () => {
    const old = run({ status: "FAILED", startedAt: "2026-10-08T10:00:00.000Z", finishedAt: "2026-10-08T10:03:00.000Z" })
    expect(initialGeneration(old, null, NOW)).toEqual(IDLE)
    const beforeReport = run({ status: "FAILED", finishedAt: "2026-10-10T14:59:00.000Z" })
    expect(initialGeneration(beforeReport, "2026-10-10T14:59:30.000Z", NOW)).toEqual(IDLE)
  })

  it("sucesso: nada a dizer (o relatório já está na tela)", () => {
    expect(initialGeneration(run({ status: "SUCCEEDED", finishedAt: NOW }), NOW, NOW)).toEqual(IDLE)
  })
})
