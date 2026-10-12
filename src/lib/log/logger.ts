import { createHash, randomUUID } from 'node:crypto';

/**
 * Logger estruturado (JSON por linha). Política (SECURITY.md §4): nunca registrar conteúdo de notas,
 * títulos, corpo de requisições, cookies, tokens ou respostas de provedores. Caminhos só como hash.
 */
type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

export function log(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else process.stdout.write(`${line}\n`);
}

/** Hash curto e estável para correlacionar operações sem revelar o caminho da nota. */
export function pathHash(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 12);
}

export function correlationId(): string {
  return randomUUID();
}
