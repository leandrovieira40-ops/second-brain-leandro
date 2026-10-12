import { after, NextResponse } from 'next/server';
import { readVaultConfig, readWebhookSecret } from '@/lib/config/env';
import { verifyGitHubSignature } from '@/lib/http/webhook';
import { log } from '@/lib/log/logger';
import { getNoteIndex } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Webhook `push` do repositório do vault (mudanças feitas fora da aplicação, ex.: Obsidian).
 * Público, mas só age com assinatura HMAC válida; sem segredo configurado, responde 404.
 * A resposta é imediata; a sincronização roda depois (`after`).
 */
export async function POST(request: Request) {
  const secret = readWebhookSecret();
  if (!secret) return new NextResponse(null, { status: 404 });
  const body = await request.text();
  if (!verifyGitHubSignature(body, request.headers.get('x-hub-signature-256'), secret)) {
    log('warn', 'webhook.bad_signature');
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }
  const event = request.headers.get('x-github-event');
  if (event === 'ping') return NextResponse.json({ ok: true });
  if (event !== 'push') return NextResponse.json({ ignored: event }, { status: 202 });

  let ref: unknown;
  try {
    ref = (JSON.parse(body) as { ref?: unknown }).ref;
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }
  const config = readVaultConfig();
  const branch = config.store === 'github' ? config.branch : null;
  if (ref !== `refs/heads/${branch}`)
    return NextResponse.json({ ignored: 'outro branch' }, { status: 202 });

  const index = getNoteIndex();
  if (!index) return NextResponse.json({ ignored: 'índice não configurado' }, { status: 202 });
  after(async () => {
    const started = Date.now();
    try {
      const result = await index.sync();
      log('info', 'webhook.sync', { ...result, ms: Date.now() - started });
    } catch (error) {
      log('error', 'webhook.sync_failed', {
        errorClass: error instanceof Error ? error.name : 'unknown',
      });
      await index
        .recordError('Falha ao sincronizar após push; rode "Sincronizar índice".')
        .catch(() => undefined);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
