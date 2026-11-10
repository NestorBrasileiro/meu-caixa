import type { Request } from 'express';
import { SESSION_COOKIE } from './session.constants.js';

/** Começo do id: identifica a sessão no log (e na tabela `sessions`) sem expor o cookie. */
const short = (sid: string | undefined) => (sid ? `${sid.slice(0, 6)}…` : '-');

/**
 * Resumo, para o log de debug, do cookie e da sessão de uma requisição: se o
 * cookie veio, qual sessão ele apontava e qual o express-session carregou (ids
 * diferentes = sessão não encontrada no banco ou cookie com assinatura
 * inválida) e se a conexão chegou como HTTPS (sem isso o cookie `secure` não é
 * gravado).
 */
export function describeSession(req: Request): string {
  const raw = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const fromCookie = raw?.map((part) => {
    const value = decodeURIComponent(part.slice(SESSION_COOKIE.length + 1));
    return short(value.startsWith('s:') ? value.slice(2) : value);
  });
  const cookie = fromCookie?.length
    ? `cookie ${fromCookie.join(' + ')}${fromCookie.length > 1 ? ' (DUPLICADO)' : ''}`
    : 'sem cookie';
  return `${cookie}, sessão ${short(req.sessionID)}, https=${req.secure}`;
}
