import type { RequestHandler } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF por checagem de Origin: com autenticação por cookie, outro
 * site poderia disparar requisições mutantes autenticadas. Browsers sempre
 * mandam `Origin` nesses casos — basta recusar origens fora da lista.
 * Requisições sem Origin (curl, servidor a servidor) não carregam o cookie de
 * um browser, então CSRF não se aplica.
 */
export function csrfOriginCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((origin) => new URL(origin).origin));

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) return next();
    res.status(403).json({ statusCode: 403, message: 'Origem não permitida' });
  };
}
