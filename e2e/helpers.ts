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
