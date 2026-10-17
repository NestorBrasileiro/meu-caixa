"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import type { BudgetCategory, Commitment, Goal } from "@/lib/api/planning"
import type { IsoDate } from "@/lib/api/types"
import { categoryLabel } from "@/lib/format/category"
import { formatMoney } from "@/lib/format/money"
import { CategoryDialog } from "./category-dialog"
import { CommitmentDialog } from "./commitment-dialog"
import {
  deleteCategoryCopy,
  deleteCommitmentCopy,
  deleteGoalCopy,
  type DeleteCopy,
  type EntityKind,
} from "./copy"
import { DeleteDialog } from "./delete-dialog"
import { GoalDialog, type GoalAccount } from "./goal-dialog"
import type { SourceCategoryOption } from "./model"

export interface PlanningEditorData {
  today: IsoDate
  commitments: Commitment[]
  goals: Goal[]
  categories: BudgetCategory[]
  accounts: GoalAccount[]
  /** Categorias do banco que podem entrar no orçamento. */
  sourceOptions: SourceCategoryOption[]
}

interface EditorApi {
  /** `DATA_SOURCE=mock`: as ações aparecem desabilitadas com a dica. */
  readOnly: boolean
  /** Abre o formulário (`id` null = novo). `returnFocus` recebe o foco quando o diálogo fecha. */
  edit: (kind: EntityKind, id: string | null, returnFocus?: HTMLElement | null) => void
  /** Abre a confirmação de exclusão. */
  remove: (kind: EntityKind, id: string, returnFocus?: HTMLElement | null) => void
}

const EditorContext = createContext<EditorApi | null>(null)

export function usePlanningEditor(): EditorApi {
  const api = useContext(EditorContext)
  if (!api) throw new Error("usePlanningEditor precisa estar dentro de <PlanningEditor>")
  return api
}

type Entity = Commitment | Goal | BudgetCategory

interface DialogState {
  kind: EntityKind
  /** Cópia do item na abertura (null = novo): o diálogo não perde o conteúdo enquanto anima a saída. */
  entity: Entity | null
  open: boolean
  /** Muda a cada abertura: o formulário começa do zero. */
  key: number
  returnFocus: HTMLElement | null
}

/** Id do botão "Adicionar" do cabeçalho: recebe o foco quando o item que abriu o diálogo deixou de existir. */
export const ADD_TRIGGER_ID = "planning-add-trigger"

/** Devolve o foco a quem abriu o diálogo (ou ao "Adicionar", se o item foi excluído). */
function restoreFocus(event: Event, target: HTMLElement | null) {
  const element = target?.isConnected ? target : document.getElementById(ADD_TRIGGER_ID)
  if (!element) return
  event.preventDefault()
  element.focus()
}

const API_PATH: Record<EntityKind, string> = {
  commitment: "/api/planning/commitments",
  goal: "/api/planning/goals",
  category: "/api/planning/categories",
}

/**
 * Edição do planejamento: guarda qual diálogo está aberto e monta os
 * formulários e a confirmação de exclusão. Os cartões (Server Components)
 * só chamam `edit`/`remove` pelos botões em `actions.tsx`.
 */
export function PlanningEditor({
  data,
  readOnly,
  children,
}: {
  data: PlanningEditorData
  readOnly: boolean
  children: ReactNode
}) {
  const [form, setForm] = useState<DialogState | null>(null)
  const [deletion, setDeletion] = useState<DialogState | null>(null)

  const find = (kind: EntityKind, id: string): Entity | undefined =>
    (kind === "commitment" ? data.commitments : kind === "goal" ? data.goals : data.categories).find(
      (item) => item.id === id,
    )

  const api: EditorApi = {
    readOnly,
    edit: (kind, id, returnFocus = null) => {
      const entity = id === null ? null : find(kind, id)
      if (readOnly || entity === undefined) return
      setForm((current) => ({ kind, entity, open: true, key: (current?.key ?? 0) + 1, returnFocus }))
    },
    remove: (kind, id, returnFocus = null) => {
      const entity = find(kind, id)
      if (readOnly || entity === undefined) return
      setDeletion((current) => ({ kind, entity, open: true, key: (current?.key ?? 0) + 1, returnFocus }))
    },
  }

  const closeForm = (open: boolean) => setForm((current) => (current && !open ? { ...current, open } : current))
  const closeDeletion = (open: boolean) =>
    setDeletion((current) => (current && !open ? { ...current, open } : current))
  const formFocus = (event: Event) => restoreFocus(event, form?.returnFocus ?? null)
  const deletionFocus = (event: Event) => restoreFocus(event, deletion?.returnFocus ?? null)
  /** Excluir a partir do formulário: a confirmação abre por cima e devolve o foco ao botão "Excluir". */
  const removeFromForm = (trigger: HTMLElement) => {
    if (form?.entity) api.remove(form.kind, form.entity.id, trigger)
  }
  /** Excluído pelo formulário de edição: fecha os dois. */
  const afterDelete = () => {
    if (form?.open && form.kind === deletion?.kind && form.entity?.id === deletion.entity?.id) closeForm(false)
  }

  return (
    <EditorContext.Provider value={api}>
      {children}

      {form?.kind === "commitment" && (
        <CommitmentDialog
          key={form.key}
          open={form.open}
          onOpenChange={closeForm}
          commitment={form.entity as Commitment | null}
          categories={data.categories}
          today={data.today}
          onDelete={removeFromForm}
          onCloseAutoFocus={formFocus}
        />
      )}
      {form?.kind === "goal" && (
        <GoalDialog
          key={form.key}
          open={form.open}
          onOpenChange={closeForm}
          goal={form.entity as Goal | null}
          accounts={data.accounts}
          today={data.today}
          onDelete={removeFromForm}
          onCloseAutoFocus={formFocus}
        />
      )}
      {form?.kind === "category" && (
        <CategoryDialog
          key={form.key}
          open={form.open}
          onOpenChange={closeForm}
          category={form.entity as BudgetCategory | null}
          categories={data.categories}
          options={data.sourceOptions}
          onDelete={removeFromForm}
          onCloseAutoFocus={formFocus}
        />
      )}
      {deletion?.entity && (
        <DeleteDialog
          key={deletion.key}
          open={deletion.open}
          onOpenChange={closeDeletion}
          path={`${API_PATH[deletion.kind]}/${deletion.entity.id}`}
          copy={deleteCopyOf(deletion.kind, deletion.entity, data)}
          onDeleted={afterDelete}
          onCloseAutoFocus={deletionFocus}
        />
      )}
    </EditorContext.Provider>
  )
}

function deleteCopyOf(kind: EntityKind, entity: Entity, data: PlanningEditorData): DeleteCopy {
  if (kind === "commitment") return deleteCommitmentCopy(entity as Commitment, formatMoney)
  if (kind === "goal") {
    const goal = entity as Goal
    const account = data.accounts.find((a) => a.id === goal.accountId)
    return deleteGoalCopy(goal, account?.name ?? null, formatMoney)
  }
  const category = entity as BudgetCategory
  return deleteCategoryCopy(
    category,
    category.sourceCategories.map(categoryLabel),
    data.commitments.filter((c) => c.categoryId === category.id).map((c) => c.name),
    formatMoney,
  )
}
