import type { IsoDate, IsoDateTime } from "@/lib/api/types"

/** Onde o usuário conecta e reconecta bancos (Meu Pluggy). */
export const MEU_PLUGGY_URL = "https://meu.pluggy.ai"

/** Iniciais da instituição para o avatar: "Banco Digital Exemplo" → "BD". */
export function institutionInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** `YYYY-MM-DD` → "28/09". */
export function formatDayMonth(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/** Dias inteiros entre duas datas de calendário (`to` − `from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** Duração de uma execução em segundos (null enquanto não terminou). */
export function durationSeconds(startedAt: IsoDateTime, finishedAt: IsoDateTime | null): number | null {
  if (!finishedAt) return null
  return Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000))
}

/** "< 1 s", "41 s", "2 min 05 s" */
export function formatDuration(seconds: number): string {
  if (seconds < 1) return "< 1 s"
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`
}

/** Plural simples em pt-BR: plural(3, "conta", "contas") → "3 contas". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : pluralForm}`
}
