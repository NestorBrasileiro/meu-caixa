import type { PaymentMethod } from "@/lib/api/types"

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "Pix",
  TED: "TED",
  DOC: "DOC",
  BOLETO: "Boleto",
  CARD: "Cartão",
  OTHER: "Outro",
}
