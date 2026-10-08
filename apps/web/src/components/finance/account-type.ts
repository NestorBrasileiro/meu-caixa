import { CreditCard, Landmark, PiggyBank, Wallet, type LucideIcon } from "lucide-react"
import type { AccountType } from "@/lib/api/types"

export const ACCOUNT_TYPE: Record<AccountType, { label: string; icon: LucideIcon }> = {
  CHECKING: { label: "Conta corrente", icon: Landmark },
  SAVINGS: { label: "Poupança", icon: PiggyBank },
  CREDIT_CARD: { label: "Cartão de crédito", icon: CreditCard },
  OTHER: { label: "Outra conta", icon: Wallet },
}
