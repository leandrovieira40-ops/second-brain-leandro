import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/auth/guard';
import { apiError, toErrorResponse } from '@/lib/http/errors';
import { saveNoteSchema } from '@/lib/http/notes-schemas';
import { log, pathHash } from '@/lib/log/logger';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

/** Lê uma nota: conteúdo bruto (com frontmatter) e SHA atual. */
export async function GET(request: Request) {
  const denied = await guardApi(request, { mutation: false });
  if (denied) return denied;
  const path = new URL(request.url).searchParams.get('path');
  if (!path) return apiError(400, 'invalid_input', 'Informe o caminho da nota.');
  try {
    return NextResponse.json(await getNotesService().read(path), { headers: noStore });
  } catch (error) {
    return toErrorResponse(error, 'notes.read');
  }
}

/** Salva uma nota existente com controle de concorrência (SHA esperado). */
export async function PUT(request: Request) {
  const denied = await guardApi(request, { mutation: true });
  if (denied) return denied;
  const parsed = saveNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'invalid_input', 'Dados de gravação inválidos.');

  const started = Date.now();
  try {
    const result = await getNotesService().save(parsed.data);
    log('info', 'notes.save', {
      path: pathHash(result.path),
      alreadyApplied: result.alreadyApplied,
      ms: Date.now() - started,
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    log('info', 'notes.save_rejected', {
      path: pathHash(parsed.data.path),
      errorClass: error instanceof Error ? error.name : 'unknown',
      ms: Date.now() - started,
    });
    return toErrorResponse(error, 'notes.save');
  }
}
