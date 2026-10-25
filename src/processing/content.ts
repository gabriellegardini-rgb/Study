import type { LibraryData, LearningObjective } from '../library/models';
import type { ExtractedPage, LecturePage, ObjectiveSuggestion, ProcessedLecture, ProcessingStatus, SourceChunk, SourceReference } from './models';

export function normalizeText(text: string): string {
  // Whitespace only: no inferred wording, Unicode substitution, or medical corrections.
  return text.split(/\r?\n/).map(line => line.replace(/[\t \u00a0]+/g, ' ').trim()).filter(Boolean).join('\n');
}
export function createPages(lectureId: string, fileId: string, pages: ExtractedPage[]): LecturePage[] {
  return pages.map(page => {
    const normalizedText = normalizeText(page.rawText);
    return { id: `${fileId}:page:${page.pageNumber}`, lectureId, fileId, pageNumber: page.pageNumber,
      rawText: page.rawText, normalizedText, extractionStatus: page.error ? 'failed' : normalizedText ? 'extracted' : 'empty',
      warning: page.error || (!normalizedText ? 'No extractable text. This page may be blank or image-only; OCR is not available.' : normalizedText.length < 40 ? 'Very little text was extracted. Check the original slide for images or missing content.' : undefined) };
  });
}
function sourceFor(page: LecturePage): SourceReference {
  return { lectureId: page.lectureId, fileId: page.fileId, pageNumbers: [page.pageNumber], pageIds: [page.id] };
}
export function createChunks(pages: LecturePage[], maxLength = 1000): SourceChunk[] {
  if (!Number.isInteger(maxLength) || maxLength < 1) throw new Error('Chunk size must be a positive integer.');
  return pages.flatMap(page => {
    if (page.extractionStatus !== 'extracted') return [];
    const chunks: SourceChunk[] = [];
    let start = 0;
    while (start < page.normalizedText.length) {
      let end = Math.min(start + maxLength, page.normalizedText.length);
      if (end < page.normalizedText.length) {
        const boundary = page.normalizedText.lastIndexOf(' ', end);
        if (boundary > start + maxLength / 2) end = boundary;
      }
      const text = page.normalizedText.slice(start, end);
      chunks.push({ id: `${page.id}:chunk:${start}-${end}`, source: sourceFor(page), text, startOffset: start, endOffset: end });
      start = end;
    }
    return chunks;
  });
}
const objectiveHeading = /^(?:(?:lecture\s+)?(?:learning\s+)?objectives?\b|(?:at|by) the end of (?:this|the) (?:lecture|session)\b|students should be able to\b)/i;
const listPrefix = /^(?:[•●▪–—*-]|\d+[.)]|[a-z][.)])\s*/i;
export function detectObjectives(pages: LecturePage[]): ObjectiveSuggestion[] {
  return pages.flatMap(page => {
    if (page.extractionStatus !== 'extracted') return [];
    const lines = page.normalizedText.split('\n');
    const start = lines.findIndex(line => objectiveHeading.test(line));
    if (start < 0) return [];
    const suggestions: ObjectiveSuggestion[] = [];
    const add = (text: string, index: number) => {
      const clean = text.replace(listPrefix, '').trim();
      if (clean.length < 8 || /^\d+$/.test(clean)) return;
      suggestions.push({ id: `${page.id}:objective:${index}`, text: clean, source: sourceFor(page), status: 'pending' });
    };
    const headingRemainder = lines[start].replace(objectiveHeading, '').replace(/^\s*[:.\-]?\s*(?:(?:you|students)\s+(?:will|should)\s+be\s+able\s+to\s*:?)?\s*/i, '');
    if (headingRemainder) add(headingRemainder, start);
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop at recognizable new section headings rather than absorbing unrelated text.
      if (/^(?:references|summary|introduction|overview|case\s+\d+|clinical features|pathogenesis)\s*[:.]?$/i.test(line)) break;
      if (objectiveHeading.test(line)) continue;
      add(line, i);
    }
    return suggestions;
  });
}
export function processingStatus(record: ProcessedLecture | undefined, currentFileId?: string): ProcessingStatus {
  if (!record) return 'not-processed';
  if (record.fileId !== currentFileId) return 'stale';
  return record.status;
}
export function latestProcessing(data: LibraryData, lectureId: string): ProcessedLecture | undefined {
  const currentFileId = data.lectures.find(l => l.id === lectureId)?.pdf?.id;
  const records = (data.processedLectures ?? []).filter(p => p.lectureId === lectureId);
  return records.find(p => p.fileId === currentFileId) ?? records.at(-1);
}
export function acceptObjective(data: LibraryData, lectureId: string, suggestionId: string): LibraryData {
  const lecture = data.lectures.find(l => l.id === lectureId);
  const record = latestProcessing(data, lectureId);
  if (!lecture?.pdf || !record || record.fileId !== lecture.pdf.id || record.status !== 'processed') return data;
  const suggestion = record.suggestions.find(s => s.id === suggestionId && s.status === 'pending');
  if (!suggestion || suggestion.source.lectureId !== lectureId || suggestion.source.fileId !== record.fileId
    || suggestion.source.pageIds.length !== 1 || !record.pages.some(p => p.id === suggestion.source.pageIds[0]
      && p.pageNumber === suggestion.source.pageNumbers[0] && p.normalizedText.includes(suggestion.text))) return data;
  const id = `${suggestion.id}:accepted`;
  const objective: LearningObjective = { id, lectureId, text: suggestion.text, reviewed: false,
    source: { kind: 'pdf', documentId: record.fileId, page: suggestion.source.pageNumbers[0], originalText: suggestion.text } };
  const duplicate = data.objectives.some(o => o.lectureId === lectureId && (o.id === id || o.text.trim() === suggestion.text.trim()));
  return { ...data, objectives: duplicate ? data.objectives : [...data.objectives, objective],
    processedLectures: data.processedLectures?.map(p => p.id === record.id ? { ...p, suggestions: p.suggestions.map(s => s.id === suggestionId ? { ...s, status: 'accepted' } : s) } : p) };
}

export function searchSources(data: LibraryData, selectedLectureIds: readonly string[], query: string): SourceChunk[] {
  // No scope means no access; demo/stale/failed content is never an implicit fallback.
  const scope = new Set(selectedLectureIds);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!scope.size || !terms.length) return [];
  return (data.processedLectures ?? []).flatMap(record => {
    const lecture = data.lectures.find(l => l.id === record.lectureId);
    if (!lecture || lecture.isDemo || !scope.has(lecture.id) || lecture.pdf?.id !== record.fileId || record.status !== 'processed') return [];
    return record.chunks.filter(chunk => chunk.source.lectureId === lecture.id && chunk.source.fileId === record.fileId
      && chunk.source.pageIds.length > 0 && chunk.source.pageNumbers.length === chunk.source.pageIds.length
      && chunk.source.pageIds.every((id, i) => record.pages.some(p => p.id === id && p.pageNumber === chunk.source.pageNumbers[i] && p.lectureId === lecture.id && p.fileId === record.fileId && p.extractionStatus === 'extracted'))
      && chunk.source.pageIds.length === 1
      && record.pages.some(p => p.id === chunk.source.pageIds[0] && chunk.text === p.normalizedText.slice(chunk.startOffset, chunk.endOffset))
      && terms.every(term => chunk.text.toLocaleLowerCase().includes(term)));
  });
}
