import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { guardApi } from '@/lib/auth/guard';
import { log } from '@/lib/log/logger';
import { apiError, toErrorResponse } from './errors';

const noStore = { 'Cache-Control': 'no-store' };

/**
 * Route Handler padronizado: sessão + (para mutações) origem e JSON, validação Zod da entrada,
 * erros convertidos em respostas seguras e duração registrada sem conteúdo.
 */
export function route<Schema extends z.ZodType>(
  config: { operation: string; mutation: boolean; schema: Schema; source: 'body' | 'query' },
  handler: (input: z.infer<Schema>) => Promise<unknown>,
  status = 200,
) {
  return async (request: Request) => {
    const denied = await guardApi(request, { mutation: config.mutation });
    if (denied) return denied;
    const raw =
      config.source === 'query'
        ? Object.fromEntries(new URL(request.url).searchParams)
        : await request.json().catch(() => null);
    const parsed = config.schema.safeParse(raw);
    if (!parsed.success) return apiError(400, 'invalid_input', 'Dados inválidos.');
    const started = Date.now();
    try {
      const result = await handler(parsed.data);
      log('info', config.operation, { ms: Date.now() - started });
      return NextResponse.json(result ?? { ok: true }, { status, headers: noStore });
    } catch (error) {
      return toErrorResponse(error, config.operation);
    }
  };
}
