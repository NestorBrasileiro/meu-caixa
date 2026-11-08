import type { ExportFormat, ExportFormatId, ExportSection } from "@/lib/api/export"
import type { Period } from "./period"

/** Pedido da exportação: a URL, o nome do arquivo e as mensagens de erro. */

export interface ExportRequest {
  format: ExportFormatId
  period: Period
  /** Ids escolhidos, em qualquer ordem. */
  sections: string[]
}

/**
 * `/api/export?format=…&from=…&to=…&sections=a,b` (pelo proxy do Next, na mesma origem). As seções
 * vão na ordem do catálogo, não na dos cliques, e a vírgula fica literal, como no contrato.
 */
export function buildExportPath(request: ExportRequest, catalog: Pick<ExportSection, "id">[]): string {
  const chosen = new Set(request.sections)
  const ordered = catalog.map((section) => section.id).filter((id) => chosen.has(id))
  const params = [
    ["format", request.format],
    ["from", request.period.from],
    ["to", request.period.to],
  ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
  params.push(`sections=${ordered.map(encodeURIComponent).join(",")}`)
  return `/api/export?${params.join("&")}`
}

/** Extensão sem o ponto; o CSV vem num .zip. */
const EXTENSIONS: Record<ExportFormatId, string> = { xlsx: "xlsx", pdf: "pdf", csv: "zip", md: "md" }

export function fallbackFilename(format: Pick<ExportFormat, "id"> & Partial<Pick<ExportFormat, "extension">>): string {
  const extension = format.extension?.trim().replace(/^\.+/, "") || EXTENSIONS[format.id]
  return `meu-caixa.${extension}`
}

/**
 * Tira pastas e caracteres de controle (o nome vem do servidor, mas vira nome de arquivo aqui) e os
 * acentos: com "relatório.xlsx" no `<a download>`, há navegador que ignora o nome e salva como
 * "download", sem extensão.
 */
function cleanFilename(name: string): string | null {
  const base = name
    .split(/[/\\]/)
    .pop()!
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
  return base && base !== "." && base !== ".." ? base : null
}

/**
 * Nome do arquivo de um `Content-Disposition`. Prefere `filename*` (RFC 5987, UTF-8 com acentos) e
 * cai para `filename` (entre aspas ou não). Null quando o cabeçalho não traz nome.
 */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null

  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header)
  if (extended) {
    const charset = extended[1].trim().toLowerCase()
    const raw = extended[2].trim().replace(/^"(.*)"$/, "$1")
    try {
      const decoded =
        charset === "utf-8" || charset === ""
          ? decodeURIComponent(raw)
          : // ISO-8859-1: cada %XX é um byte = um caractere.
            raw.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      const name = cleanFilename(decoded)
      if (name) return name
    } catch {
      // Codificação inválida: tenta o `filename` simples.
    }
  }

  const quoted = /(?:^|;)\s*filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)
  if (quoted) return cleanFilename(quoted[1].replace(/\\(.)/g, "$1"))
  const token = /(?:^|;)\s*filename\s*=\s*([^;\s]+)/i.exec(header)
  if (token) return cleanFilename(token[1])
  return null
}

/** O mesmo tratamento de `apiRequest`: a API manda `message` em pt-BR (às vezes uma lista). */
export async function errorMessageFrom(response: Response): Promise<string | null> {
  const payload = (await response.json().catch(() => null)) as { message?: unknown } | null
  const message = payload?.message
  if (Array.isArray(message)) return message.filter((part) => typeof part === "string").join("; ") || null
  return typeof message === "string" && message.trim() ? message : null
}

/** Mensagens-padrão do NestJS (em inglês, sem explicar nada): melhor o texto do app. */
const GENERIC_MESSAGES = new Set([
  "bad request",
  "forbidden",
  "not found",
  "internal server error",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
])

/** Texto do aviso quando a exportação falha. `status` 0 = sem resposta (rede, servidor fora). */
export function exportErrorMessage(status: number, message: string | null): string {
  if (status === 0) return "Sem resposta do servidor. Verifique a conexão e tente de novo."
  if (status === 403) return "Seu usuário não tem permissão para exportar os dados."
  if (message && !GENERIC_MESSAGES.has(message.trim().toLowerCase())) return message
  if (status >= 500) return `A API não conseguiu gerar o arquivo (erro ${status}). Tente de novo em instantes.`
  return `A API recusou o pedido (erro ${status}).`
}
