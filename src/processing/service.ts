import type { LibraryData, PdfDocument } from '../library/models';
import type { LibraryRepository } from '../library/storage';
import type { PdfExtractor, ProcessedLecture } from './models';
import { createChunks, createPages, detectObjectives } from './content';
import { extractPdfPages } from './pdfjs';

export async function processStoredPdf(
  repository: LibraryRepository, lectureId: string, fileId: string,
  extractor: PdfExtractor = extractPdfPages, onProgress?: (page: number, total: number) => void,
): Promise<ProcessedLecture> {
  const stored = await repository.getPdf(fileId);
  if (!stored) throw new Error('This PDF is not available in browser storage. Wait for saving to finish, or attach the file again.');
  if (stored.metadata.lectureId !== lectureId) throw new Error('This PDF does not belong to the selected lecture.');
  const extracted = await extractor(stored.blob, onProgress);
  if (!extracted.length) throw new Error('No pages could be read from this PDF.');
  const seen = new Set<number>();
  for (const [index, page] of extracted.entries()) {
    if (page.pageNumber !== index + 1 || !Number.isInteger(page.pageNumber) || page.pageNumber < 1 || seen.has(page.pageNumber)) throw new Error('PDF page references could not be verified.');
    seen.add(page.pageNumber);
  }
  const pages = createPages(lectureId, fileId, extracted);
  return { id: `${lectureId}:${fileId}:v1`, lectureId, fileId, filename: stored.metadata.name, pipelineVersion: 1,
    status: pages.every(p => p.extractionStatus === 'failed') ? 'failed' : 'processed',
    error: pages.every(p => p.extractionStatus === 'failed') ? 'Text extraction failed on every page.' : undefined,
    processedAt: new Date().toISOString(), pages, chunks: createChunks(pages), suggestions: detectObjectives(pages) };
}

export function failedProcessing(lectureId: string, pdf: PdfDocument, error: unknown): ProcessedLecture {
  return { id: `${lectureId}:${pdf.id}:v1`, lectureId, fileId: pdf.id, filename: pdf.name, pipelineVersion: 1,
    status: 'failed', processedAt: new Date().toISOString(), pages: [], chunks: [], suggestions: [],
    error: error instanceof Error && /not available|does not belong|No pages|references/.test(error.message) ? error.message : 'This PDF could not be processed. It may be damaged, password-protected, or unsupported. Try another copy.' };
}
export function applyProcessingResult(data: LibraryData, result: ProcessedLecture): LibraryData {
  if (!data.lectures.some(l => l.id === result.lectureId)) return data;
  const previous = data.processedLectures?.find(p => p.id === result.id);
  // Retain last captured pages on a failed retry, never silently replace them with an empty failure.
  const content = result.status === 'failed' && previous?.pages.length
    ? { ...previous, status: 'failed' as const, error: result.error } : result;
  const updated = { ...content, suggestions: content.suggestions.map(s => ({ ...s, status: previous?.suggestions.find(old => old.id === s.id)?.status ?? s.status })) };
  // Keep previous PDF versions as inspectable archives; retrieval only admits the currently attached file.
  return { ...data, processedLectures: [...(data.processedLectures ?? []).filter(p => p.id !== updated.id), updated] };
}
