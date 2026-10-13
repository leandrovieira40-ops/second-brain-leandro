import 'server-only';
import { readAuthConfig } from '@/lib/config/env';
import { getDb } from '@/lib/db';
import { Credentials, passwordFingerprint } from './credentials';
import { verifySessionToken, type Session, type SessionSettings } from './session';

let cached: { key: string; credentials: Credentials } | null = null;

/** Credenciais vigentes (banco, se a senha já foi trocada pelo app; senão, a variável de ambiente). */
export function getCredentials(): Credentials {
  const { passwordHash } = readAuthConfig();
  let db: ReturnType<typeof getDb> = null;
  try {
    db = getDb();
  } catch {
    // DATABASE_URL inválida não pode derrubar o login: a senha da variável continua valendo.
  }
  const key = `${passwordHash}|${db ? 'db' : 'env'}`;
  if (cached?.key !== key) cached = { key, credentials: new Credentials(db, passwordHash) };
  return cached.credentials;
}

/**
 * Verifica a sessão contra a senha vigente. Se não bater, relê a senha sem cache antes de recusar:
 * uma troca feita há pouco (talvez em outra instância) emite sessões que o cache ainda não conhece.
 */
export async function verifyCurrentSession(
  token: string | undefined,
  settings: SessionSettings,
): Promise<Session | null> {
  // Assinatura, validade e versão primeiro: cookie inválido nunca chega a consultar o banco.
  if (!(await verifySessionToken(token, settings))) return null;
  const credentials = getCredentials();
  const cached = passwordFingerprint(await credentials.currentHash());
  const session = await verifySessionToken(token, settings, Date.now(), cached);
  if (session) return session;
  const fresh = passwordFingerprint(await credentials.currentHash({ fresh: true }));
  return fresh === cached ? null : verifySessionToken(token, settings, Date.now(), fresh);
}
