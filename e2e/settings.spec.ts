import { E2E } from './env';
import { expect, test } from './fixtures';
import { login, waitForApp } from './helpers';

const withIndex = E2E.databaseUrl !== null;
const NEW_PASSWORD = 'senha nova do teste ponta a ponta';

test('sem banco, a tela explica como trocar a senha', async ({ page }) => {
  test.skip(withIndex, 'roda quando o servidor de teste não tem DATABASE_URL');
  await login(page);
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page.getByText(/configure o banco \(DATABASE_URL\)/)).toBeVisible();
});

test('trocar a senha desconecta os outros aparelhos e a nova passa a valer', async ({
  page,
  browser,
}) => {
  test.skip(!withIndex, 'defina E2E_DATABASE_URL (banco descartável) para rodar');
  await login(page);
  // "Outro aparelho", conectado antes da troca.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage);

  await page.getByRole('link', { name: 'Configurações' }).click();
  const fill = async (current: string, next: string, confirm = next) => {
    await page.getByLabel('Senha atual').fill(current);
    await page.getByLabel('Senha nova', { exact: true }).fill(next);
    await page.getByLabel('Confirme a senha nova').fill(confirm);
    await page.getByRole('button', { name: 'Trocar senha' }).click();
  };

  await fill(E2E.password, NEW_PASSWORD, 'outra coisa qualquer');
  await expect(page.getByRole('alert').filter({ hasText: 'confirmação' })).toBeVisible();
  await fill('senha atual errada', NEW_PASSWORD);
  await expect(
    page.getByRole('alert').filter({ hasText: 'senha atual está incorreta' }),
  ).toBeVisible();

  await fill(E2E.password, NEW_PASSWORD);
  await expect(page.getByRole('status').filter({ hasText: 'Senha trocada' })).toBeVisible();

  // Este aparelho continua conectado; o outro cai no login.
  await page.goto('/');
  await waitForApp(page);
  await otherPage.goto('/');
  await expect(otherPage).toHaveURL(/\/login/);
  await otherPage.getByLabel('Frase-senha').fill(E2E.password);
  await otherPage.getByRole('button', { name: 'Entrar' }).click();
  await expect(otherPage.getByText('Senha incorreta.')).toBeVisible();
  await otherPage.getByLabel('Frase-senha').fill(NEW_PASSWORD);
  await otherPage.getByRole('button', { name: 'Entrar' }).click();
  await expect(otherPage.getByRole('heading', { name: 'Início' })).toBeVisible();
  await other.close();

  // Volta à senha original (outros testes e execuções usam a senha de E2E).
  await page.getByRole('link', { name: 'Configurações' }).click();
  await fill(NEW_PASSWORD, E2E.password);
  await expect(page.getByRole('status').filter({ hasText: 'Senha trocada' })).toBeVisible();
});
