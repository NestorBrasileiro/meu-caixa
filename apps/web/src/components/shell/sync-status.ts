import type { Connection, IsoDateTime, SyncRun } from "@/lib/api/types"
import { formatRelative } from "@/lib/format/date"

/**
 * Regras da sincronização que valem para o cabeçalho e para a tela de contas.
 * Módulo puro (sem React, sem relógio): o "agora" sempre chega de fora.
 */

/**
 * Execução "em andamento" há mais que isso não está mais rodando: a API caiu no meio e a linha ficou
 * para trás. Uma sincronização de verdade leva segundos (minutos, no pior caso).
 */
export const STALE_RUN_MS = 30 * 60 * 1000

/** Em andamento, mas velha demais para ainda estar rodando. */
export function isInterruptedRun(run: Pick<SyncRun, "status" | "startedAt">, now: IsoDateTime): boolean {
  return run.status === "RUNNING" && Date.parse(now) - Date.parse(run.startedAt) > STALE_RUN_MS
}

/**
 * A execução que está rodando agora. Só a mais recente (`runs[0]`, a API devolve as mais novas primeiro)
 * conta: uma em andamento mais antiga, com outra mais nova já iniciada, ficou para trás (a API caiu no
 * meio). Se a mais recente terminou ou foi interrompida, não há nenhuma rodando.
 */
export function findActiveRun(runs: SyncRun[], now: IsoDateTime): SyncRun | null {
  const [latest] = runs
  return latest && latest.status === "RUNNING" && !isInterruptedRun(latest, now) ? latest : null
}

/** A execução rodando, a menos que a tela já tenha desistido de acompanhá-la (ver `abandonsRun`). */
export function liveRunId(runId: string | null, abandoned: ReadonlySet<string>): string | null {
  return runId !== null && !abandoned.has(runId) ? runId : null
}

/** Conexões que pedem ação do usuário: login de novo ou erro no banco. "Atualizando" não conta. */
export function needsAttention(connection: Pick<Connection, "status">): boolean {
  return connection.status === "ACTION_REQUIRED" || connection.status === "ERROR"
}

/** O que o cabeçalho precisa saber (serializável: vai do servidor para o componente do cliente). */
export interface SyncSummary {
  /** Execução rodando agora, se houver. */
  runningRunId: string | null
  /** Fim da última execução que trouxe dados (concluída ou parcial). */
  lastSyncAt: IsoDateTime | null
  /** Como terminou a última execução (null: nenhuma terminou ainda). */
  lastStatus: "SUCCEEDED" | "PARTIAL" | "FAILED" | null
  /** Conexões que pedem atenção; `critical` quando alguma está com erro. */
  attention: { count: number; critical: boolean }
  /** Referência para "há 3 h". */
  now: IsoDateTime
}

/** Resume as execuções (mais recentes primeiro, como a API devolve) e as conexões. */
export function summarizeSync(runs: SyncRun[], connections: Pick<Connection, "status">[], now: IsoDateTime): SyncSummary {
  const finished = runs.filter((run) => run.status !== "RUNNING")
  const lastWithData = finished.find((run) => run.status === "SUCCEEDED" || run.status === "PARTIAL")
  const problems = connections.filter(needsAttention)
  return {
    runningRunId: findActiveRun(runs, now)?.id ?? null,
    lastSyncAt: lastWithData?.finishedAt ?? null,
    lastStatus: (finished[0]?.status as SyncSummary["lastStatus"] | undefined) ?? null,
    attention: { count: problems.length, critical: problems.some((c) => c.status === "ERROR") },
    now,
  }
}

/** Tom do indicador: define o ícone (a cor nunca vai sozinha, sempre com texto). */
export type SyncTone = "running" | "good" | "neutral" | "warning" | "critical"

const SEVERITY: Record<SyncTone, number> = { running: 0, good: 0, neutral: 1, warning: 2, critical: 3 }

export interface SyncIndicatorView {
  tone: SyncTone
  /** Situação da sincronização: "Atualizado há 3 h", "Nunca sincronizado"… */
  status: string
  /** Aviso das conexões, quando há: "1 conexão pede atenção". */
  attention: string | null
  /** O que aparece no celular, onde cabe pouco. null: só o ícone (o texto completo fica para leitores de tela). */
  compact: string | null
}

export function attentionLabel(count: number): string {
  return count === 1 ? "1 conexão pede atenção" : `${count} conexões pedem atenção`
}

/**
 * Indicador do cabeçalho. `busy`: o próprio browser está sincronizando (clicou em "Sincronizar agora"
 * ou está acompanhando uma execução), antes de o servidor saber.
 */
export function syncIndicatorView(summary: SyncSummary, busy = false): SyncIndicatorView {
  if (busy || summary.runningRunId) {
    return { tone: "running", status: "Sincronizando…", attention: null, compact: "Sincronizando…" }
  }

  const when = summary.lastSyncAt ? formatRelative(summary.lastSyncAt, summary.now) : null
  let primary: { tone: SyncTone; status: string; compact: string | null }
  if (summary.lastStatus === "FAILED") {
    primary = { tone: "critical", status: "Falha na sincronização", compact: "Falha na sincronização" }
  } else if (when === null) {
    primary = { tone: "neutral", status: "Nunca sincronizado", compact: "Nunca sincronizado" }
  } else if (summary.lastStatus === "PARTIAL") {
    primary = { tone: "warning", status: `Atualizado ${when}, com erros`, compact: "Atualizado com erros" }
  } else {
    primary = { tone: "good", status: `Atualizado ${when}`, compact: null }
  }

  if (summary.attention.count === 0) return { ...primary, attention: null }
  const attentionTone: SyncTone = summary.attention.critical ? "critical" : "warning"
  const attention = attentionLabel(summary.attention.count)
  return {
    tone: SEVERITY[attentionTone] > SEVERITY[primary.tone] ? attentionTone : primary.tone,
    status: primary.status,
    attention,
    compact: attention,
  }
}
