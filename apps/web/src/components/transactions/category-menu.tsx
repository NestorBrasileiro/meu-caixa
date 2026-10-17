"use client"

import { ChevronDown, PencilLine, RotateCcw } from "lucide-react"
import { useState } from "react"
import { Badge, badgeVariants } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { categoryLabel } from "@/lib/format/category"
import { cn } from "@/lib/utils"
import { NO_CATEGORY, type CategoryOption } from "./model"

/**
 * Badge da categoria que abre o menu de recategorização. A escolha vai para a
 * API; enquanto ela não responde, o badge mostra a categoria pedida com um
 * spinner e não abre o menu (fica focável: `disabled` jogaria o foco no body).
 * Em modo somente leitura vira um badge comum, sem menu.
 */
export function CategoryMenu({
  category,
  original,
  options,
  onChange,
  description,
  pending = false,
  pendingTransaction = false,
  readOnly = false,
}: {
  /** Categoria efetiva (a escolhida, ou a do banco). */
  category: string | null
  /** Categoria que veio do banco. */
  original: string | null
  options: CategoryOption[]
  /** Categoria efetiva desejada; `original` volta para a do banco. */
  onChange: (category: string | null) => void
  /** Descrição do lançamento, para o rótulo acessível do botão. */
  description: string
  /** Salvamento em andamento. */
  pending?: boolean
  /** Lançamento ainda pendente no banco (pode ser substituído na sincronização). */
  pendingTransaction?: boolean
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = categoryLabel(category)
  const edited = category !== original

  if (readOnly) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <Badge variant="outline" className="text-muted-foreground min-w-0 font-normal">
          <span className="sr-only">Categoria: </span>
          <span className="truncate">{label}</span>
          {edited && <span className="sr-only"> (editada)</span>}
        </Badge>
        {edited && <EditedMark />}
      </div>
    )
  }

  function choose(next: string | null) {
    // Fecha aqui: o Radix só avisa o fechamento se `open` ainda for true, e o
    // salvamento (pending) já o força para false — sem isso, o menu reabriria
    // quando o salvamento terminasse.
    setOpen(false)
    if (next !== category) onChange(next)
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <DropdownMenu open={open && !pending} onOpenChange={(next) => setOpen(next && !pending)}>
        <DropdownMenuTrigger
          className={cn(
            badgeVariants({ variant: "outline" }),
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent min-w-0 cursor-pointer font-normal outline-none",
            "aria-busy:hover:text-muted-foreground aria-busy:cursor-progress aria-busy:hover:bg-transparent",
          )}
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          aria-label={
            pending
              ? `Categoria de ${description}: salvando ${label}`
              : `Categoria de ${description}: ${label}${edited ? " (editada)" : ""}. Alterar categoria`
          }
        >
          <span className="truncate">{label}</span>
          {pending ? <Spinner aria-hidden className="size-3" /> : <ChevronDown aria-hidden className="opacity-60" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" collisionPadding={16} className="w-64 p-0">
          <DropdownMenuLabel className="text-muted-foreground px-3 pt-2.5 text-xs font-normal">
            Mover para a categoria
          </DropdownMenuLabel>
          <div ref={revealChecked} className="relative max-h-64 overflow-y-auto p-1">
            <DropdownMenuRadioGroup
              value={category ?? NO_CATEGORY}
              onValueChange={(value) => choose(value === NO_CATEGORY ? null : value)}
            >
              {options.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </div>
          {edited && (
            <>
              <DropdownMenuSeparator className="mx-0 my-0" />
              <div className="p-1">
                <DropdownMenuItem onSelect={() => choose(original)}>
                  <RotateCcw aria-hidden />
                  Voltar para {categoryLabel(original)}
                </DropdownMenuItem>
              </div>
            </>
          )}
          <DropdownMenuSeparator className="mx-0 my-0" />
          <p className="text-muted-foreground px-3 py-2.5 text-xs">
            A nova categoria conta nos totais e no orçamento, e a sincronização não a desfaz.
            {pendingTransaction &&
              " Pendente: se o banco trocar o lançamento ao efetivá-lo, a escolha se perde."}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {edited && <EditedMark />}
    </div>
  )
}

/**
 * Ao abrir, rola a lista até a categoria atual (com ~20 opções, ela pode
 * ficar fora da área visível). Função de módulo: o ref não muda entre
 * renderizações, então só roda quando o menu monta.
 */
function revealChecked(list: HTMLDivElement | null) {
  const item = list?.querySelector<HTMLElement>("[data-state=checked]")
  if (list && item) list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2
}

/** Marca visual; o rótulo do botão já diz "(editada)" para leitores de tela. */
function EditedMark() {
  return (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs" aria-hidden>
      <PencilLine className="size-3" />
      editada
    </span>
  )
}
