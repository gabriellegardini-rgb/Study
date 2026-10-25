import type { PdfExtractor } from './models';
import { readBlob } from '../library/pdf';

// Lazy-load both parser and worker only when processing is requested.
export const extractPdfPages: PdfExtractor = async (blob, onProgress) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const assets = `${import.meta.env.BASE_URL}pdfjs/`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await readBlob(blob)),
    standardFontDataUrl: `${assets}standard_fonts/`, cMapUrl: `${assets}cmaps/`, cMapPacked: true, wasmUrl: `${assets}wasm/`,
  });
  try {
    const document = await task.promise;
    const pages = [];
    // Sequential extraction bounds memory and preserves page order.
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      let page;
      try {
        page = await document.getPage(pageNumber);
        const content = await page.getTextContent({ disableNormalization: true });
        let rawText = '';
        let lastY: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5];
          if (lastY !== undefined && Math.abs(y - lastY) > 2 && !rawText.endsWith('\n')) rawText += '\n';
          rawText += item.str;
          rawText += item.hasEOL ? '\n' : ' ';
          lastY = y;
        }
        pages.push({ pageNumber, rawText });
      } catch {
        pages.push({ pageNumber, rawText: '', error: 'Text could not be extracted from this page.' });
      } finally {
        page?.cleanup();
      }
      onProgress?.(pageNumber, document.numPages);
    }
    return pages;
  } finally {
    await task.destroy();
  }
};
