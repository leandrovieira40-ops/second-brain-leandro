import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGitHubSignature } from './webhook';

const secret = 'segredo-do-webhook-de-teste-123';
const sign = (body: string, key = secret) =>
  `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;

describe('verifyGitHubSignature', () => {
  it('aceita a assinatura correta e recusa qualquer outra', () => {
    const body = '{"ref":"refs/heads/main"}';
    expect(verifyGitHubSignature(body, sign(body), secret)).toBe(true);
    expect(verifyGitHubSignature(`${body} `, sign(body), secret)).toBe(false);
    expect(verifyGitHubSignature(body, sign(body, 'outro-segredo-qualquer-123'), secret)).toBe(
      false,
    );
    expect(verifyGitHubSignature(body, null, secret)).toBe(false);
    expect(verifyGitHubSignature(body, 'sha1=abc', secret)).toBe(false);
    expect(verifyGitHubSignature(body, 'sha256=curto', secret)).toBe(false);
  });
});
