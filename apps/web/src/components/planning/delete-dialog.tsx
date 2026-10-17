"use client"

import { AlertCircle } from "lucide-react"
import type { ComponentProps } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import type { DeleteCopy } from "./copy"
import { useMutation } from "./use-mutation"

/** Confirmação de exclusão: nomeia o item, diz o que acontece e só fecha depois que a API confirmou. */
export function DeleteDialog({
  open,
  onOpenChange,
  path,
  copy,
  onDeleted,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ex.: `/api/planning/goals/<id>` */
  path: string
  copy: DeleteCopy
  /** Depois do sucesso (fecha também o formulário de edição, se estiver aberto). */
  onDeleted: () => void
  onCloseAutoFocus?: ComponentProps<typeof AlertDialogContent>["onCloseAutoFocus"]
}) {
  const mutation = useMutation()

  function confirm() {
    mutation.run(() => apiRequest(path, { method: "DELETE" }), {
      action: "excluir",
      onSuccess: () => {
        onOpenChange(false)
        onDeleted()
        toast.success(copy.success)
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (mutation.pending ? undefined : onOpenChange(next))}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus} aria-busy={mutation.pending}>
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-snug">{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Não foi possível excluir</AlertTitle>
            <AlertDescription>{mutation.error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter className="max-sm:grid max-sm:grid-cols-2">
          <AlertDialogCancel disabled={mutation.pending}>Cancelar</AlertDialogCancel>
          {/* Botão comum (não AlertDialogAction): o diálogo fica aberto até a API responder. */}
          <Button variant="destructive" onClick={confirm} disabled={mutation.pending}>
            {mutation.pending && <Spinner aria-hidden />}
            {mutation.pending ? "Excluindo…" : copy.confirm}
          </Button>
        </AlertDialogFooter>
        <span role="status" aria-live="polite" className="sr-only">
          {mutation.pending ? "Excluindo…" : ""}
        </span>
      </AlertDialogContent>
    </AlertDialog>
  )
}
