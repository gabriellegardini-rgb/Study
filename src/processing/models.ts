export type ProcessingStatus = 'not-processed' | 'processing' | 'processed' | 'failed' | 'stale';
export interface SourceReference {
  lectureId: string;
  fileId: string;
  pageNumbers: number[];
  pageIds: string[];
}
export interface LecturePage {
  id: string;
  lectureId: string;
  fileId: string;
  pageNumber: number;
  rawText: string;
  normalizedText: string;
  extractionStatus: 'extracted' | 'empty' | 'failed';
  warning?: string;
}
export interface SourceChunk {
  id: string;
  source: SourceReference;
  text: string;
  // Offsets in the single source page's normalized text; never cross page boundaries.
  startOffset: number;
  endOffset: number;
}
export interface ObjectiveSuggestion {
  id: string;
  text: string;
  source: SourceReference;
  status: 'pending' | 'accepted' | 'dismissed';
}
export interface ProcessedLecture {
  id: string;
  lectureId: string;
  fileId: string;
  filename: string;
  pipelineVersion: 1;
  status: 'processed' | 'failed';
  processedAt: string;
  pages: LecturePage[];
  chunks: SourceChunk[];
  suggestions: ObjectiveSuggestion[];
  error?: string;
}
export interface ExtractedPage {
  pageNumber: number;
  rawText: string;
  error?: string;
}
export type PdfExtractor = (blob: Blob, onProgress?: (page: number, total: number) => void) => Promise<ExtractedPage[]>;
