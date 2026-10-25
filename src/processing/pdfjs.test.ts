// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';
beforeEach(() => vi.stubEnv('BASE_URL', fileURLToPath(new URL('../../public/', import.meta.url))));
import { makePdf } from './fixtures';
import { extractPdfPages } from './pdfjs';
import { processStoredPdf } from './service';
import { IndexedDbLibraryRepository } from '../library/storage';
import { addLecture, emptyLibrary } from '../library/data';

// Browser worker URL is resolved to a local module for PDF.js's Node fake-worker implementation.
// The parser and getTextContent are real, not mocked.
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({
  default: new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href,
}));

describe('Real PDF.js extraction', () => {
  it('retrieves a stored PDF and preserves pages, raw text, chunks and objective candidates', async () => {
    const pdf = makePdf([['Learning Objectives', '1. Explain the sample workflow.', '2. Compare the example stages.'], ['A separate sample page.'], []]);
    const file = new File([pdf as BlobPart], 'fixture.pdf', { type: 'application/pdf' });
    const { data, lectureId } = addLecture(emptyLibrary(), { number: 1, title: 'Example', course: 'Course', module: 'Module', professor: '', exam: '', pdf: file });
    const repository = new IndexedDbLibraryRepository('actual-parser');
    await repository.save({ data, selected: [] }, 0);
    const record = await processStoredPdf(repository, lectureId, data.lectures[0].pdf!.id);
    expect(record.status).toBe('processed');
    expect(record.pages.map(p => p.pageNumber)).toEqual([1, 2, 3]);
    expect(record.pages[0].rawText).toContain('Learning Objectives');
    expect(record.pages[1].normalizedText).toBe('A separate sample page.');
    expect(record.pages[2].extractionStatus).toBe('empty');
    expect(record.suggestions.map(s => s.text)).toEqual(['Explain the sample workflow.', 'Compare the example stages.']);
    expect(record.chunks.every(c => c.source.lectureId === lectureId && c.source.pageNumbers.length === 1)).toBe(true);
  });
  it('rejects a damaged PDF instead of inventing content', async () => {
    await expect(extractPdfPages(new Blob(['%PDF-1.7\nnot a document']))).rejects.toThrow();
  });
});
