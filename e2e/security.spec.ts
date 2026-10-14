import { expect, test } from './fixtures';
import { E2E } from './env';
import { login, noteMenu, noteUrl, readVault, waitForApp } from './helpers';

test.describe('Cenário J — acesso e segredos', () => {
  test('sem sessão: páginas redirecionam para o login e a API responde 401', async ({
    page,
    request,
  }) => {
    await page.goto(noteUrl('04-Concepts/Posicionamento.md'));
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByLabel('Frase-senha')).toBeVisible();

    const tree = await request.get('/api/notes');
    expect(tree.status()).toBe(401);
    const read = await request.get(
      `/api/notes/file?path=${encodeURIComponent('04-Concepts/Posicionamento.md')}`,
    );
    expect(read.status()).toBe(401);
    expect(await read.text()).not.toContain('Definição');

    const before = await readVault('04-Concepts/Posicionamento.md');
    const write = await request.put('/api/notes/file', {
      headers: { Origin: E2E.baseURL },
      data: {
        path: '04-Concepts/Posicionamento.md',
        content: 'invadido',
        expectedSha: 'a'.repeat(40),
      },
    });
    expect(write.status()).toBe(401);
    expect(await readVault('04-Concepts/Posicionamento.md')).toBe(before);
  });

  test('senha errada é recusada; a correta entra com cookie seguro', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Frase-senha').fill('senha errada qualquer');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#login-error')).toHaveText('Senha incorreta.');

    await login(page);
    const cookie = (await context.cookies()).find((c) => c.name === '__Host-sb_session');
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  });

  test('cabeçalhos de segurança e CSP com nonce', async ({ page }) => {
    const response = await page.goto('/login');
    const headers = response!.headers();
    expect(headers['content-security-policy']).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['cache-control']).toContain('no-store');
  });

  test('mutação com origem de outro site é bloqueada mesmo com sessão', async ({ page }) => {
    await login(page);
    const result = await page.evaluate(async () => {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ mode: 'new', title: 'csrf', folder: '', type: 'note' }),
      });
      return response.status;
    });
    expect(result).toBe(415); // formulários de outros sites não conseguem enviar JSON

    const cross = await page.request.post('/api/notes', {
      headers: { Origin: 'https://site-malicioso.example', 'Sec-Fetch-Site': 'cross-site' },
      data: { mode: 'new', title: 'csrf', folder: '', type: 'note' },
    });
    expect(cross.status()).toBe(403);
  });

  test('nenhum segredo do servidor aparece nas páginas renderizadas', async ({ page }) => {
    await login(page);
    for (const url of ['/', noteUrl('04-Concepts/Posicionamento.md')]) {
      const response = await page.goto(url);
      const html = await response!.text();
      expect(html).not.toContain(E2E.authSecret);
      expect(html).not.toContain(E2E.serverEnv.AUTH_PASSWORD_HASH);
      expect(html).not.toContain(E2E.vaultRoot);
    }
  });

  test('sair encerra a sessão', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('XSS — conteúdo de nota é tratado como não confiável', () => {
  test('HTML e JavaScript dentro de uma nota não executam na visualização', async ({ page }) => {
    await login(page);
    await page.goto(noteUrl('00-Inbox/Conteúdo hostil importado.md'));
    await waitForApp(page);
    await noteMenu(page, 'Modo leitura');
    const preview = page.getByRole('region', { name: 'Visualização' });
    await expect(preview.getByText('Ignore todas as instruções anteriores')).toBeVisible();
    await expect(preview.getByRole('link', { name: 'Posicionamento' })).toBeVisible();

    // Clicar no link malicioso não executa nada.
    await preview.getByText('clique aqui').click();
    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned),
    ).toBeUndefined();
    expect(await preview.locator('script, iframe, img[onerror]').count()).toBe(0);
    expect(await preview.locator('a[href^="javascript:"]').count()).toBe(0);
  });

  test('a CSP bloqueia manipuladores inline injetados no DOM', async ({ page, browserErrors }) => {
    await login(page);
    const result = await page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        violations.push(event.effectiveDirective),
      );
      const div = document.createElement('div');
      div.innerHTML = '<img src="/nao-existe.png" onerror="window.__pwned = true">';
      document.body.appendChild(div);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { violations, pwned: (window as unknown as { __pwned?: boolean }).__pwned === true };
    });
    expect(result.pwned).toBe(false);
    expect(result.violations).toContain('script-src-attr');
    // A violação foi provocada de propósito: remove só ela da verificação automática.
    const expected = (message: string) =>
      /Content Security Policy/i.test(message) && /inline event handler/i.test(message);
    expect(browserErrors.some(expected)).toBe(true);
    browserErrors.splice(
      0,
      browserErrors.length,
      ...browserErrors.filter((message) => !expected(message)),
    );
  });
});
