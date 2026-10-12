import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Verificação pública mínima: não revela configuração nem estado do vault. */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
