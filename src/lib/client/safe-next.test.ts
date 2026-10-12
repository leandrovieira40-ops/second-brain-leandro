import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/note?path=a.md', '/note?path=a.md'],
    ['/', '/'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
  ])('%j → %j', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
