"use client"

import { FilterX, Info, Search, X } from "lucide-react"
import { ACCOUNT_TYPE } from "@/components/finance/account-type"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatCount } from "./format"
import {
  ALL,
  PERIODS,
  type AccountOption,
  type CategoryOption,
  type Filters,
  type FlowFilter,
  type PeriodKey,
  type StatusFilter,
} from "./model"

const FLOWS: { value: FlowFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "in", label: "Entradas" },
  { value: "out", label: "Saídas" },
]

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "PENDING", label: "Pendentes" },
  { value: "POSTED", label: "Efetivadas" },
]

/**
 * Filtros da lista. No celular viram uma grade de duas colunas; a partir de
 * ~670px de largura útil (container query, não viewport: a barra lateral
 * ocupa espaço) ficam em duas linhas corridas.
 */
export function FilterBar({
  filters,
  onChange,
  onReset,
  active,
  accounts,
  categories,
  hiddenInternal,
}: {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  active: boolean
  accounts: AccountOption[]
  categories: CategoryOption[]
  hiddenInternal: number
}) {
  const selectedAccount = accounts.find((account) => account.id === filters.accountId)
  const selectedCategory = categories.find((category) => category.value === filters.category)
  // Escolher uma categoria interna já é pedir para vê-la: o "ocultar" não se aplica.
  const internalCategory = selectedCategory?.internal != null

  return (
    <section aria-label="Filtros" className="@container/filters space-y-2">
      <div className="grid grid-cols-2 gap-2 @2xl/filters:flex @2xl/filters:items-center">
        <InputGroup className="col-span-2 @2xl/filters:flex-1">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Buscar descrição ou favorecido"
            aria-label="Buscar por descrição ou favorecido"
            className="[&::-webkit-search-cancel-button]:hidden"
          />
          {filters.search && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Limpar busca" onClick={() => onChange({ search: "" })}>
                <X aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <Select value={filters.accountId} onValueChange={(accountId) => onChange({ accountId })}>
          <SelectTrigger aria-label="Conta" className="w-full min-w-0 @2xl/filters:w-60">
            <SelectValue>
              <span className="truncate">{selectedAccount ? selectedAccount.name : "Todas as contas"}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as contas</SelectItem>
            <SelectSeparator />
            {accounts.map((account) => {
              const { icon: Icon } = ACCOUNT_TYPE[account.type]
              return (
                <SelectItem key={account.id} value={account.id}>
                  <Icon aria-hidden />
                  <span>
                    {account.name}
                    <span className="text-muted-foreground"> · {account.institutionName}</span>
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Select value={filters.period} onValueChange={(period) => onChange({ period: period as PeriodKey })}>
          <SelectTrigger aria-label="Período" className="w-full min-w-0 @2xl/filters:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.key} value={period.key}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 @2xl/filters:flex @2xl/filters:flex-wrap @2xl/filters:items-center">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filters.flow}
          onValueChange={(flow) => flow && onChange({ flow: flow as FlowFilter })}
          aria-label="Tipo de lançamento"
          className="col-span-2 w-full @2xl/filters:w-auto"
        >
          {FLOWS.map((flow) => (
            <ToggleGroupItem key={flow.value} value={flow.value} className="flex-1 font-normal data-[state=on]:font-medium">
              {flow.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* No celular, categoria e status ocupam a linha toda: os rótulos de categoria são os mais longos. */}
        <Select value={filters.category} onValueChange={(category) => onChange({ category })}>
          <SelectTrigger aria-label="Categoria" className="col-span-2 w-full min-w-0 @2xl/filters:w-52">
            <SelectValue>
              <span className="truncate">{selectedCategory?.label ?? "Todas as categorias"}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            <SelectSeparator />
            {categories.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(status) => onChange({ status: status as StatusFilter })}>
          <SelectTrigger aria-label="Status" className="col-span-2 w-full min-w-0 @2xl/filters:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="col-span-2 flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
          <Switch
            id="hide-internal"
            checked={filters.hideInternal && !internalCategory}
            disabled={internalCategory}
            aria-describedby={internalCategory ? "hide-internal-note" : undefined}
            onCheckedChange={(hideInternal) => onChange({ hideInternal })}
          />
          <Label htmlFor="hide-internal" className="font-normal">
            Ocultar movimentações internas
          </Label>
          <InternalInfo />
          {internalCategory ? (
            <span id="hide-internal-note" className="text-muted-foreground text-xs">
              Categoria interna
              <span className="sr-only">: a categoria escolhida é uma movimentação interna e aparece na lista</span>
            </span>
          ) : (
            filters.hideInternal &&
            hiddenInternal > 0 && (
              <span className="text-muted-foreground text-xs">
                {hiddenInternal === 1 ? "1 oculta" : `${formatCount(hiddenInternal)} ocultas`}
              </span>
            )
          )}
        </div>

        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="col-span-2 justify-self-start @max-2xl/filters:-ml-2.5 @2xl/filters:ml-auto"
          >
            <FilterX aria-hidden />
            Limpar filtros
          </Button>
        )}
      </div>
    </section>
  )
}

/**
 * Explicação do "ocultar": abre no clique (toggletip) para funcionar também
 * no toque, onde não existe hover.
 */
function InternalInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          aria-label="Por que ocultar movimentações internas?"
        >
          <Info aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" collisionPadding={16} className="w-[min(20rem,calc(100vw-2rem))] text-sm">
        <p className="font-medium">Por que ocultar?</p>
        <p className="text-muted-foreground mt-1">
          Pagamento de fatura e transferência entre suas contas não são gasto novo: as compras já aparecem no cartão,
          e a transferência só muda o dinheiro de lugar. Ocultá-las evita contar o mesmo real duas vezes.
        </p>
      </PopoverContent>
    </Popover>
  )
}
