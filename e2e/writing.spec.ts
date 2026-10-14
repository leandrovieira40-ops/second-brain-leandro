import { existsSync } from 'node:fs';
import { expect, test } from './fixtures';
import { login, openNote, readVault, saveStatus, vaultFile, writeVault } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('bloco de notas do Início: escrever, salvar e encontrar a nota na Caixa de entrada', async ({
  page,
}) => {
  const title = `Paixão ${Date.now()}`;
  await page.getByRole('button', { name: 'Escreva uma nota…' }).click();
  const form = page.getByRole('form', { name: 'Nova nota rápida' });
  await form.getByLabel('Título').fill(title);
  await form.getByLabel('Texto da nota').fill('Nada de grandioso no mundo foi feito sem paixão.');
  await form.getByRole('button', { name: 'Salvar nota' }).click();

  await expect(page.getByText('Nota salva na Caixa de entrada.')).toBeVisible();
  const content = await readVault(`00-Inbox/${title}.md`);
  expect(content).toContain(`title: ${title}\n`);
  // O título não se repete no texto.
  expect(content.endsWith('---\nNada de grandioso no mundo foi feito sem paixão.\n')).toBe(true);
  await expect(page.getByRole('button', { name: 'Escreva uma nota…' })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Notas recentes' })
      .getByRole('link', { name: new RegExp(title) }),
  ).toBeVisible();
});

test('o texto do bloco de notas sobrevive a recarregar a página', async ({ page }) => {
  await page.getByRole('button', { name: 'Escreva uma nota…' }).click();
  await page.getByLabel('Texto da nota').fill('rascunho que não pode sumir');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('sb:quick-note')))
    .toContain('rascunho que não pode sumir');
  await page.reload();
  await expect(page.getByLabel('Texto da nota')).toHaveValue('rascunho que não pode sumir');
});

test('nota como página: frontmatter escondido, título grande e botão Salvar', async ({ page }) => {
  const path = '04-Concepts/Posicionamento.md';
  await openNote(page, path);
  await expect(page.getByRole('heading', { level: 1, name: 'Posicionamento' })).toBeVisible();
  // Nada do YAML aparece no editor, e apagar tudo não leva o frontmatter junto.
  const editor = page.locator('.cm-content');
  await expect(editor).not.toContainText('type:');
  await expect(editor).not.toContainText('---');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Texto novo.');
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'dirty');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(saveStatus(page)).toHaveAttribute('data-status', 'saved');
  const after = await readVault(path);
  expect(after).toMatch(/^---\n[\s\S]*\ntitle: Posicionamento\n[\s\S]*\n---\nTexto novo\.$/);
  expect(after).toContain('type: concept');
});

test('mudar o título renomeia a nota e atualiza os links', async ({ page }) => {
  const stamp = Date.now();
  const path = `00-Inbox/Título ${stamp}.md`;
  const source = `00-Inbox/Aponta ${stamp}.md`;
  await writeVault(path, `---\ntitle: Título ${stamp}\ntype: inbox\n---\nCorpo.\n`);
  await writeVault(source, `Ver [[Título ${stamp}]].\n`);
  await openNote(page, path);

  const title = page.getByTestId('note-title');
  await title.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(`Novo nome ${stamp}`);
  await page.keyboard.press('Enter');

  const moved = `00-Inbox/Novo nome ${stamp}.md`;
  await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(moved);
  await expect(page.getByRole('heading', { level: 1, name: `Novo nome ${stamp}` })).toBeVisible();
  expect(existsSync(vaultFile(path))).toBe(false);
  expect(await readVault(moved)).toContain(`title: Novo nome ${stamp}\n`);
  expect(await readVault(source)).toBe(`Ver [[Novo nome ${stamp}]].\n`);
});
