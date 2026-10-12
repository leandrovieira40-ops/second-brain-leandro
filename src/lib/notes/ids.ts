/** ULID (https://github.com/ulid/spec): 48 bits de tempo em ms + 80 bits aleatórios, base32 Crockford. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 2 ** 48 - 1) {
    throw new RangeError('timestamp fora do intervalo do ULID');
  }
  let time = '';
  let remaining = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  // 80 bits → 16 caracteres de 5 bits.
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let random = '';
  for (let i = 0; i < 16; i++) {
    random = ALPHABET[Number(bits & 31n)] + random;
    bits >>= 5n;
  }
  return time + random;
}

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

/** Instante de criação codificado no ULID. */
export function ulidTime(id: string): number {
  let time = 0;
  for (const char of id.slice(0, 10)) time = time * 32 + ALPHABET.indexOf(char);
  return time;
}
