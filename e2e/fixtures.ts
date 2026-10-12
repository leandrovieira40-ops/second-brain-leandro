import { expect, test as base, type Page } from '@playwright/test';

/** Falha o teste se o navegador registrar erro de JavaScript ou violação da CSP. */
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      const watch = (page: Page) => {
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
        page.on('console', (message) => {
          const text = message.text();
          // Falhas de rede simuladas pelos próprios testes não contam.
          if (/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(text)) return;
          if (message.type() === 'error' || /Content Security Policy/i.test(text))
            errors.push(`console: ${text}`);
        });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use(errors);
      expect(errors, 'erros no navegador').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
