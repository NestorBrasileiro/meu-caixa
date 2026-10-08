import {
  ArrowLeftRight,
  Barcode,
  Bike,
  Briefcase,
  Car,
  CreditCard,
  Dumbbell,
  Fuel,
  House,
  Landmark,
  Music,
  Package,
  PiggyBank,
  Pill,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Tv,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react"
import type { PaymentMethod } from "@/lib/api/types"

/** Ícone pela categoria do agregador; sem correspondência, cai no meio de pagamento. */
const BY_CATEGORY: Record<string, LucideIcon> = {
  Salary: Briefcase,
  Housing: House,
  "Transfer - Savings": PiggyBank,
  Transfers: ArrowLeftRight,
  Electricity: Zap,
  Internet: Wifi,
  Telecommunications: Smartphone,
  "Bank fees": Landmark,
  Groceries: ShoppingCart,
  Pharmacy: Pill,
  "Investment income": TrendingUp,
  "Food delivery": Bike,
  Restaurants: UtensilsCrossed,
  "Video streaming": Tv,
  "Music streaming": Music,
  "Gyms and fitness centers": Dumbbell,
  "Taxi and ride-hailing": Car,
  "Gas stations": Fuel,
  Shopping: ShoppingBag,
  "Online shopping": Package,
  "Credit card payment": CreditCard,
}

const BY_PAYMENT_METHOD: Record<PaymentMethod, LucideIcon> = {
  PIX: ArrowLeftRight,
  TED: Landmark,
  DOC: Landmark,
  BOLETO: Barcode,
  CARD: CreditCard,
  OTHER: Receipt,
}

export function transactionIcon(category: string | null, paymentMethod: PaymentMethod | null): LucideIcon {
  return (category && BY_CATEGORY[category]) || BY_PAYMENT_METHOD[paymentMethod ?? "OTHER"]
}
