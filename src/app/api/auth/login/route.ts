import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  clientIp,
  GLOBAL_KEY,
  loginFailuresByIp,
  loginFailuresGlobal,
} from '@/lib/auth/login-limits';
import { passwordFingerprint } from '@/lib/auth/credentials';
import { getCredentials } from '@/lib/auth/current';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookieName, sessionCookieOptions } from '@/lib/auth/session';
import { readAuthConfig } from '@/lib/config/env';
import { apiError, toErrorResponse } from '@/lib/http/errors';
import { isJsonRequest, isSameOriginRequest } from '@/lib/http/origin';
import { log, pathHash } from '@/lib/log/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ password: z.string().min(1).max(1024) });
const FAILURE_DELAY_MS = 400;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return apiError(403, 'forbidden_origin', 'Origem não confirmada.');
  if (!isJsonRequest(request)) return apiError(415, 'unsupported_media_type', 'Envie JSON.');

  const ip = clientIp(request);
  const retryMs = Math.max(
    loginFailuresByIp.retryAfterMs(ip),
    loginFailuresGlobal.retryAfterMs(GLOBAL_KEY),
  );
  if (retryMs > 0) {
    const seconds = Math.ceil(retryMs / 1000);
    return apiError(
      429,
      'too_many_attempts',
      `Muitas tentativas. Tente de novo em ${Math.ceil(seconds / 60)} min.`,
      {},
      {
        'Retry-After': String(seconds),
      },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'invalid_input', 'Informe a senha.');

  try {
    const config = readAuthConfig();
    const currentHash = await getCredentials().currentHash();
    if (!(await verifyPassword(parsed.data.password, currentHash))) {
      loginFailuresByIp.record(ip);
      loginFailuresGlobal.record(GLOBAL_KEY);
      await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
      log('warn', 'auth.login_failed', { client: pathHash(ip) });
      return apiError(401, 'invalid_credentials', 'Senha incorreta.');
    }
    loginFailuresByIp.reset(ip);
    const token = await createSessionToken(config, Date.now(), passwordFingerprint(currentHash));
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(
      sessionCookieName(config.secureCookie),
      token,
      sessionCookieOptions(config.secureCookie, config.sessionTtlSeconds),
    );
    log('info', 'auth.login_succeeded');
    return response;
  } catch (error) {
    return toErrorResponse(error, 'auth.login');
  }
}
