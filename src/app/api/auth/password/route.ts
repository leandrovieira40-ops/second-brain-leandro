import { NextResponse } from 'next/server';
import { z } from 'zod';
import { passwordFingerprint, WeakPasswordError, WrongPasswordError } from '@/lib/auth/credentials';
import { getCredentials } from '@/lib/auth/current';
import { guardApi } from '@/lib/auth/guard';
import { clientIp, loginFailuresByIp } from '@/lib/auth/login-limits';
import { createSessionToken, sessionCookieName, sessionCookieOptions } from '@/lib/auth/session';
import { readAuthConfig } from '@/lib/config/env';
import { apiError, toErrorResponse } from '@/lib/http/errors';
import { log } from '@/lib/log/logger';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(1).max(1024),
});

/**
 * Troca a senha (exige a atual). Todas as outras sessões deixam de valer na hora; esta recebe uma
 * sessão nova, para o usuário continuar conectado neste aparelho.
 */
export async function POST(request: Request) {
  const denied = await guardApi(request, { mutation: true });
  if (denied) return denied;

  const ip = clientIp(request);
  const retryMs = loginFailuresByIp.retryAfterMs(ip);
  if (retryMs > 0) {
    return apiError(
      429,
      'too_many_attempts',
      `Muitas tentativas. Tente de novo em ${Math.ceil(retryMs / 60_000)} min.`,
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'invalid_input', 'Preencha a senha atual e a nova.');

  try {
    const hash = await getCredentials().change(
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    loginFailuresByIp.reset(ip);
    const config = readAuthConfig();
    const token = await createSessionToken(config, Date.now(), passwordFingerprint(hash));
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(
      sessionCookieName(config.secureCookie),
      token,
      sessionCookieOptions(config.secureCookie, config.sessionTtlSeconds),
    );
    log('info', 'auth.password_changed');
    return response;
  } catch (error) {
    if (error instanceof WrongPasswordError) {
      loginFailuresByIp.record(ip);
      log('warn', 'auth.password_change_rejected');
      return apiError(401, 'invalid_credentials', error.message);
    }
    if (error instanceof WeakPasswordError) return apiError(400, 'weak_password', error.message);
    return toErrorResponse(error, 'auth.password');
  }
}
