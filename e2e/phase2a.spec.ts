import { existsSync } from 'node:fs';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import {
  chooseNoteType,
  login,
  noteDetails,
  noteMenu,
  openNote,
  readVault,
  saveStatus,
  typeAtEnd,
  vaultFile,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function createNote(page: Page, title: string, type = 'inbox') {
  await page.getByRole('button', { name: 'Nova nota (Alt+N)' }).click();
  await page.getByLabel('Título').fill(title);
  await chooseNoteType(page, type);
  await page.getByRole('button', { name: 'Criar nota' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test('captura rápida (Alt+C) grava o texto exato no Inbox', async ({ page }) => {
  const stamp = Date.now();
  await page.keyboard.press('Alt+c');
  const text = `Ideia ${stamp}: oferecer diagnóstico gratuito\ncom detalhes na segunda linha`;
  await page.getByLabel('Texto da captura').fill(text);
  await page.getByLabel('Texto da captura').press('Control+Enter');
  const path = `00-Inbox/Ideia ${stamp} - oferecer diagnóstico gratuito.md`;
  await expect(page.getByText(`Capturado em ${path}.`)).toBeVisible();
  expect(await readVault(path)).toContain(text);
  await page.getByRole('link', { name: 'Abrir' }).click();
  await expect(page.locator('.cm-content')).toContainText('com detalhes na segunda linha');
});

test('autocompletar de [[ insere o link para uma nota existente', async ({ page }) => {
  await createNote(page, `Autocompletar ${Date.now()}`);
  await typeAtEnd(page, '\nVer [[posic');
  const option = page.getByRole('option', { name: /Posicionamento\s*04-Concepts/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.locator('.cm-content')).toContainText('Ver [[Posicionamento]]');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
});

test('link quebrado vira atalho para criar a nota, que passa a ser resolvida', async ({ page }) => {
  const missing = `Conceito novo ${Date.now()}`;
  await createNote(page, `Origem ${Date.now()}`);
  await typeAtEnd(page, `\nLigado a [[${missing}]].`);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  await noteMenu(page, 'Escrever e ver o resultado lado a lado');
  await page
    .getByRole('region', { name: 'Visualização' })
    .getByRole('button', { name: missing })
    .click();
  await expect(page.getByLabel('Título')).toHaveValue(missing);
  await page.getByRole('button', { name: 'Criar nota' }).click();
  await expect(page.getByRole('heading', { level: 1, name: missing })).toBeVisible();
  expect(existsSync(vaultFile(`00-Inbox/${missing}.md`))).toBe(true);
  await page.goBack();
  await expect(
    page.getByRole('region', { name: 'Visualização' }).getByRole('link', { name: missing }),
  ).toBeVisible();
});

test('lixeira: mover, ver, restaurar no lugar de origem e excluir de vez', async ({ page }) => {
  const title = `Para a lixeira ${Date.now()}`;
  const path = `00-Inbox/${title}.md`;
  await createNote(page, title);
  const content = await readVault(path);

  page.once('dialog', (dialog) => dialog.accept());
  await noteMenu(page, 'Mover para a lixeira');
  await expect(page).toHaveURL(/\/trash$/);
  expect(existsSync(vaultFile(path))).toBe(false);
  expect(await readVault(`.trash/${path}`)).toBe(content);

  const item = page
    .getByRole('list', { name: 'Notas na lixeira' })
    .getByRole('listitem')
    .filter({ hasText: title });
  await item.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText(`Restaurada em ${path}.`)).toBeVisible();
  expect(await readVault(path)).toBe(content);
  expect(existsSync(vaultFile(`.trash/${path}`))).toBe(false);

  // Exclusão definitiva
  await openNote(page, path);
  page.once('dialog', (dialog) => dialog.accept());
  await noteMenu(page, 'Mover para a lixeira');
  await expect(page).toHaveURL(/\/trash$/);
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('list', { name: 'Notas na lixeira' })
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Excluir de vez' })
    .click();
  await expect(page.getByText(`${title} foi excluída definitivamente.`)).toBeVisible();
  expect(existsSync(vaultFile(`.trash/${path}`))).toBe(false);
  expect(existsSync(vaultFile(path))).toBe(false);
});

test('lixeira recusa nota com alterações não salvas', async ({ page }) => {
  await createNote(page, `Não salva ${Date.now()}`);
  await page.route('**/api/notes/file', (route) =>
    route.request().method() === 'PUT' ? route.abort('internetdisconnected') : route.continue(),
  );
  await typeAtEnd(page, '\ntexto pendente');
  await noteMenu(page, 'Mover para a lixeira');
  await expect(
    page.getByText('Salve as alterações (Ctrl+S) antes de mover a nota para a lixeira.'),
  ).toBeVisible();
});

test('favoritos ficam no vault e aparecem na barra lateral', async ({ page }) => {
  const path = '04-Concepts/Posicionamento.md';
  await openNote(page, path);
  await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click();
  const favorites = page.getByRole('region', { name: 'Favoritos' });
  await expect(favorites.getByRole('link', { name: 'Posicionamento' })).toBeVisible();
  expect(JSON.parse(await readVault('.second-brain/favorites.json')).notes).toContain(path);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Remover dos favoritos' }).click();
  await expect(page.getByRole('button', { name: 'Adicionar aos favoritos' })).toBeVisible();
  expect(JSON.parse(await readVault('.second-brain/favorites.json')).notes).not.toContain(path);
});

test('recentes deste navegador e histórico indisponível na pasta local', async ({ page }) => {
  await openNote(page, '04-Concepts/Posicionamento.md');
  await openNote(page, '02-Sources/Books/Exemplo de livro.md');
  const recents = page.getByRole('region', { name: 'Recentes neste navegador' });
  await expect(recents.getByRole('link').first()).toHaveText('Exemplo de livro');
  await expect(recents.getByRole('link', { name: 'Posicionamento', exact: true })).toBeVisible();

  const details = await noteDetails(page);
  await details.getByRole('button', { name: 'Ver versões anteriores' }).click();
  await expect(details.getByText('Histórico disponível com o vault no GitHub')).toBeVisible();
});
