"use client"

import { CalendarClock, ChevronDown, PiggyBank, Plus, ReceiptText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogMenu, DialogMenuItem, ReadOnlyHint } from "./actions"
import type { EntityKind } from "./copy"
import { ADD_TRIGGER_ID, usePlanningEditor } from "./editor"

const ADD_ITEMS: { kind: EntityKind; label: string; icon: typeof Plus }[] = [
  { kind: "commitment", label: "Compromisso fixo", icon: CalendarClock },
  { kind: "goal", label: "Meta", icon: PiggyBank },
  { kind: "category", label: "Categoria de orçamento", icon: ReceiptText },
]

/** Cabeçalho da página: "Adicionar" abre o menu com o que dá para criar. */
export function PlanningHeaderActions() {
  const { readOnly, edit } = usePlanningEditor()

  if (readOnly) {
    return (
      <ReadOnlyHint>
        <Button size="sm" disabled>
          <Plus aria-hidden />
          Adicionar
        </Button>
      </ReadOnlyHint>
    )
  }

  return (
    <DialogMenu
      className="w-56"
      trigger={
        <Button id={ADD_TRIGGER_ID} size="sm">
          <Plus aria-hidden />
          Adicionar
          <ChevronDown aria-hidden className="-mr-0.5 opacity-70" />
        </Button>
      }
    >
      {ADD_ITEMS.map(({ kind, label, icon: Icon }) => (
        <DialogMenuItem key={kind} onOpen={(focus) => edit(kind, null, focus)}>
          <Icon aria-hidden />
          {label}
        </DialogMenuItem>
      ))}
    </DialogMenu>
  )
}
