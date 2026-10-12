import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifica `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com o segredo do webhook). */
export function verifyGitHubSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex'),
    'utf8',
  );
  const received = Buffer.from(header.slice('sha256='.length), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
