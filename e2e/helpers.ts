import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { E2E } from './env';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Frase-senha').fill(E2E.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();
  await waitForApp(page);
}

/** Espera a hidratação (atalhos e efeitos do cliente ativos), não só o HTML do servidor. */
export async function waitForApp(page: Page) {
  await expect(page.locator('[data-shell-ready="true"]')).toBeAttached();
}

/** Abre uma nota e espera o editor carregar. */
export async function openNote(page: Page, relative: string) {
  await page.goto(noteUrl(relative));
  await waitForApp(page);
  await expect(page.locator('.cm-content')).toBeVisible();
}

export const vaultFile = (relative: string) => path.join(E2E.vaultRoot, ...relative.split('/'));
export const readVault = (relative: string) => readFile(vaultFile(relative), 'utf8');
export const writeVault = (relative: string, content: string) =>
  writeFile(vaultFile(relative), content, 'utf8');

export const noteUrl = (relative: string) => `/note?path=${encodeURIComponent(relative)}`;

/** Escolhe uma opção do menu "Mais opções" (⋯) da nota. */
export async function noteMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Abre o painel "Detalhes da nota" (fechado por padrão). */
export async function noteDetails(page: Page) {
  const panel = page.getByRole('complementary', { name: 'Detalhes da nota' });
  if (!(await panel.isVisible())) await noteMenu(page, 'Detalhes da nota');
  await expect(panel).toBeVisible();
  return panel;
}

export function saveStatus(page: Page) {
  return page.getByTestId('save-status');
}

/** Digita no fim do documento do CodeMirror. */
export async function typeAtEnd(page: Page, text: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const TYPE_LABELS: Record<string, string> = {
  inbox: 'Captura (Inbox)',
  permanent: 'Nota permanente',
  concept: 'Conceito',
  source: 'Fonte',
  book: 'Livro',
};

/** Escolhe o tipo na janela "Nova nota" (cartões com o nome e a explicação de cada tipo). */
export async function chooseNoteType(page: Page, type: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByText(TYPE_LABELS[type] ?? type, { exact: true }).click();
  const label = TYPE_LABELS[type] ?? type;
  await expect(dialog.getByRole('radio', { name: label, exact: false })).toBeChecked();
}
