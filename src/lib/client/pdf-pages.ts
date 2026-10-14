'use client';

import type { PDFPageProxy } from 'pdfjs-dist';
import { PDF_IMPORT_LIMITS, type PdfImportInput } from '@/lib/import/pdf-note';

/** Páginas com pelo menos isso de texto vão só como texto (mais leve); as demais, como imagem. */
const TEXT_ENOUGH = 300;
/** Lado maior da imagem: o tamanho que a IA aproveita sem perder detalhe. */
const MAX_SIDE = 1568;

export class PdfPrepareError extends Error {
  override readonly name = 'PdfPrepareError';
}

export interface PrepareProgress {
  page: number;
  total: number;
}

/**
 * Lê o PDF NO NAVEGADOR (pdf.js): extrai o texto de cada página e, quando a página quase não tem
 * texto (slides, digitalizações), gera uma imagem JPEG. O arquivo original não sai do computador;
 * só o texto e as imagens vão para o servidor.
 */
export async function preparePdf(
  file: File,
  onProgress: (progress: PrepareProgress) => void,
): Promise<PdfImportInput> {
  // Versão "legacy": funciona também em navegadores um pouco mais antigos (a normal exige recursos
  // de JavaScript muito recentes).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch {
    throw new PdfPrepareError('Não consegui abrir este arquivo. Ele é mesmo um PDF (e sem senha)?');
  }

  const total = Math.min(pdf.numPages, PDF_IMPORT_LIMITS.maxPages);
  const pages: PdfImportInput['pages'] = [];
  // Orçamento do envio: as imagens ficam mais leves se o PDF tiver muitas páginas.
  const budget = PDF_IMPORT_LIMITS.maxRequestBytes - 200_000;
  let quality = total > 20 ? 0.55 : 0.7;
  let used = 0;

  for (let number = 1; number <= total; number++) {
    onProgress({ page: number, total });
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, PDF_IMPORT_LIMITS.maxPageTextChars);
    used += text.length * 2;

    let image: string | undefined;
    if (text.length < TEXT_ENOUGH) {
      const remainingPages = total - number + 1;
      const share = (budget - used) / remainingPages;
      image = await renderJpeg(page, quality, Math.min(share, PDF_IMPORT_LIMITS.maxImageChars));
      if (image === undefined && quality > 0.4) {
        quality = 0.4;
        image = await renderJpeg(page, quality, Math.min(share, PDF_IMPORT_LIMITS.maxImageChars));
      }
      if (image) used += image.length;
    }
    page.cleanup();
    pages.push({ number, text, ...(image ? { image } : {}) });
  }
  await task.destroy();

  if (pages.every((page) => !page.text && !page.image)) {
    throw new PdfPrepareError('Não encontrei texto nem imagens neste PDF.');
  }
  return { fileName: file.name.slice(0, 200), pageCount: pdf.numPages, pages };
}

/** Página em JPEG (base64, sem o prefixo `data:`), ou `undefined` se não couber no limite. */
async function renderJpeg(
  page: PDFPageProxy,
  quality: number,
  maxChars: number,
): Promise<string | undefined> {
  if (maxChars < 20_000) return undefined;
  const base = page.getViewport({ scale: 1 });
  let scale = MAX_SIDE / Math.max(base.width, base.height);
  for (let attempt = 0; attempt < 3; attempt++) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
    canvas.width = 0;
    canvas.height = 0;
    if (data.length <= maxChars) return data;
    scale *= 0.7;
  }
  return undefined;
}
