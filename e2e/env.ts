import { scryptSync, randomBytes } from 'node:crypto';
import path from 'node:path';

/** Ambiente do servidor de teste. Segredos são FICTÍCIOS e só existem durante os testes. */
const PASSWORD = 'frase-senha de teste ponta a ponta';
const N = 2 ** 14;
const salt = randomBytes(16);
const key = scryptSync(PASSWORD.normalize('NFC'), salt, 32, {
  N,
  r: 8,
  p: 1,
  maxmem: 128 * N * 8 * 2,
});
const port = Number(process.env.E2E_PORT ?? 3100);

export const E2E = {
  port,
  baseURL: `http://localhost:${port}`,
  password: PASSWORD,
  vaultRoot: path.resolve(__dirname, '..', '.e2e-vault'),
  authSecret: 'segredo-ficticio-de-sessao-para-testes-e2e-0123456789',
  get serverEnv(): Record<string, string> {
    return {
      NODE_ENV: 'production',
      APP_NAME: 'Second Brain (teste)',
      APP_TIMEZONE: 'America/Sao_Paulo',
      AUTH_SECRET: this.authSecret,
      AUTH_PASSWORD_HASH: `scrypt:${N}:8:1:${salt.toString('base64url')}:${key.toString('base64url')}`,
      VAULT_STORE: 'fs',
      VAULT_FS_ROOT: this.vaultRoot,
      NEXT_TELEMETRY_DISABLED: '1',
    };
  },
};
