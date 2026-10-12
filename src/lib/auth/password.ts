import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Hash de senha com scrypt (ADR-0005). Formato: `scrypt:N:r:p:<sal base64url>:<hash base64url>` —
 * sem `$`, porque o Next.js expande `$VAR` em arquivos `.env`.
 * `scripts/hash-password.mjs` gera o mesmo formato (há teste garantindo a compatibilidade).
 */
export const DEFAULT_SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 32 } as const;
export const MIN_PASSWORD_LENGTH = 12;

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

const memoryFor = (N: number, r: number) => 128 * N * r * 2;

export async function hashPassword(password: string, params = DEFAULT_SCRYPT): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFC'), salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: memoryFor(params.N, params.r),
  });
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join(':');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![N, r, p].every((n) => Number.isSafeInteger(n) && n > 0) || N > 2 ** 20 || r > 32 || p > 16)
    return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length < 8 || expected.length < 16) return false;
  const actual = await scrypt(password.normalize('NFC'), salt, expected.length, {
    N,
    r,
    p,
    maxmem: memoryFor(N, r),
  });
  return timingSafeEqual(actual, expected);
}
