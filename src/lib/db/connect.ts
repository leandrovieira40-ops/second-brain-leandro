import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/** Conexão com pool pequeno (funções serverless abrem poucas conexões; use o endpoint "pooled" do Neon). */
export function connect(url: string, max = 3): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 10_000 });
  pool.on('error', () => {
    // Conexão ociosa caiu (ex.: Neon escalou a zero). A próxima consulta abre outra.
  });
  return { db: drizzle(pool, { schema }), pool };
}
