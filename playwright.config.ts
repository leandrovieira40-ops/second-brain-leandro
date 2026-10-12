import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e/env';

/**
 * Testes ponta a ponta contra o BUILD DE PRODUÇÃO (`next start`), com o adaptador de pasta local
 * apontando para um vault sintético recriado a cada execução (`npm run e2e`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: E2E.baseURL,
    trace: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npx next start -p ${E2E.port}`,
    url: `${E2E.baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: E2E.serverEnv,
  },
});
