/**
 * Carrega o `.env` do diretório atual, se existir. Variáveis já definidas no
 * ambiente têm precedência (comportamento nativo do `process.loadEnvFile`).
 */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
