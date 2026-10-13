import { existsSync } from 'node:fs';
import { expect, test } from './fixtures';
import {
  login,
  noteUrl,
  readVault,
  saveStatus,
  today,
  typeAtEnd,
  vaultFile,
  writeVault,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('Fase 1 — criar, salvar, fechar, reabrir e encontrar o conteúdo intacto', async ({
  page,
  browser,
}) => {
  const title = `Teste E2E ${Date.now()}: ação & reação`;
  await page.getByRole('button', { name: 'Nova nota (Alt+N)' }).click();
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Tipo').selectOption('permanent');
  await expect(page.getByLabel('Pasta', { exact: true })).toHaveValue('03-Permanent-Notes');
  await page.getByRole('button', { name: 'Criar nota' }).click();

  const expectedPath = `03-Permanent-Notes/${title.replace(':', ' -')}.md`;
  await expect(page).toHaveURL(
    new RegExp(encodeURIComponent(expectedPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

  const created = await readVault(expectedPath);
  expect(created).toMatch(/^---\nid: [0-9A-Z]{26}\n/);
  expect(created).toContain(`created: ${today()}`);

  await typeAtEnd(page, '\nTexto com acentuação: coração, mãe, ímpar 🧠');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'dirty');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  await expect(saveStatus(page)).toContainText('Salvo às');

  expect(await readVault(expectedPath)).toContain('Texto com acentuação: coração, mãe, ímpar 🧠');

  // "Fechar a aplicação": nova sessão do navegador, novo login.
  await page.context().close();
  const fresh = await browser.newContext({ locale: 'pt-BR' });
  const again = await fresh.newPage();
  await login(again);
  await again.goto(noteUrl(expectedPath));
  await expect(again.locator('.cm-content')).toContainText(
    'Texto com acentuação: coração, mãe, ímpar 🧠',
  );
  await fresh.close();
});

test('autosave grava sozinho após uma pausa na digitação', async ({ page }) => {
  await page.goto(noteUrl('00-Inbox/Ideia sobre captura rápida.md'));
  await typeAtEnd(page, '\nGravado pelo autosave.');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'dirty');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
  expect(await readVault('00-Inbox/Ideia sobre captura rápida.md')).toContain(
    'Gravado pelo autosave.',
  );
});

test('frontmatter: "updated" é ajustado no editor e o resto do YAML fica intacto', async ({
  page,
}) => {
  const path = '04-Concepts/Posicionamento.md';
  const before = await readVault(path);
  await page.goto(noteUrl(path));
  await typeAtEnd(page, '\nExemplo: marcas premium.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  const after = await readVault(path);
  expect(after).toBe(
    before.replace('updated: 2026-09-20', `updated: ${today()}`) + '\nExemplo: marcas premium.',
  );
  await expect(page.locator('.cm-content')).toContainText(`updated: ${today()}`);
});

test('wikilinks: visualização resolve links, marca quebrados e navega', async ({ page }) => {
  await page.goto(noteUrl('03-Permanent-Notes/Posicionamento é escolha.md'));
  await page.getByRole('button', { name: 'Editar e visualizar' }).click();
  const preview = page.getByRole('region', { name: 'Visualização' });
  await expect(
    preview.locator('.wikilink-broken', { hasText: 'Conceito inexistente' }),
  ).toBeVisible();
  await expect(preview.getByText('[[link dentro de código não conta]]')).toBeVisible();

  const details = page.getByRole('complementary', { name: 'Detalhes da nota' });
  await expect(details.getByText('Links de saída (2) · 1 sem destino')).toBeVisible();
  await expect(details.getByText('vendas/consultivas')).toBeVisible();

  await preview.getByRole('link', { name: 'Posicionamento', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(encodeURIComponent('04-Concepts/Posicionamento.md').replace(/\./g, '\\.')),
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Posicionamento' })).toBeVisible();
});

test('Cenário G — alteração externa gera conflito, nada é sobrescrito e a cópia preserva meu texto', async ({
  page,
}) => {
  const path = '02-Sources/Books/Exemplo de livro.md';
  await page.goto(noteUrl(path));
  await expect(page.locator('.cm-content')).toContainText('Uma citação fictícia');

  const external =
    (await readVault(path)) + '\nEditado no Obsidian enquanto a web estava aberta.\n';
  await writeVault(path, external);

  await typeAtEnd(page, '\nMinha edição na web.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'conflict');
  await expect(page.getByText('Esta nota mudou em outro lugar')).toBeVisible();
  expect(await readVault(path)).toBe(external);

  await page.getByRole('button', { name: 'Salvar minha versão como cópia' }).click();
  await expect(
    page.getByText(
      /Sua versão foi salva como nova nota: 02-Sources\/Books\/Exemplo de livro \(conflito/,
    ),
  ).toBeVisible();
  const copyPath = (await page.getByText(/Sua versão foi salva como nova nota:/).textContent())!
    .replace(/^.*nova nota: /, '')
    .replace(/\s*Abrir$/, '')
    .trim();
  expect(await readVault(copyPath)).toContain('Minha edição na web.');
  expect(await readVault(path)).toBe(external);
  await expect(page.locator('.cm-content')).toContainText('Editado no Obsidian');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
});

test('Cenário F — falha de rede não indica salvamento falso; nova tentativa conclui', async ({
  page,
}) => {
  const path = '00-Inbox/Ideia sobre captura rápida.md';
  await page.goto(noteUrl(path));
  const before = await readVault(path);

  await page.route('**/api/notes/file', (route) =>
    route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue(),
  );
  await typeAtEnd(page, '\nEscrito durante a queda de rede.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'error');
  await expect(saveStatus(page)).toContainText('Não salvo');
  await expect(page.getByRole('alert').filter({ hasText: 'Falha de rede' })).toBeVisible();
  expect(await readVault(path)).toBe(before);

  await page.unroute('**/api/notes/file');
  await page.getByRole('button', { name: 'Tentar agora' }).click();
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  expect(await readVault(path)).toContain('Escrito durante a queda de rede.');
});

test('rascunho local sobrevive a perder a aba sem sincronizar e pode ser restaurado', async ({
  page,
  context,
}) => {
  const path = '04-Concepts/Posicionamento.md';
  await page.goto(noteUrl(path));
  await page.route('**/api/notes/file', (route) =>
    route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue(),
  );
  await typeAtEnd(page, '\nTexto que ainda não chegou ao vault.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'error');
  // O rascunho é gravado no navegador ~300 ms depois da última tecla: espera ele existir.
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key) !== null, `sb:draft:${path}`))
    .toBe(true);

  const other = await context.newPage();
  await other.goto(noteUrl(path));
  await expect(other.getByText('Há alterações desta nota que não chegaram ao vault')).toBeVisible();
  await other.getByRole('button', { name: 'Restaurar rascunho' }).click();
  await expect(other.locator('.cm-content')).toContainText('Texto que ainda não chegou ao vault.');
  await other.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(other)).toHaveAttribute('data-status', 'saved');
  expect(await readVault(path)).toContain('Texto que ainda não chegou ao vault.');
});

test('nome duplicado não sobrescreve a nota existente', async ({ page }) => {
  const path = '04-Concepts/Posicionamento.md';
  const before = await readVault(path);
  await page.getByRole('button', { name: 'Nova nota (Alt+N)' }).click();
  await page.getByLabel('Título').fill('posicionamento');
  await page.getByLabel('Tipo').selectOption('concept');
  await page.getByRole('button', { name: 'Criar nota' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Já existe uma nota com esse nome',
  );
  expect(await readVault(path)).toBe(before);
  expect(existsSync(vaultFile('04-Concepts/posicionamento.md'))).toBe(
    process.platform === 'darwin',
  );
});
