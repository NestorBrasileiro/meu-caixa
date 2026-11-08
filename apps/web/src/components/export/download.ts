import { errorMessageFrom, exportErrorMessage, filenameFromDisposition } from "./request"

/**
 * Busca o arquivo da exportação pelo proxy do Next (mesma origem: o cookie de sessão vai junto).
 * Um 401 leva ao login, como em `apiRequest`; os outros erros viram `ExportError` com a mensagem
 * da API.
 */

export class ExportError extends Error {
  constructor(
    /** 0 = sem resposta do servidor. */
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ExportError"
  }
}

export interface ExportDeps {
  fetch: typeof fetch
  /** Sessão expirada: navegação completa para `/auth/login` (rota da API, não página do Next). */
  onUnauthorized: () => void
}

function goToLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/auth/login")
}

const defaultDeps = (): ExportDeps => ({ fetch: (...args) => fetch(...args), onUnauthorized: goToLogin })

export async function requestExport(path: string, deps: ExportDeps = defaultDeps()): Promise<Response> {
  let response: Response
  try {
    response = await deps.fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store" })
  } catch {
    throw new ExportError(0, exportErrorMessage(0, null))
  }
  if (response.status === 401) {
    deps.onUnauthorized()
    throw new ExportError(401, "Sessão expirada")
  }
  if (!response.ok) {
    throw new ExportError(response.status, exportErrorMessage(response.status, await errorMessageFrom(response)))
  }
  return response
}

/** O arquivo e o nome com que ele é salvo (do `Content-Disposition`, senão `fallbackName`). */
export async function fetchExportFile(
  path: string,
  fallbackName: string,
  deps?: ExportDeps,
): Promise<{ blob: Blob; filename: string }> {
  const response = await requestExport(path, deps)
  const filename = filenameFromDisposition(response.headers.get("content-disposition")) ?? fallbackName
  try {
    return { blob: await response.blob(), filename }
  } catch {
    throw new ExportError(0, "A conexão caiu no meio do download. Tente de novo.")
  }
}

/** O Markdown como texto (para a área de transferência). */
export async function fetchExportText(path: string, deps?: ExportDeps): Promise<string> {
  const response = await requestExport(path, deps)
  try {
    return await response.text()
  } catch {
    throw new ExportError(0, "A conexão caiu no meio do download. Tente de novo.")
  }
}

/** Salva o blob pelo navegador: URL temporária + `<a download>` clicado e removido. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // Alguns navegadores ainda leem a URL depois do clique: libera só mais tarde.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Copia o texto que `load` busca. No Safari a cópia só vale dentro do clique, então, quando dá,
 * entrega ao navegador a promessa do texto (ClipboardItem) já no clique; senão copia depois.
 * Erros de `load` (os da API) sobem como vieram.
 */
export async function copyFromPromise(load: Promise<string>): Promise<void> {
  const clipboard = navigator.clipboard
  if (!clipboard) {
    await load
    throw new ExportError(-1, "Este navegador não deixa o site copiar. Baixe o arquivo .md e abra-o.")
  }
  if (typeof ClipboardItem !== "undefined" && typeof clipboard.write === "function") {
    try {
      const blob = load.then((text) => new Blob([text], { type: "text/plain" }))
      await clipboard.write([new ClipboardItem({ "text/plain": blob })])
      return
    } catch {
      // Falhou o pedido (o erro real vem do `await load` abaixo) ou o ClipboardItem: tenta o jeito simples.
    }
  }
  const text = await load
  try {
    await clipboard.writeText(text)
  } catch {
    throw new ExportError(-1, "O navegador não deixou copiar. Baixe o arquivo .md e abra-o.")
  }
}
