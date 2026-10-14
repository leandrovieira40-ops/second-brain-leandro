import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { E2E } from './env';
import { expect, test } from './fixtures';
import {
  login,
  noteDetails,
  noteMenu,
  noteUrl,
  openNote,
  readVault,
  vaultFile,
  waitForApp,
  writeVault,
} from './helpers';

const withIndex = E2E.databaseUrl !== null;

test.beforeEach(async ({ page }) => {
  await login(page);
});

async function openSearch(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: 'Buscar notas' });
  await expect(input).toBeFocused();
  return input;
}

async function renameTo(page: Page, name: string, folder: string) {
  await noteMenu(page, 'Renomear ou mover');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome', { exact: true }).fill(name);
  await dialog.getByLabel('Pasta', { exact: true }).selectOption(folder);
  await dialog.getByRole('button', { name: 'Renomear', exact: true }).click();
}

const details = noteDetails;

async function writeNotes(files: Record<string, string>) {
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(vaultFile(relative)), { recursive: true });
    await writeVault(relative, content);
  }
}

test('renomear atualiza os [[links]] de outras notas no mesmo commit', async ({ page }) => {
  const stamp = Date.now();
  const folder = `05-Projects/Renomear ${stamp}`;
  const target = `${folder}/Alvo ${stamp}.md`;
  const source = `${folder}/Fonte ${stamp}.md`;
  await writeNotes({
    [target]: `---\ntitle: Alvo ${stamp}\ntype: note\n---\nConteúdo do alvo.\n`,
    [source]: `Liga para [[Alvo ${stamp}]] e [[Alvo ${stamp}#Seção|apelido]].\n`,
  });
  await page.goto('/');
  await openNote(page, target);

  await renameTo(page, `Destino ${stamp}`, '04-Concepts');

  const moved = `04-Concepts/Destino ${stamp}.md`;
  await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(moved);
  await expect(
    page.getByText(`Nota renomeada para ${moved}; links atualizados em 1 nota.`),
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: `Destino ${stamp}` })).toBeVisible();
  expect(await readVault(source)).toBe(
    `Liga para [[Destino ${stamp}]] e [[Destino ${stamp}#Seção|apelido]].\n`,
  );
  // O título do frontmatter acompanhou o nome (ele tinha gerado o nome do arquivo).
  expect(await readVault(moved)).toContain(`title: Destino ${stamp}\n`);

  if (withIndex) {
    // O índice acompanha a renomeação (atualizado logo após a resposta): o painel mostra a origem.
    await expect(async () => {
      await page.reload();
      await waitForApp(page);
      await expect((await details(page)).getByRole('link', { name: `Fonte ${stamp}` })).toBeVisible(
        { timeout: 2_000 },
      );
    }).toPass({ timeout: 15_000 });
  }
});

test('renomear para um nome ocupado é recusado sem alterar nada', async ({ page }) => {
  const before = await readVault('04-Concepts/Posicionamento.md');
  await openNote(page, '00-Inbox/Ideia sobre captura rápida.md');
  await renameTo(page, 'posicionamento', '04-Concepts');
  await expect(
    page.getByRole('dialog').getByRole('alert').filter({ hasText: 'Já existe uma nota' }),
  ).toBeVisible();
  expect(await readVault('04-Concepts/Posicionamento.md')).toBe(before);
  await expect(page).toHaveURL(new RegExp(encodeURIComponent('Ideia sobre captura rápida')));
});

test.describe('sem índice', () => {
  test.skip(withIndex, 'roda quando o servidor de teste não tem DATABASE_URL');

  test('Ctrl+K busca pelos nomes e explica que o conteúdo precisa do índice', async ({ page }) => {
    const input = await openSearch(page);
    await input.fill('posic');
    await expect(
      page.getByRole('status').filter({ hasText: 'Buscando só nos nomes' }),
    ).toBeVisible();
    await expect(page.getByRole('option', { name: /Posicionamento é escolha/ })).toBeVisible();
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Posicionamento é escolha' }),
    ).toBeVisible();
  });

  test('o Início avisa que o índice está desativado', async ({ page }) => {
    await expect(page.getByText('Índice de busca desativado')).toBeVisible();
  });
});

