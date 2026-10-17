import { unstable_rethrow } from "next/navigation"

/**
 * Carrega o que um pedaço da moldura (cabeçalho, menu do usuário) precisa sem derrubar a página se
 * a API falhar: o erro vira `null` e quem chama mostra um substituto neutro. Os "erros" do próprio
 * Next (redirect para o login em um 401, notFound, a renderização dinâmica do Cache Components)
 * continuam subindo, como devem.
 */
export async function loadOrNull<T>(what: string, load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    unstable_rethrow(error)
    console.error(`Falha ao carregar ${what}; mostrando um substituto.`, error)
    return null
  }
}
