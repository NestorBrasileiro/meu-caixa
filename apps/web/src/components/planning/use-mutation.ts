"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { mutationErrorMessage } from "./forms"

/**
 * Chamada de escrita + atualização dos dados do servidor numa transição só:
 * `pending` fica verdadeiro até o `router.refresh()` terminar, então o diálogo
 * fecha (em `onSuccess`) junto com os dados novos já na tela. Em caso de
 * erro, `pending` volta a falso e `error` traz a mensagem em pt-BR.
 */
export function useMutation() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(request: () => Promise<unknown>, options: { action: "salvar" | "excluir"; onSuccess: () => void }) {
    setError(null)
    startTransition(async () => {
      try {
        await request()
      } catch (cause) {
        setError(mutationErrorMessage(cause, options.action))
        return
      }
      startTransition(() => {
        options.onSuccess()
        router.refresh()
      })
    })
  }

  return { pending, error, setError, run }
}
