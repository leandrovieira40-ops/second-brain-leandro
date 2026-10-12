#!/usr/bin/env node
// Gera o valor de AUTH_PASSWORD_HASH (formato de src/lib/auth/password.ts — há teste de compatibilidade).
// Uso interativo:  npm run hash-password
// Uso em pipe:     printf '%s' 'minha frase-senha longa' | npm run --silent hash-password
import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout, stderr, exit } from 'node:process';

const MIN_LENGTH = 12;
const N = 2 ** 15;
const r = 8;
const p = 1;

function readHidden(prompt) {
  return new Promise((resolve) => {
    stderr.write(prompt);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stderr.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        exit(130);
      } else if (char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPiped() {
  let data = '';
  for await (const chunk of stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

let password;
if (stdin.isTTY) {
  password = await readHidden('Frase-senha: ');
  const confirm = await readHidden('Confirme: ');
  if (password !== confirm) {
    stderr.write('As senhas não conferem.\n');
    exit(1);
  }
} else {
  password = await readPiped();
}

if (password.length < MIN_LENGTH) {
  stderr.write(
    `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres (recomendado: 5+ palavras).\n`,
  );
  exit(1);
}

const salt = randomBytes(16);
const key = scryptSync(password.normalize('NFC'), salt, 32, { N, r, p, maxmem: 128 * N * r * 2 });
stdout.write(`scrypt:${N}:${r}:${p}:${salt.toString('base64url')}:${key.toString('base64url')}\n`);
