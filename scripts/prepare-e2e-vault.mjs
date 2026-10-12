#!/usr/bin/env node
// Recria .e2e-vault/ a partir das fixtures SINTÉTICAS (tests/fixtures/vault). Nunca use o vault real.
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = `${root}.e2e-vault`;
await rm(target, { recursive: true, force: true });
await cp(`${root}tests/fixtures/vault`, target, { recursive: true });
console.log(`Vault de teste recriado em ${target}`);