test.describe('com índice (PostgreSQL)', () => {
  test.skip(!withIndex, 'defina E2E_DATABASE_URL (banco descartável) para rodar');

  async function syncFromDashboard(page: Page) {
    await page.goto('/');
    await waitForApp(page);
    await page.getByRole('button', { name: 'Sincronizar índice' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Índice sincronizado' })).toBeVisible();
  }

  test('sincronizar mostra a saúde do vault: links quebrados e notas sem conexões', async ({
    page,
  }) => {
    await syncFromDashboard(page);
    const panel = page.getByRole('region', { name: 'Índice' });
    await expect(panel).toContainText(/\d+ notas indexadas/);
    await expect(panel.getByText('Conceito inexistente')).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: /Notas sem conexões \(\d+\+?\)/ }),
    ).toBeVisible();
  });

  test('Ctrl+K encontra pelo conteúdo, sem acento, com o trecho destacado', async ({ page }) => {
    await syncFromDashboard(page);
    const input = await openSearch(page);
    await input.fill('alternativas mente');
    const option = page.getByRole('option', { name: /Posicionamento/ }).first();
    await expect(option).toBeVisible();
    await expect(option.locator('mark').first()).toHaveText(/mente|alternativas/i);
    await input.fill('decidir');
    await expect(page.getByRole('option', { name: /Posicionamento é escolha/ })).toBeVisible();
    await input.press('Enter');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Posicionamento é escolha' }),
    ).toBeVisible();
  });

  test('conteúdo hostil aparece como texto no trecho da busca', async ({ page }) => {
    await syncFromDashboard(page);
    const input = await openSearch(page);
    // Sem acentos: "instrucoes" encontra "instruções".
    await input.fill('instrucoes anteriores');
    const option = page.getByRole('option', { name: /Conteúdo hostil importado/ });
    await expect(option).toBeVisible();
    expect(await page.evaluate(() => (window as { __pwned?: string }).__pwned)).toBeUndefined();
    await expect(option.locator('img, script, iframe')).toHaveCount(0);
  });

  test('links de entrada aparecem no painel da nota', async ({ page }) => {
    await syncFromDashboard(page);
    await openNote(page, '04-Concepts/Posicionamento.md');
    const panel = await details(page);
    await expect(panel.getByRole('heading', { name: /Menções ligadas \(\d+\)/ })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Posicionamento é escolha' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Conteúdo hostil importado' })).toBeVisible();
  });

  test('página de tags lista as tags e as notas de cada uma', async ({ page }) => {
    await syncFromDashboard(page);
    await page.getByRole('link', { name: 'Tags', exact: true }).click();
    const all = page.getByRole('list', { name: 'Todas as tags' });
    await expect(all.getByRole('link', { name: /estrategia\s*2/ })).toBeVisible();
    await all.getByRole('link', { name: /vendas\/consultivas/ }).click();
    await expect(page).toHaveURL(/tag=vendas%2Fconsultivas/);
    await expect(page.getByRole('link', { name: /Posicionamento é escolha/ })).toBeVisible();
  });

  test('grafo global, grafo local e painel de tags com contagem', async ({ page }) => {
    await syncFromDashboard(page);
    const tags = page.getByRole('region', { name: 'Tags do vault' });
    await expect(tags.getByRole('link', { name: /#estrategia\s*2/ })).toBeVisible();

    await page.getByRole('link', { name: 'Grafo', exact: true }).click();
    await expect(
      page.getByRole('img', { name: /Grafo com \d+ notas e \d+ ligações/ }),
    ).toBeVisible();

    await openNote(page, '04-Concepts/Posicionamento.md');
    const panel = await details(page);
    await expect(panel.getByRole('img', { name: /Grafo local com \d+ notas/ })).toBeVisible();
  });

  test('nota salva no editor entra na busca sem sincronizar à mão', async ({ page }) => {
    await syncFromDashboard(page);
    const word = `palavrarara${Date.now()}`;
    await page.goto(noteUrl('02-Sources/Books/Exemplo de livro.md'));
    await waitForApp(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(`\n${word}\n`);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
    await expect(async () => {
      const input = await openSearch(page);
      await input.fill(word);
      await expect(page.getByRole('option', { name: /Exemplo de livro/ })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
  });
});
