#!/usr/bin/env node
// Recria .e2e-vault/ a partir das fixtures SINTÉTICAS (tests/fixtures/vault). Nunca use o vault real.
// Com E2E_DATABASE_URL, aplica as migrações e ESVAZIA o índice desse banco — por isso o nome do banco
// precisa conter "test" ou "e2e" (proteção contra apontar para um banco de verdade por engano).
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = `${root}.e2e-vault`;
await rm(target, { recursive: true, force: true });
await cp(`${root}tests/fixtures/vault`, target, { recursive: true });
console.log(`Vault de teste recriado em ${target}`);

const url = process.env.E2E_DATABASE_URL;
if (url) {
  const name = new URL(url).pathname.slice(1);
  if (!/test|e2e/i.test(name)) {
    console.error(
      `Recusado: o banco "${name}" não parece descartável (o nome deve conter test ou e2e).`,
    );
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: `${root}drizzle` });
    await pool.query('truncate notes, links, attachments, sync_state restart identity cascade');
    console.log(`Índice de teste migrado e vazio (${name}).`);
  } finally {
    await pool.end();
  }
}
