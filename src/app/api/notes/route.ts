import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/auth/guard';
import { apiError, toErrorResponse } from '@/lib/http/errors';
import { createNoteSchema } from '@/lib/http/notes-schemas';
import { log, pathHash } from '@/lib/log/logger';
import { getNotesService } from '@/lib/services';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

/** Árvore do vault (notas, pastas, anexos). */
export async function GET(request: Request) {
  const denied = await guardApi(request, { mutation: false });
  if (denied) return denied;
  try {
    return NextResponse.json(await getNotesService().tree(), { headers: noStore });
  } catch (error) {
    return toErrorResponse(error, 'notes.tree');
  }
}

/** Cria uma nota nova a partir de template, ou uma cópia de conflito. Nunca sobrescreve. */
export async function POST(request: Request) {
  const denied = await guardApi(request, { mutation: true });
  if (denied) return denied;
  const parsed = createNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'invalid_input', 'Dados da nota inválidos.');

  const started = Date.now();
  try {
    const service = getNotesService();
    const input = parsed.data;
    const result =
      input.mode === 'new'
        ? await service.create({ title: input.title, folder: input.folder, type: input.type })
        : input.mode === 'capture'
          ? await service.capture(input.text)
          : await service.createConflictCopy({
              sourcePath: input.sourcePath,
              content: input.content,
            });
    log('info', 'notes.create', {
      mode: input.mode,
      path: pathHash(result.path),
      ms: Date.now() - started,
    });
    return NextResponse.json(
      { path: result.path, sha: result.sha },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    return toErrorResponse(error, 'notes.create');
  }
}
