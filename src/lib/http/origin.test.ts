import { describe, expect, it } from 'vitest';
import { isJsonRequest, isSameOriginRequest } from './origin';

const req = (headers: Record<string, string>) =>
  new Request('https://app.example.com/api/notes', { method: 'POST', headers });

describe('isSameOriginRequest', () => {
  it('usa Sec-Fetch-Site quando presente', () => {
    expect(isSameOriginRequest(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(
      isSameOriginRequest(
        req({ 'sec-fetch-site': 'cross-site', origin: 'https://app.example.com' }),
      ),
    ).toBe(false);
    expect(isSameOriginRequest(req({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });

  it('senão compara Origin com o host (inclusive atrás de proxy)', () => {
    expect(
      isSameOriginRequest(req({ origin: 'https://app.example.com', host: 'app.example.com' })),
    ).toBe(true);
    expect(
      isSameOriginRequest(req({ origin: 'https://evil.example', host: 'app.example.com' })),
    ).toBe(false);
    expect(
      isSameOriginRequest(
        req({
          origin: 'https://app.example.com',
          host: 'interno',
          'x-forwarded-host': 'app.example.com',
        }),
      ),
    ).toBe(true);
    expect(isSameOriginRequest(req({ host: 'app.example.com' }))).toBe(false);
    expect(isSameOriginRequest(req({ origin: 'null', host: 'app.example.com' }))).toBe(false);
  });
});

describe('isJsonRequest', () => {
  it('exige application/json', () => {
    expect(isJsonRequest(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(isJsonRequest(req({ 'content-type': 'text/plain' }))).toBe(false);
    expect(isJsonRequest(req({}))).toBe(false);
  });
});
