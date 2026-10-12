#!/usr/bin/env node
// Verifica que nenhum segredo do servidor foi parar nos arquivos enviados ao navegador (.next/static).
// Uso: rode após `next build` com segredos fictícios definidos nas variáveis abaixo.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const names = [
  'AUTH_SECRET',
  'AUTH_PASSWORD_HASH',
  'GITHUB_VAULT_TOKEN',
  'DATABASE_URL',
  'GITHUB_WEBHOOK_SECRET',
];
const secrets = names
  .map((name) => [name, process.env[name]])
  .filter(([, value]) => value && value.length >= 16);
if (secrets.length === 0) {
  console.error(
    'Defina ao menos um segredo fictício (AUTH_SECRET, AUTH_PASSWORD_HASH, GITHUB_VAULT_TOKEN).',
  );
  process.exit(2);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let leaks = 0;
let files = 0;
for await (const file of walk('.next/static')) {
  files++;
  const text = await readFile(file, 'utf8');
  for (const [name, value] of secrets) {
    if (text.includes(value)) {
      console.error(`VAZAMENTO: ${name} encontrado em ${file}`);
      leaks++;
    }
  }
}
if (files === 0) {
  console.error('Nenhum arquivo em .next/static — rode `next build` antes.');
  process.exit(2);
}
console.log(`${files} arquivos do cliente verificados; ${leaks} vazamento(s).`);
process.exit(leaks ? 1 : 0);
