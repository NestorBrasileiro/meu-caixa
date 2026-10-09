"use client"

import { MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from "lucide-react"
import { createContext, useContext, useRef, type ComponentProps, type ReactElement, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { cn } from "@/lib/utils"
import type { EntityKind } from "./copy"
import { usePlanningEditor } from "./editor"

/**
 * Pontos de entrada da edição. Com dados de exemplo (somente leitura) os
 * botões ficam desabilitados com a dica; nos menus, os itens ficam
 * desabilitados e a dica aparece no próprio menu.
 */

/** Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível. */
export function ReadOnlyHint({ children }: { children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="focus-visible:ring-ring/50 inline-flex rounded-md outline-none focus-visible:ring-[3px]">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{READ_ONLY_HINT}</TooltipContent>
    </Tooltip>
  )
}

function MenuReadOnlyNote() {
  return (
    <>
      <DropdownMenuSeparator />
      <p className="text-muted-foreground max-w-60 px-2 py-1.5 text-xs">{READ_ONLY_HINT}</p>
    </>
  )
}

/** Abre o diálogo a partir do item; recebe o elemento que deve ganhar o foco quando o diálogo fechar. */
type OpenFromMenu = (open: (returnFocus: HTMLElement | null) => void) => void

const MenuContext = createContext<OpenFromMenu | null>(null)

/**
 * Menu cujos itens abrem diálogos. Ao escolher um item, o menu não devolve o
 * foco ao gatilho (o diálogo leva o foco e o devolve ao gatilho quando fecha).
 */
export function DialogMenu({
  trigger,
  className,
  children,
}: {
  /** O botão que abre o menu. */
  trigger: ReactElement
  className?: string
  children: ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const openingDialog = useRef(false)

  const openFromMenu: OpenFromMenu = (open) => {
    openingDialog.current = true
    open(triggerRef.current)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild ref={triggerRef}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={className}
        onCloseAutoFocus={(event) => {
          if (openingDialog.current) event.preventDefault()
          openingDialog.current = false
        }}
      >
        <MenuContext.Provider value={openFromMenu}>{children}</MenuContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Item de `DialogMenu`: `onOpen` recebe o gatilho do menu, para devolver o foco a ele. */
export function DialogMenuItem({
  onOpen,
  ...props
}: Omit<ComponentProps<typeof DropdownMenuItem>, "onSelect"> & { onOpen: (returnFocus: HTMLElement | null) => void }) {
  const openFromMenu = useContext(MenuContext)
  return <DropdownMenuItem {...props} onSelect={() => openFromMenu?.(onOpen)} />
}

/** Botão de chamada de um estado vazio ("Adicionar compromisso"). */
export function AddButton({ kind, children }: { kind: EntityKind; children: ReactNode }) {
  const { readOnly, edit } = usePlanningEditor()
  const button = (
    <Button size="sm" variant="outline" disabled={readOnly} onClick={(event) => edit(kind, null, event.currentTarget)}>
      <Plus aria-hidden />
      {children}
    </Button>
  )
  return readOnly ? <ReadOnlyHint>{button}</ReadOnlyHint> : button
}

/** "…" de uma linha ou cartão: Editar / Excluir. O rótulo acessível nomeia o item. */
export function RowActions({
  kind,
  id,
  name,
  className,
}: {
  kind: EntityKind
  id: string
  name: string
  className?: string
}) {
  const { readOnly, edit, remove } = usePlanningEditor()
  const noun = kind === "commitment" ? "compromisso" : kind === "goal" ? "meta" : "categoria"

  return (
    <DialogMenu
      className="min-w-44"
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("text-muted-foreground hover:text-foreground data-[state=open]:bg-accent", className)}
          aria-label={`Ações de ${name}`}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      }
    >
      <DialogMenuItem disabled={readOnly} onOpen={(focus) => edit(kind, id, focus)}>
        <Pencil aria-hidden />
        Editar {noun}
      </DialogMenuItem>
      <DialogMenuItem variant="destructive" disabled={readOnly} onOpen={(focus) => remove(kind, id, focus)}>
        <Trash2 aria-hidden />
        Excluir {noun}
      </DialogMenuItem>
      {readOnly && <MenuReadOnlyNote />}
    </DialogMenu>
  )
}

/**
 * Menu do cartão de orçamento: nova categoria e a lista das existentes para
 * editar (excluir fica no formulário e no "…" de cada linha da tabela). No
 * celular, só o ícone (como o alternador Gráfico/Tabela ao lado).
 */
export function BudgetCategoriesMenu({ categories }: { categories: { id: string; name: string }[] }) {
  const { readOnly, edit } = usePlanningEditor()

  return (
    <DialogMenu
      className="w-60"
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="data-[state=open]:bg-accent h-8 px-2.5 text-xs"
          aria-label="Gerenciar categorias do orçamento"
        >
          <Settings2 className="size-3.5" aria-hidden />
          <span className="max-sm:sr-only">Categorias</span>
        </Button>
      }
    >
      <DialogMenuItem disabled={readOnly} onOpen={(focus) => edit("category", null, focus)}>
        <Plus aria-hidden />
        Nova categoria
      </DialogMenuItem>
      {categories.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Editar categoria</DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto">
            {categories.map((category) => (
              <DialogMenuItem
                key={category.id}
                disabled={readOnly}
                onOpen={(focus) => edit("category", category.id, focus)}
              >
                <Pencil aria-hidden />
                <span className="truncate">{category.name}</span>
              </DialogMenuItem>
            ))}
          </div>
        </>
      )}
      {readOnly && <MenuReadOnlyNote />}
    </DialogMenu>
  )
}
