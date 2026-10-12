import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';
import { SlidingWindowLimiter } from './rate-limit';
import { createSessionToken, sessionCookieName, verifySessionToken } from './session';

const settings = { secret: 'x'.repeat(48), sessionTtlSeconds: 3600, sessionVersion: 1 };
const fast = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const;

describe('senha (scrypt)', () => {
  it('verifica a senha correta e recusa as erradas', async () => {
    const hash = await hashPassword('correct horse battery staple', fast);
    expect(hash).toMatch(/^scrypt:1024:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain('$');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('usa sal aleatório e recusa formatos inválidos', async () => {
    const a = await hashPassword('mesma senha longa', fast);
    const b = await hashPassword('mesma senha longa', fast);
    expect(a).not.toBe(b);
    expect(await verifyPassword('x', 'bcrypt:abc')).toBe(false);
    expect(
      await verifyPassword('x', 'scrypt:999999999:8:1:aaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbb'),
    ).toBe(false);
  });

  it('exige no mínimo 12 caracteres', async () => {
    await expect(hashPassword('curta', fast)).rejects.toThrow(/12/);
  });

  it('é compatível com o hash gerado por scripts/hash-password.mjs', async () => {
    const output = execFileSync(process.execPath, ['scripts/hash-password.mjs'], {
      input: 'frase-senha de teste compatível',
    }).toString();
    expect(await verifyPassword('frase-senha de teste compatível', output.trim())).toBe(true);
  }, 20_000);
});

describe('sessão (JWT)', () => {
  it('aceita token válido e recusa expirado, adulterado, de outra versão ou outro segredo', async () => {
    const now = Date.UTC(2026, 9, 12);
    const token = await createSessionToken(settings, now);
    expect(await verifySessionToken(token, settings, now + 1000)).toMatchObject({
      subject: 'owner',
    });
    expect(await verifySessionToken(token, settings, now + 3601_000)).toBeNull();
    expect(await verifySessionToken(token, { ...settings, sessionVersion: 2 }, now)).toBeNull();
    expect(
      await verifySessionToken(token, { ...settings, secret: 'y'.repeat(48) }, now),
    ).toBeNull();
    const [h, p, s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'owner', ver: 1 })).toString('base64url')}.${s}`;
    expect(p).toBeTruthy();
    expect(await verifySessionToken(forged, settings, now)).toBeNull();
    expect(await verifySessionToken(undefined, settings, now)).toBeNull();
    expect(await verifySessionToken('lixo', settings, now)).toBeNull();
  });

  it('recusa alg "none"', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'owner',
        ver: 1,
        iss: 'second-brain',
        aud: 'second-brain:web',
        iat: 1,
        exp: 9e9,
      }),
    ).toString('base64url');
    expect(await verifySessionToken(`${header}.${payload}.`, settings)).toBeNull();
  });

  it('usa prefixo __Host- quando o cookie é seguro', () => {
    expect(sessionCookieName(true)).toBe('__Host-sb_session');
    expect(sessionCookieName(false)).toBe('sb_session');
  });
});

describe('SlidingWindowLimiter', () => {
  it('bloqueia após o limite e libera quando a janela passa', () => {
    const limiter = new SlidingWindowLimiter(3, 1000);
    for (let i = 0; i < 3; i++) limiter.record('ip', 100 + i);
    expect(limiter.retryAfterMs('ip', 200)).toBe(900);
    expect(limiter.retryAfterMs('outro', 200)).toBe(0);
    expect(limiter.retryAfterMs('ip', 1101)).toBe(0);
    limiter.record('ip', 1200);
    limiter.reset('ip');
    expect(limiter.retryAfterMs('ip', 1200)).toBe(0);
  });

  it('limita a memória usada', () => {
    const limiter = new SlidingWindowLimiter(1, 10_000, 2);
    limiter.record('a', 1);
    limiter.record('b', 1);
    limiter.record('c', 1);
    expect(limiter.retryAfterMs('a', 2)).toBe(0);
    expect(limiter.retryAfterMs('c', 2)).toBeGreaterThan(0);
  });
});
