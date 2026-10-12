import { describe, expect, it } from 'vitest';
import { isUlid, ulid, ulidTime } from './ids';

describe('ulid', () => {
  it('gera 26 caracteres válidos e codifica o tempo', () => {
    const now = Date.UTC(2026, 9, 12, 18, 30);
    const id = ulid(now);
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
    expect(ulidTime(id)).toBe(now);
  });

  it('é ordenável pelo tempo e único', () => {
    const a = ulid(1_000);
    const b = ulid(2_000);
    expect(a < b).toBe(true);
    const many = new Set(Array.from({ length: 1000 }, () => ulid(5_000)));
    expect(many.size).toBe(1000);
  });

  it('rejeita timestamps inválidos', () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(isUlid('01K7DQ2VQ8M6Z4X0R1S2T3V4WU')).toBe(false); // U não existe no alfabeto
  });
});
