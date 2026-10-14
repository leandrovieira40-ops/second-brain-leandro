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
  constructor(
    readonly variables: string[],
    /** Diagnóstico sem o valor (tamanho, tipo de caractere inválido). */
    detail?: string,
  ) {
    super(
      `Configuração ausente ou inválida: ${variables.join(', ')}${detail ? ` (${detail})` : ''}`,
    );
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
    // `.trim()`: valores colados em painéis (Vercel) às vezes trazem espaço ou quebra de linha, e um
    // cabeçalho HTTP com esses caracteres faz o fetch falhar antes de chegar ao GitHub.
    GITHUB_VAULT_OWNER: z.string().trim().min(1),
    GITHUB_VAULT_REPO: z.string().trim().min(1),
    GITHUB_VAULT_BRANCH: optional(z.string().trim().min(1)).transform((v) => v ?? 'main'),
    GITHUB_VAULT_TOKEN: z
      .string()
      .trim()
      .min(20)
      .regex(/^[A-Za-z0-9_]+$/, 'o token do GitHub deve ter só letras, números e "_"'),
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
  const tokenProblem = describeTokenProblem(env.GITHUB_VAULT_TOKEN);
  if (tokenProblem && (env.VAULT_STORE || 'github') === 'github') {
    throw new ConfigError(['GITHUB_VAULT_TOKEN'], tokenProblem);
  }
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

const aiSchema = z.object({
  ANTHROPIC_API_KEY: optional(
    z
      .string()
      .trim()
      .min(20)
      .regex(/^[\x21-\x7e]+$/),
  ),
  AI_MODEL: optional(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9.-]+$/),
  ).transform((v) => v ?? 'claude-opus-5-5'),
});

export interface AiConfig {
  apiKey: string;
  model: string;
}

/** Chave da IA (opcional — sem ela, importar PDF fica indisponível). Só existe no servidor. */
export function readAiConfig(env: Env = process.env): AiConfig | null {
  const data = parse(aiSchema, env);
  return data.ANTHROPIC_API_KEY ? { apiKey: data.ANTHROPIC_API_KEY, model: data.AI_MODEL } : null;
}

const databaseSchema = z.object({
  DATABASE_URL: optional(z.string().regex(/^postgres(ql)?:\/\//)),
  GITHUB_WEBHOOK_SECRET: optional(z.string().min(20)),
});

/** URL do PostgreSQL do índice derivado (opcional — sem ela, busca e backlinks ficam indisponíveis). */
export function readDatabaseUrl(env: Env = process.env): string | null {
  return parse(databaseSchema, env).DATABASE_URL ?? null;
}

/** Segredo do webhook do GitHub (opcional — sem ele, o endpoint de webhook responde 404). */
export function readWebhookSecret(env: Env = process.env): string | null {
  return parse(databaseSchema, env).GITHUB_WEBHOOK_SECRET ?? null;
}

/**
 * Explica por que o token colado não é válido SEM revelá-lo: tamanho, prefixo esperado e os códigos
 * Unicode dos caracteres estranhos (ex.: espaço invisível vindo de copiar e colar).
 */
export function describeTokenProblem(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = raw.trim();
  if (value === '') return null;
  const invalid = [...new Set([...value].filter((char) => !/[A-Za-z0-9_]/.test(char)))];
  const parts: string[] = [];
  if (value.includes('=')) parts.push('contém "=" — cole só o valor, sem o nome da variável');
  if (invalid.length) {
    const codes = invalid
      .slice(0, 4)
      .map((char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
    parts.push(`caracteres inválidos ${codes.join(' ')}`);
  }
  if (parts.length === 0) return null;
  if (!/^(github_pat_|gh[pousr]_)/.test(value)) parts.push('não começa com github_pat_');
  return `${parts.join('; ')}; tamanho ${value.length} (um token fine-grained tem 93)`;
}
