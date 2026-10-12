import 'server-only';
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/notes/dates';

/**
 * Leitura e validação das variáveis de ambiente (somente no servidor). Erros listam apenas **nomes**
 * de variáveis, nunca valores. Os grupos são validados separadamente: um vault mal configurado não
 * impede o login, e vice-versa.
 */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  constructor(readonly variables: string[]) {
    super(`Configuração ausente ou inválida: ${variables.join(', ')}`);
  }
}

type Env = Record<string, string | undefined>;

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

const appSchema = z.object({
  APP_NAME: optional(z.string().max(60)).transform((v) => v ?? 'Second Brain Leandro'),
  APP_TIMEZONE: optional(z.string().refine(isValidTimeZone)).transform(
    (v) => v ?? 'America/Sao_Paulo',
  ),
});

const authSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_PASSWORD_HASH: z.string().regex(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/),
  AUTH_SESSION_TTL_HOURS: optional(z.coerce.number().int().min(1).max(720)).transform(
    (v) => v ?? 168,
  ),
  AUTH_SESSION_VERSION: optional(z.coerce.number().int().min(1)).transform((v) => v ?? 1),
  AUTH_COOKIE_SECURE: optional(z.enum(['true', 'false'])),
  NODE_ENV: z.string().optional(),
});

const vaultSchema = z.discriminatedUnion('VAULT_STORE', [
  z.object({
    VAULT_STORE: z.literal('github'),
    GITHUB_VAULT_OWNER: z.string().min(1),
    GITHUB_VAULT_REPO: z.string().min(1),
    GITHUB_VAULT_BRANCH: optional(z.string().min(1)).transform((v) => v ?? 'main'),
    GITHUB_VAULT_TOKEN: z.string().min(20),
  }),
  z.object({
    VAULT_STORE: z.literal('fs'),
    VAULT_FS_ROOT: z.string().min(1),
  }),
]);

function parse<T extends z.ZodType>(schema: T, env: Env): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? '?')))];
    throw new ConfigError(names);
  }
  return result.data;
}

export interface AppConfig {
  appName: string;
  timeZone: string;
}

export interface AuthConfig {
  secret: string;
  passwordHash: string;
  sessionTtlSeconds: number;
  sessionVersion: number;
  secureCookie: boolean;
}

export type VaultConfig =
  | { store: 'github'; owner: string; repo: string; branch: string; token: string }
  | { store: 'fs'; root: string };

export function readAppConfig(env: Env = process.env): AppConfig {
  const data = parse(appSchema, env);
  return { appName: data.APP_NAME, timeZone: data.APP_TIMEZONE };
}

export function readAuthConfig(env: Env = process.env): AuthConfig {
  const data = parse(authSchema, env);
  return {
    secret: data.AUTH_SECRET,
    passwordHash: data.AUTH_PASSWORD_HASH,
    sessionTtlSeconds: data.AUTH_SESSION_TTL_HOURS * 3600,
    sessionVersion: data.AUTH_SESSION_VERSION,
    secureCookie: data.AUTH_COOKIE_SECURE
      ? data.AUTH_COOKIE_SECURE === 'true'
      : data.NODE_ENV === 'production',
  };
}

export function readVaultConfig(env: Env = process.env): VaultConfig {
  const data = parse(vaultSchema, { ...env, VAULT_STORE: env.VAULT_STORE || 'github' });
  if (data.VAULT_STORE === 'fs') return { store: 'fs', root: data.VAULT_FS_ROOT };
  return {
    store: 'github',
    owner: data.GITHUB_VAULT_OWNER,
    repo: data.GITHUB_VAULT_REPO,
    branch: data.GITHUB_VAULT_BRANCH,
    token: data.GITHUB_VAULT_TOKEN,
  };
}
