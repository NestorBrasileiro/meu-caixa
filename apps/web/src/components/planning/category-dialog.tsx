"use client"

import { AlertTriangle } from "lucide-react"
import { useState, type ComponentProps } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import type { DialogContent } from "@/components/ui/dialog"
import { FieldDescription, FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiRequest } from "@/lib/api/client"
import type { BudgetCategory, CategoryKind } from "@/lib/api/planning"
import { categoryLabel } from "@/lib/format/category"
import { savedToast } from "./copy"
import { focusFirstError, FormDialog, FormField, MoneyInput } from "./form-dialog"
import {
  CATEGORY_FIELDS,
  categoryForm,
  categoryPatch,
  sourceChoices,
  validateCategory,
  type CategoryField,
  type CategoryForm,
  type FieldErrors,
  type SourceChoice,
} from "./forms"
import type { SourceCategoryOption } from "./model"
import { useMutation } from "./use-mutation"

const KIND_OPTIONS: { value: CategoryKind; label: string; hint: string }[] = [
  { value: "ESSENTIAL", label: "Essencial", hint: "Moradia, mercado, transporte: difícil cortar." },
  { value: "DISCRETIONARY", label: "Não essencial", hint: "Delivery, compras, assinaturas: dá para ajustar." },
]

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  categories,
  options,
  onDelete,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = nova categoria. */
  category: BudgetCategory | null
  /** Todas as categorias do orçamento (para avisar quando uma categoria do banco já está em outra). */
  categories: BudgetCategory[]
  options: SourceCategoryOption[]
  onDelete: (trigger: HTMLElement) => void
  onCloseAutoFocus: ComponentProps<typeof DialogContent>["onCloseAutoFocus"]
}) {
  const [form, setForm] = useState<CategoryForm>(() => categoryForm(category))
  const [errors, setErrors] = useState<FieldErrors<CategoryField>>({})
  const mutation = useMutation()

  function update<K extends keyof CategoryForm>(field: K, value: CategoryForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function toggleSource(value: string, checked: boolean) {
    update(
      "sourceCategories",
      checked ? [...form.sourceCategories, value] : form.sourceCategories.filter((source) => source !== value),
    )
  }

  function submit() {
    const result = validateCategory(form)
    if (!result.ok) {
      setErrors(result.errors)
      focusFirstError("category", CATEGORY_FIELDS, result.errors)
      return
    }
    setErrors({})
    // Nova categoria entra no fim do orçamento (a API ordena por posição e depois por nome).
    const body = category ? categoryPatch(category, result.value) : { ...result.value, position: categories.length }
    if (category && Object.keys(body).length === 0) {
      onOpenChange(false)
      return
    }
    mutation.run(
      () =>
        category
          ? apiRequest(`/api/planning/categories/${category.id}`, { method: "PATCH", body })
          : apiRequest("/api/planning/categories", { method: "POST", body }),
      {
        action: "salvar",
        onSuccess: () => {
          onOpenChange(false)
          toast.success(savedToast("category", result.value.name, !category))
        },
      },
    )
  }

  const { free, taken } = sourceChoices(options, form.sourceCategories, categories, category?.id ?? null, categoryLabel)
  const total = free.length + taken.length
  const kindHint = KIND_OPTIONS.find((option) => option.value === form.kind)?.hint

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Editar categoria" : "Nova categoria de orçamento"}
      description="Junta categorias do banco num grupo seu, com um teto de gasto por mês."
      pending={mutation.pending}
      error={mutation.error}
      submitLabel={category ? "Salvar" : "Adicionar"}
      onSubmit={submit}
      onDelete={category ? onDelete : undefined}
      deleteLabel={category?.name}
      focusFirstField={!category}
      onCloseAutoFocus={onCloseAutoFocus}
      className="sm:max-w-xl"
    >
      <FieldGroup className="gap-5">
        <FormField id="category-name" label="Nome" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              autoComplete="off"
              maxLength={60}
              placeholder="Ex.: Lazer, saúde, pets"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="category-kind" label="Tipo" description={kindHint}>
            {(control) => (
              <Select value={form.kind} onValueChange={(value) => update("kind", value as CategoryKind)}>
                <SelectTrigger {...control} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField
            id="category-monthlyBudget"
            label="Teto mensal"
            optional
            error={errors.monthlyBudget}
            description={form.monthlyBudget.trim() ? undefined : "Em branco: só acompanha o gasto."}
          >
            {(control) => (
              <MoneyInput
                {...control}
                value={form.monthlyBudget}
                onValueChange={(value) => update("monthlyBudget", value)}
              />
            )}
          </FormField>
        </div>

        <FieldSet className="min-w-0 gap-2" aria-describedby="category-sources-description">
          <FieldLegend variant="label" className="mb-1 data-[variant=label]:text-sm">
            Categorias do banco que entram aqui
          </FieldLegend>
          <FieldDescription id="category-sources-description" className="text-xs">
            {total === 0
              ? "Nenhuma categoria de gasto apareceu nos últimos meses. Depois da primeira sincronização, volte aqui para escolher quais gastos entram nesta categoria."
              : form.sourceCategories.length === 0
                ? "O gasto do mês nas categorias marcadas soma nesta categoria do orçamento."
                : `${form.sourceCategories.length === 1 ? "1 marcada" : `${form.sourceCategories.length} marcadas`}: o gasto do mês nelas soma nesta categoria do orçamento.`}
          </FieldDescription>
          {total > 0 && (
            <div className="mt-1 divide-y rounded-md border">
              {[
                { title: "Livres", choices: free, offset: 0 },
                { title: "Já em outra categoria", choices: taken, offset: free.length },
              ].map(
                ({ title, choices, offset }) =>
                  choices.length > 0 && (
                    <div key={title} role="group" aria-label={title} className="p-2">
                      <p className="text-muted-foreground px-1.5 pt-0.5 pb-1 text-xs font-medium" aria-hidden>
                        {title}
                      </p>
                      <div className="grid gap-x-4 sm:grid-cols-2">
                        {choices.map((choice, i) => (
                          <SourceCheckbox
                            key={choice.value}
                            id={offset + i === 0 ? "category-sourceCategories" : `category-source-${offset + i}`}
                            choice={choice}
                            checked={form.sourceCategories.includes(choice.value)}
                            onCheckedChange={(checked) => toggleSource(choice.value, checked)}
                          />
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}
          <FieldError className="text-xs">{errors.sourceCategories}</FieldError>
        </FieldSet>
      </FieldGroup>
    </FormDialog>
  )
}

function SourceCheckbox({
  id,
  choice,
  checked,
  onCheckedChange,
}: {
  id: string
  choice: SourceChoice
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const elsewhere = choice.usedIn.join(", ")
  return (
    <div className="hover:bg-accent/50 flex items-start gap-2.5 rounded-sm px-1.5 py-1.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        aria-describedby={elsewhere ? `${id}-elsewhere` : undefined}
        className="mt-0.5"
      />
      <div className="grid min-w-0 gap-0.5">
        <Label htmlFor={id} className="leading-snug font-normal">
          {choice.label}
        </Label>
        {elsewhere &&
          (checked ? (
            <span id={`${id}-elsewhere`} className="flex items-start gap-1 text-xs leading-snug">
              <AlertTriangle className="text-status-warning mt-px size-3 shrink-0" aria-hidden />
              Também em {elsewhere}: soma duas vezes
            </span>
          ) : (
            <span id={`${id}-elsewhere`} className="text-muted-foreground text-xs leading-snug">
              em {elsewhere}
            </span>
          ))}
      </div>
    </div>
  )
}
