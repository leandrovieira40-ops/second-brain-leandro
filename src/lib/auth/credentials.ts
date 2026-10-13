import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '@/lib/db/connect';
import { authCredentials } from '@/lib/db/schema';
import { UnsupportedOperationError } from '@/lib/vault/errors';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './password';

/** Senha atual errada na troca (resposta 401, conta como tentativa de login). */
export class WrongPasswordError extends Error {
  override readonly name = 'WrongPasswordError';
}

/** Senha nova recusada (curta demais, igual à atual, confirmação diferente). */
export class WeakPasswordError extends Error {
  override readonly name = 'WeakPasswordError';
}

/**
 * Impressão digital do hash da senha, gravada na sessão (`pv`). Trocar a senha muda o hash e, com
 * ele, invalida todas as sessões abertas — exceto a nova, emitida na própria troca.
 */
export function passwordFingerprint(hash: string): string {
  return createHash('sha256').update(hash).digest('base64url').slice(0, 22);
}

const CACHE_MS = 5_000;

/**
 * Onde está o hash da senha: no banco, depois que a senha foi trocada pela aplicação; senão, em
 * `AUTH_PASSWORD_HASH`. Lido a cada requisição (com cache curto) para que a troca valha em todas as
 * instâncias em segundos.
 */
export class Credentials {
  private cache: { hash: string; at: number } | null = null;

  constructor(
    private readonly db: Database | null,
    private readonly envHash: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get canChange(): boolean {
    return this.db !== null;
  }

  /** `fresh`: ignora o cache (ex.: sessão emitida por outra instância logo após uma troca). */
  async currentHash({ fresh = false } = {}): Promise<string> {
    if (!this.db) return this.envHash;
    if (!fresh && this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.hash;
    // Uma falha do banco aqui propaga: voltar para a senha antiga (da Vercel) seria inseguro.
    let row: { hash: string } | undefined;
    try {
      [row] = await this.db
        .select({ hash: authCredentials.passwordHash })
        .from(authCredentials)
        .where(eq(authCredentials.id, 1));
    } catch (error) {
      // Tabela ainda não criada (migração 0004 pendente): a senha só pode estar na variável.
      if (!isUndefinedTable(error)) throw error;
    }
    const hash = row?.hash ?? this.envHash;
    this.cache = { hash, at: this.now() };
    return hash;
  }

  /** Troca a senha e devolve o novo hash. Exige a senha atual. */
  async change(currentPassword: string, newPassword: string): Promise<string> {
    if (!this.db) {
      throw new UnsupportedOperationError(
        'Trocar a senha pelo aplicativo precisa do banco (DATABASE_URL). Sem ele, troque AUTH_PASSWORD_HASH na Vercel.',
      );
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new WeakPasswordError(
        `A senha nova precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      );
    }
    this.cache = null;
    const current = await this.currentHash();
    if (!(await verifyPassword(currentPassword, current))) {
      throw new WrongPasswordError('A senha atual está incorreta.');
    }
    if (await verifyPassword(newPassword, current)) {
      throw new WeakPasswordError('A senha nova precisa ser diferente da atual.');
    }
    const hash = await hashPassword(newPassword);
    await this.db
      .insert(authCredentials)
      .values({ id: 1, passwordHash: hash, changedAt: new Date() })
      .onConflictDoUpdate({
        target: authCredentials.id,
        set: { passwordHash: hash, changedAt: new Date() },
      });
    this.cache = { hash, at: this.now() };
    return hash;
  }
}

function isUndefinedTable(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '42P01') return true;
  }
  return false;
}
