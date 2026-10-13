import 'server-only';
import { readDatabaseUrl } from '@/lib/config/env';
import { connect, type Database } from './connect';

let cached: { url: string; db: Database } | null = null;

/** Banco do índice derivado, ou `null` se `DATABASE_URL` não estiver configurado (recursos da 2B ficam off). */
export function getDb(): Database | null {
  const url = readDatabaseUrl();
  if (!url) return null;
  if (cached?.url === url) return cached.db;
  cached = { url, db: connect(url).db };
  return cached.db;
}
