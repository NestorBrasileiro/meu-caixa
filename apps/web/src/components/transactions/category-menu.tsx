"use client"

import { ChevronDown, PencilLine, RotateCcw } from "lucide-react"
import { badgeVariants } from "@/components/ui/badge"
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
import { categoryLabel } from "@/lib/format/category"
import { cn } from "@/lib/utils"
import { NO_CATEGORY, type CategoryOption } from "./model"

/**
 * Badge da categoria que abre o menu de recategorização. A troca fica só no
 * estado da tela (marcada como "editada") até a interface ser ligada à API.
 */
export function CategoryMenu({
  category,
  original,
  options,
  onChange,
  description,
}: {
  category: string | null
  original: string | null
  options: CategoryOption[]
  onChange: (category: string | null) => void
  /** Descrição do lançamento, para o rótulo acessível do botão. */
  description: string
}) {
  const label = categoryLabel(category)
  const edited = category !== original

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            badgeVariants({ variant: "outline" }),
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent min-w-0 cursor-pointer font-normal outline-none",
          )}
          aria-label={`Categoria de ${description}: ${label}${edited ? " (editada)" : ""}. Alterar categoria`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden className="opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-0">
          <DropdownMenuLabel className="text-muted-foreground px-3 pt-2.5 text-xs font-normal">
            Mover para a categoria
          </DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto p-1">
            <DropdownMenuRadioGroup
              value={category ?? NO_CATEGORY}
              onValueChange={(value) => onChange(value === NO_CATEGORY ? null : value)}
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
                <DropdownMenuItem onSelect={() => onChange(original)}>
                  <RotateCcw aria-hidden />
                  Voltar para {categoryLabel(original)}
                </DropdownMenuItem>
              </div>
            </>
          )}
          <DropdownMenuSeparator className="mx-0 my-0" />
          <p className="text-muted-foreground px-3 py-2.5 text-xs">
            A mudança vale só nesta tela por enquanto. Ela passa a ser salva quando a interface estiver ligada à API.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      {edited && (
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs" aria-hidden>
          <PencilLine className="size-3" />
          editada
        </span>
      )}
    </div>
  )
}
