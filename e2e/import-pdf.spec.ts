import { expect, test } from './fixtures';
import { login } from './helpers';

/** PDF mínimo de uma página com um texto curto (gerado aqui; nenhum arquivo real é usado). */
function tinyPdf(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const file = {
  name: 'O_Mito_do_Progresso.pdf',
  mimeType: 'application/pdf',
  buffer: tinyPdf('Ola PDF de teste'),
};

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('sem a chave da IA, importar explica o que configurar e não cria nada', async ({ page }) => {
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar PDF' });
  await dialog.getByLabel('Arquivo PDF').setInputFiles(file);
  await expect(dialog.getByText('O_Mito_do_Progresso.pdf')).toBeVisible();
  await dialog.getByRole('button', { name: 'Importar' }).click();
  await expect(dialog.getByRole('alert')).toContainText('ANTHROPIC_API_KEY');
});

test('o navegador lê o PDF (texto e imagem da página) e abre a nota criada', async ({ page }) => {
  let sent: {
    fileName: string;
    pageCount: number;
    pages: { text: string; image?: string }[];
  } | null = null;
  await page.route('**/api/import/pdf', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ path: '04-Concepts/Posicionamento.md', sha: 'a'.repeat(40) }),
    });
  });
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Importar PDF' });
  await dialog.getByLabel('Arquivo PDF').setInputFiles(file);
  await dialog.getByRole('button', { name: 'Importar' }).click();

  await expect(page).toHaveURL(/Posicionamento\.md/);
  await expect(page.getByText('PDF importado. Confira o resumo feito pela IA.')).toBeVisible();
  expect(sent).not.toBeNull();
  const body = sent!;
  expect(body.fileName).toBe('O_Mito_do_Progresso.pdf');
  expect(body.pageCount).toBe(1);
  expect(body.pages[0]?.text).toContain('Ola PDF de teste');
  // Pouco texto na página: ela também vai como imagem (JPEG em base64).
  expect(body.pages[0]?.image?.startsWith('/9j/')).toBe(true);
});
