import { ClientApiError } from "@/lib/api/client"

/** A API já responde em pt-BR o que deu errado (credencial, item, modelo, serviço fora). */
export function saveErrorMessage(error: unknown): string {
  if (!(error instanceof ClientApiError)) {
    return "Não foi possível salvar: sem resposta do servidor. Verifique a conexão e tente de novo."
  }
  if (error.status === 403) return "Seu usuário não tem permissão para alterar as configurações."
  return error.message
}
