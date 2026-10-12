import { jwtVerify, SignJWT } from 'jose';

/** Sessão sem estado: JWT HS256 com versão global para revogação (ADR-0005). */
export interface SessionSettings {
  secret: string;
  sessionTtlSeconds: number;
  sessionVersion: number;
}

export interface Session {
  subject: 'owner';
  issuedAt: number;
  expiresAt: number;
}

const ISSUER = 'second-brain';
const AUDIENCE = 'second-brain:web';
const key = (secret: string) => new TextEncoder().encode(secret);

export async function createSessionToken(
  settings: SessionSettings,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  return new SignJWT({ ver: settings.sessionVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('owner')
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + settings.sessionTtlSeconds)
    .setJti(crypto.randomUUID())
    .sign(key(settings.secret));
}

export async function verifySessionToken(
  token: string | undefined,
  settings: SessionSettings,
  now = Date.now(),
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(settings.secret), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: 'owner',
      currentDate: new Date(now),
    });
    if (payload.ver !== settings.sessionVersion) return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return { subject: 'owner', issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookieName(secure: boolean): string {
  // `__Host-` exige Secure, Path=/ e nenhum Domain: o cookie não vaza para subdomínios.
  return secure ? '__Host-sb_session' : 'sb_session';
}

export function sessionCookieOptions(secure: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
