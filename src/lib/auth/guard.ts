import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readAuthConfig } from '@/lib/config/env';
import { apiError } from '@/lib/http/errors';
import { isJsonRequest, isSameOriginRequest } from '@/lib/http/origin';
import { sessionCookieName, verifySessionToken, type Session } from './session';

/**
 * Verificação de sessão em cada página, layout e Route Handler — além do `proxy.ts`
 * (defesa em profundidade, ADR-0005).
 */
export async function getSession(): Promise<Session | null> {
  const config = readAuthConfig();
  const store = await cookies();
  return verifySessionToken(store.get(sessionCookieName(config.secureCookie))?.value, config);
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Para Route Handlers: devolve uma resposta de erro, ou `null` se a requisição pode seguir. */
export async function guardApi(request: Request, { mutation }: { mutation: boolean }) {
  if (mutation) {
    if (!isSameOriginRequest(request)) {
      return apiError(403, 'forbidden_origin', 'Requisição bloqueada: origem não confirmada.');
    }
    if (!isJsonRequest(request)) {
      return apiError(
        415,
        'unsupported_media_type',
        'Envie JSON (Content-Type: application/json).',
      );
    }
  }
  const session = await getSession();
  if (!session)
    return apiError(401, 'unauthenticated', 'Sessão ausente ou expirada. Entre novamente.');
  return null;
}
