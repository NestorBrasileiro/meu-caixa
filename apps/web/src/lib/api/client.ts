"use client"

/**
 * Chamadas do browser para a API. Passam pelo próprio Next (rewrite de
 * `/api/*`), então o cookie de sessão vai junto e não há CORS.
 */

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ClientApiError"
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  init: { method: "POST" | "PATCH" | "DELETE" | "GET"; body?: unknown } = { method: "GET" },
): Promise<T> {
  const response = await fetch(path, {
    method: init.method,
    credentials: "same-origin",
    headers: init.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (response.status === 401) {
    // `/auth/login` é da API (rewrite), não uma página do Next: precisa de
    // navegação completa, não de `router.push`.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/auth/login")
    throw new ClientApiError(401, "Sessão expirada")
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(payload?.message) ? payload.message.join("; ") : payload?.message
    throw new ClientApiError(response.status, message ?? `Erro ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
