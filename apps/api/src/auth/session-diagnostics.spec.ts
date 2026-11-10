import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { describeSession } from './session-diagnostics.js';

const request = (cookie: string | undefined, sessionID: string, secure = true) =>
  ({ headers: cookie ? { cookie } : {}, sessionID, secure }) as unknown as Request;

describe('describeSession', () => {
  it('mostra só o começo dos ids, nunca o cookie inteiro', () => {
    const text = describeSession(
      request('outro=1; meu_caixa_sid=s%3AabcdefGHIJKL.assinatura%2Bsecreta', 'abcdefGHIJKL'),
    );
    expect(text).toBe('cookie abcdef…, sessão abcdef…, https=true');
    expect(text).not.toContain('assinatura');
    expect(text).not.toContain('GHIJKL');
  });

  it('sem cookie e conexão sem HTTPS', () => {
    expect(describeSession(request(undefined, 'novaSessao123', false))).toBe(
      'sem cookie, sessão novaSe…, https=false',
    );
  });

  it('acusa cookie duplicado', () => {
    expect(
      describeSession(
        request('meu_caixa_sid=s%3Aaaaaaa1.x; meu_caixa_sid=s%3Abbbbbb2.y', 'aaaaaa1'),
      ),
    ).toBe('cookie aaaaaa… + bbbbbb… (DUPLICADO), sessão aaaaaa…, https=true');
  });
});
