import { NextResponse } from 'next/server';
import { InvalidTitleError } from '@/lib/notes/filename';
import { ConfigError } from '@/lib/config/env';
import { ConflictError, VaultError, VaultRateLimitedError } from '@/lib/vault/errors';
import { InvalidPathError } from '@/lib/vault/paths';
import { correlationId, log } from '@/lib/log/logger';

export interface ApiErrorBody {
  error: { code: string; message: string; correlationId?: string; currentSha?: string | null };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra: Partial<ApiErrorBody['error']> = {},
  headers?: HeadersInit,
) {
  return NextResponse.json<ApiErrorBody>(
    { error: { code, message, ...extra } },
    { status, headers },
  );
}

const STATUS_BY_CODE: Record<VaultError['code'], number> = {
  not_found: 404,
  already_exists: 409,
  conflict: 409,
  rate_limited: 503,
  unavailable: 503,
  misconfigured: 500,
  unsupported_content: 415,
  unsupported_operation: 501,
  too_large: 413,
};

/** Converte erros conhecidos em respostas seguras; o resto vira 500 genérico com ID de correlação. */
export function toErrorResponse(error: unknown, operation: string) {
  if (error instanceof InvalidPathError || error instanceof InvalidTitleError) {
    return apiError(400, 'invalid_input', error.message);
  }
  if (error instanceof ConflictError) {
    return apiError(409, 'conflict', error.message, { currentSha: error.currentSha });
  }
  if (error instanceof VaultRateLimitedError) {
    const headers = error.retryAfterSeconds
      ? { 'Retry-After': String(error.retryAfterSeconds) }
      : undefined;
    return apiError(503, error.code, error.message, {}, headers);
  }
  if (error instanceof VaultError) {
    if (error.code === 'misconfigured' || error.code === 'unavailable') {
      log('warn', `${operation}.failed`, { code: error.code, errorClass: error.name });
    }
    return apiError(STATUS_BY_CODE[error.code], error.code, error.message);
  }
  if (error instanceof ConfigError) {
    log('error', `${operation}.config_error`, { variables: error.variables.join(',') });
    return apiError(500, 'misconfigured', error.message);
  }
  const id = correlationId();
  log('error', `${operation}.unexpected`, {
    correlationId: id,
    errorClass: error instanceof Error ? error.name : typeof error,
  });
  return apiError(
    500,
    'internal',
    'Erro inesperado. Nada foi alterado além do que já foi confirmado.',
    {
      correlationId: id,
    },
  );
}
