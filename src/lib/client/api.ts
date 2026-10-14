import type { PdfImportInput } from '@/lib/import/pdf-note';
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

export interface TrashItemDto {
  path: string;
  originalPath: string;
  sha: string;
  size: number;
}

export interface CommitDto {
  sha: string;
  message: string;
  date: string;
  author: string | null;
}

export function captureNote(text: string, title?: string) {
  return request<{ path: string; sha: string }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify({ mode: 'capture', text, title }),
  });
}

export function trashNote(input: { path: string; expectedSha: string }) {
  return request<{ trashPath: string }>('/api/notes/trash', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listTrash() {
  return request<{ items: TrashItemDto[] }>('/api/trash');
}

export function restoreFromTrash(trashPath: string) {
  return request<{ path: string }>('/api/trash/restore', {
    method: 'POST',
    body: JSON.stringify({ trashPath }),
  });
}

export function purgeFromTrash(input: { trashPath: string; expectedSha: string }) {
  return request<{ ok: true }>('/api/trash/purge', { method: 'POST', body: JSON.stringify(input) });
}

export function noteHistory(path: string) {
  return request<{ supported: boolean; commits: CommitDto[] }>(
    `/api/notes/history?path=${encodeURIComponent(path)}`,
  );
}

export function readVersion(path: string, commit: string) {
  return request<NoteDto>(
    `/api/notes/version?path=${encodeURIComponent(path)}&commit=${encodeURIComponent(commit)}`,
  );
}

export function restoreVersion(input: { path: string; commitSha: string; expectedSha: string }) {
  return request<NoteDto>('/api/notes/version', { method: 'POST', body: JSON.stringify(input) });
}

export function setFavorite(path: string, favorite: boolean) {
  return request<{ notes: string[] }>('/api/favorites', {
    method: 'PUT',
    body: JSON.stringify({ path, favorite }),
  });
}

// --- Índice derivado (Fase 2B) --------------------------------------------------------------

export interface SearchHitDto {
  path: string;
  title: string;
  type: string;
  tags: string[];
  /** Trecho com os termos entre \u0002 e \u0003 (texto puro; nunca HTML). */
  snippet: string;
  rank: number;
}

export function searchNotes(
  params: { q: string; tag?: string; type?: string; folder?: string; limit?: number },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return request<{ available: boolean; hits: SearchHitDto[] }>(`/api/search?${query}`, { signal });
}

export interface BacklinkDto {
  sourcePath: string;
  sourceTitle: string;
  line: number;
  context: string;
}

export function noteBacklinks(path: string, signal?: AbortSignal) {
  return request<{ available: boolean; backlinks: BacklinkDto[] }>(
    `/api/notes/backlinks?path=${encodeURIComponent(path)}`,
    { signal },
  );
}

export interface RecentNoteDto {
  path: string;
  title: string;
  type: string;
  tags: string[];
  excerpt: string;
  date: string | null;
}

export function recentNotes(signal?: AbortSignal) {
  return request<{ available: boolean; notes: RecentNoteDto[] }>('/api/notes/recent', { signal });
}

export function importPdf(input: PdfImportInput) {
  return request<{ path: string; sha: string }>('/api/import/pdf', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listTags() {
  return request<{ available: boolean; tags: { tag: string; count: number }[] }>('/api/tags');
}

export type IndexStatusDto =
  | { available: false }
  | {
      available: true;
      noteCount: number;
      indexedAt: string | null;
      lastError: string | null;
      brokenLinks: { sourcePath: string; targetRaw: string; line: number }[];
      orphans: string[];
    };

export function indexStatus() {
  return request<IndexStatusDto>('/api/index');
}

export function syncIndex() {
  return request<{ added: number; updated: number; removed: number; total: number }>(
    '/api/index/sync',
    { method: 'POST', body: '{}' },
  );
}

export function renameNote(input: {
  path: string;
  expectedSha: string;
  title: string;
  folder: string;
}) {
  return request<{ path: string; sha: string; updatedNotes: string[] }>('/api/notes/rename', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return request<{ ok: true }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface GraphDto {
  available: boolean;
  nodes: { path: string; title: string; tags: string[] }[];
  edges: { source: string; target: string }[];
}

export function noteGraph(signal?: AbortSignal) {
  return request<GraphDto>('/api/graph', { signal });
}
