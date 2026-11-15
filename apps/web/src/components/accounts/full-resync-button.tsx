"use client"

import { History } from "lucide-react"
import { useState } from "react"
import { startSync, useSyncTracker } from "@/components/shell/sync-tracker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * "Ressincronizar tudo": busca o histórico inteiro e deixa o Meu Caixa igual ao que o banco
 * devolve, limpando pendentes antigas e cópias duplicadas. Pede confirmação porque apaga
 * lançamentos (as categorias editadas vão para a cópia que fica).
 */
export function FullResyncButton() {
  const tracker = useSyncTracker()
  const [open, setOpen] = useState(false)
  const busy = tracker.phase !== "idle"

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <History aria-hidden />
          Ressincronizar tudo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-snug">Ressincronizar o histórico inteiro?</AlertDialogTitle>
          <AlertDialogDescription>
            O Meu Caixa busca de novo todo o histórico nos bancos e fica igual ao que eles devolvem: pendentes que
            o banco já efetivou e lançamentos duplicados somem. As categorias que você editou passam para o
            lançamento que fica. Pode levar alguns minutos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false)
              void startSync({ full: true })
            }}
          >
            Ressincronizar tudo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
