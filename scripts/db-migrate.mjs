#!/usr/bin/env node
// Aplica as migrações SQL de drizzle/ no banco de DATABASE_URL. Comando EXPLÍCITO — nunca roda
// sozinho no deploy (DEPLOYMENT.md). As migrações são aditivas; o índice é reconstruível do vault.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL.');
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  });
  console.log('Migrações aplicadas.');
} catch (error) {
  console.error(`Falha ao migrar: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
