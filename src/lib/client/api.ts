import type { SaveOutcome } from '@/lib/editor/save-controller';

/** Chamadas do navegador para a API. Nunca carrega segredos: a sessão vai no cookie httpOnly. */
interface ApiErrorBody {
  error?: { code?: string; message?: string; currentSha?: string | null };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  throw new ApiError(
    response.status,
    body.error?.code ?? 'http_error',
    body.error?.message ?? `Erro HTTP ${response.status}.`,
  );
}

export interface NoteDto {
  path: string;
  content: string;
  sha: string;
}

export function readNote(path: string): Promise<NoteDto> {
  return request<NoteDto>(`/api/notes/file?path=${encodeURIComponent(path)}`);
}

export function createNote(input: { title: string; folder: string; type: string }) {
  return request<{ path: string; sha: string }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ mode: 'new', ...input }),
  });
}

export function createConflictCopy(input: { sourcePath: string; content: string }) {
  return request<{ path: string; sha: string }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ mode: 'conflict-copy', ...input }),
  });
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', body: '{}' });
}

/** PUT da nota traduzido para o resultado que o `SaveController` entende. Falha de rede lança. */
export async function saveNote(input: {
  path: string;
  content: string;
  expectedSha: string;
}): Promise<SaveOutcome> {
  const body = JSON.stringify(input);
  const response = await fetch('/api/notes/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    // `keepalive` permite concluir ao fechar a aba, mas só aceita corpos pequenos (~64 KB).
    keepalive: body.length < 60_000,
  });
  if (response.ok) {
    const result = (await response.json()) as { sha: string };
    return { kind: 'saved', sha: result.sha };
  }
  const error = ((await response.json().catch(() => ({}))) as ApiErrorBody).error ?? {};
  const message = error.message ?? `Erro HTTP ${response.status}.`;
  if (response.status === 409 && error.code === 'conflict') {
    return { kind: 'conflict', currentSha: error.currentSha ?? null, message };
  }
  if (response.status === 404) {
    return {
      kind: 'conflict',
      currentSha: null,
      message: 'A nota foi removida ou movida no vault.',
    };
  }
  if (response.status === 401) {
    return {
      kind: 'error',
      retryable: false,
      message:
        'Sessão expirada. Entre novamente em outra aba — o texto continua guardado neste navegador.',
    };
  }
  const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
  return { kind: 'error', retryable, message };
}
