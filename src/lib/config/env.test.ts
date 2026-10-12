import { describe, expect, it } from 'vitest';
import { ConfigError, readAppConfig, readAuthConfig, readVaultConfig } from './env';

const hash = 'scrypt:32768:8:1:c2FsdHNhbHRzYWx0:aGFzaGhhc2hoYXNoaGFzaGhhc2g';

describe('readAuthConfig', () => {
  it('aplica padrões e cookie seguro em produção', () => {
    const config = readAuthConfig({
      AUTH_SECRET: 's'.repeat(32),
      AUTH_PASSWORD_HASH: hash,
      NODE_ENV: 'production',
    });
    expect(config).toMatchObject({
      sessionTtlSeconds: 168 * 3600,
      sessionVersion: 1,
      secureCookie: true,
    });
    expect(
      readAuthConfig({
        AUTH_SECRET: 's'.repeat(32),
        AUTH_PASSWORD_HASH: hash,
        NODE_ENV: 'development',
      }).secureCookie,
    ).toBe(false);
    expect(
      readAuthConfig({
        AUTH_SECRET: 's'.repeat(32),
        AUTH_PASSWORD_HASH: hash,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'false',
      }).secureCookie,
    ).toBe(false);
  });

  it('lista apenas os nomes das variáveis inválidas, nunca valores', () => {
    const error = (() => {
      try {
        readAuthConfig({
          AUTH_SECRET: 'curto-demais-segredo',
          AUTH_PASSWORD_HASH: 'senha-em-texto',
        });
      } catch (e) {
        return e as ConfigError;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.variables).toEqual(['AUTH_SECRET', 'AUTH_PASSWORD_HASH']);
    expect(error?.message).not.toContain('curto-demais-segredo');
    expect(error?.message).not.toContain('senha-em-texto');
  });
});

describe('readVaultConfig', () => {
  it('usa GitHub por padrão e exige as variáveis dele', () => {
    expect(() => readVaultConfig({})).toThrow(ConfigError);
    expect(
      readVaultConfig({
        GITHUB_VAULT_OWNER: 'o',
        GITHUB_VAULT_REPO: 'r',
        GITHUB_VAULT_TOKEN: 't'.repeat(40),
      }),
    ).toEqual({ store: 'github', owner: 'o', repo: 'r', branch: 'main', token: 't'.repeat(40) });
  });

  it('aceita pasta local', () => {
    expect(readVaultConfig({ VAULT_STORE: 'fs', VAULT_FS_ROOT: '/tmp/vault' })).toEqual({
      store: 'fs',
      root: '/tmp/vault',
    });
  });
});

describe('readAppConfig', () => {
  it('usa padrões e valida o fuso', () => {
    expect(readAppConfig({})).toEqual({
      appName: 'Second Brain Leandro',
      timeZone: 'America/Sao_Paulo',
    });
    expect(readAppConfig({ APP_NAME: 'Meu Cérebro', APP_TIMEZONE: '' }).appName).toBe(
      'Meu Cérebro',
    );
    expect(() => readAppConfig({ APP_TIMEZONE: 'Marte/Olympus' })).toThrow(ConfigError);
  });
});
