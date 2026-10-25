import { describe, expect, it } from 'vitest';
import { acceptObjective, createChunks, createPages, detectObjectives, normalizeText, processingStatus, searchSources } from './content';
import { applyProcessingResult, failedProcessing, processStoredPdf } from './service';
import { IndexedDbLibraryRepository } from '../library/storage';
import { addLecture, createPdfDocument, emptyLibrary, removeDemoData } from '../library/data';
import type { LibraryData } from '../library/models';
import type { ProcessedLecture } from './models';

function record(lectureId: string, fileId: string, text = 'Example source passage about a sample workflow.'): ProcessedLecture {
  const pages = createPages(lectureId, fileId, [{ pageNumber: 1, rawText: text }]);
  return { id: `${lectureId}:${fileId}:v1`, lectureId, fileId, filename: 'sample.pdf', pipelineVersion: 1, status: 'processed', processedAt: new Date().toISOString(), pages, chunks: createChunks(pages), suggestions: detectObjectives(pages) };
}
function dataWithSources(): LibraryData {
  let data = emptyLibrary();
  for (const number of [19, 21, 24, 35]) data = addLecture(data, { number, title: `Sample ${number}`, course: 'Course', module: 'Module', professor: '', exam: '', pdf: new File(['%PDF-1.7'], `sample-${number}.pdf`) }).data;
  data.processedLectures = data.lectures.map(l => record(l.id, l.pdf!.id));
  return data;
}

describe('Page preservation and chunk provenance', () => {
  it('keeps original text, normalizes whitespace only and gives repeatable page/chunk IDs', () => {
    const rawText = '  Example\ttext  \n  unchanged  words.  ';
    const pages = createPages('lecture', 'file', [{ pageNumber: 1, rawText }, { pageNumber: 2, rawText: 'A different page.' }]);
    expect(pages[0].rawText).toBe(rawText);
    expect(normalizeText(rawText)).toBe('Example text\nunchanged words.');
    expect(pages.map(p => p.pageNumber)).toEqual([1, 2]);
    const chunks = createChunks(pages, 12);
    for (const chunk of chunks) {
      const page = pages.find(p => p.id === chunk.source.pageIds[0])!;
      expect(chunk.source).toEqual({ lectureId: 'lecture', fileId: 'file', pageNumbers: [page.pageNumber], pageIds: [page.id] });
      expect(chunk.text).toBe(page.normalizedText.slice(chunk.startOffset, chunk.endOffset));
    }
    expect(createChunks(pages, 12)).toEqual(chunks);
    for (const page of pages) expect(chunks.filter(c => c.source.pageIds[0] === page.id).map(c => c.text).join('')).toBe(page.normalizedText);
  });
  it('distinguishes extracted, empty, failed and low-text pages without creating chunks from failures', () => {
    const pages = createPages('lecture', 'file', [{ pageNumber: 1, rawText: 'tiny' }, { pageNumber: 2, rawText: '  \n' }, { pageNumber: 3, rawText: '', error: 'Extraction failed' }]);
    expect(pages.map(p => p.extractionStatus)).toEqual(['extracted', 'empty', 'failed']);
    expect(pages.every(p => p.warning)).toBe(true);
    expect(createChunks(pages)).toHaveLength(1);
  });
});

describe('Strict Lecture Only retrieval', () => {
  it('only retrieves the explicit lecture scope, including nonconsecutive multi-lecture selections', () => {
    const data = dataWithSources();
    const [a, b, c, d] = data.lectures;
    expect(searchSources(data, [a.id], 'sample').map(c => c.source.lectureId)).toEqual([a.id]);
    expect(searchSources(data, [a.id, c.id, d.id], 'sample').map(c => c.source.lectureId)).toEqual([a.id, c.id, d.id]);
    expect(searchSources(data, [a.id, c.id], 'sample').some(c => c.source.lectureId === b.id)).toBe(false);
    expect(searchSources(data, [], 'sample')).toEqual([]);
    expect(searchSources(data, ['unknown'], 'sample')).toEqual([]);
    expect(searchSources(data, [a.id], 'absent')).toEqual([]);
    expect(searchSources(data, [a.id], ' ')).toEqual([]);
  });
  it('excludes stale, removed, demo, failed, and malformed-provenance content', () => {
    const data = dataWithSources();
    const ids = data.lectures.map(l => l.id);
    data.lectures[0].pdf = createPdfDocument(new File(['%PDF-2.0'], 'changed.pdf'), ids[0]);
    delete data.lectures[1].pdf;
    data.lectures[2].isDemo = true;
    data.processedLectures![3].status = 'failed';
    expect(searchSources(data, ids, 'sample')).toEqual([]);
    data.processedLectures![3].status = 'processed';
    data.processedLectures![3].chunks[0].source.pageIds = ['unknown-page'];
    expect(searchSources(data, ids, 'sample')).toEqual([]);
  });
  it('marks replaced and removed PDFs stale while retaining original sources for inspection', () => {
    const data = dataWithSources();
    const processed = data.processedLectures![0];
    expect(processingStatus(processed, data.lectures[0].pdf?.id)).toBe('processed');
    data.lectures[0].pdf = createPdfDocument(new File(['%PDF-2.0'], 'new.pdf'), data.lectures[0].id);
    expect(processingStatus(processed, data.lectures[0].pdf?.id)).toBe('stale');
    delete data.lectures[0].pdf;
    expect(processingStatus(processed, undefined)).toBe('stale');
    expect(processed.pages[0].normalizedText).toContain('Example source');
  });
});

describe('Objective suggestions', () => {
  it.each(['Learning Objectives', 'Objectives', 'At the end of this lecture...', 'Students should be able to...'])('detects only text following %s', heading => {
    const pages = createPages('lecture', 'file', [{ pageNumber: 1, rawText: `${heading}\n1. Explain the example workflow.\n2. Compare the sample stages.\nReferences\nNot an objective.` }]);
    expect(detectObjectives(pages).map(s => s.text)).toEqual(['Explain the example workflow.', 'Compare the sample stages.']);
    expect(detectObjectives(pages).every(s => s.status === 'pending' && s.source.pageNumbers[0] === 1)).toBe(true);
  });
  it('does not infer objectives from arbitrary content', () => {
    expect(detectObjectives(createPages('lecture', 'file', [{ pageNumber: 1, rawText: 'An ordinary text slide with no objectives heading.' }]))).toEqual([]);
  });
  it('preserves manual objectives, requires review/acceptance, avoids duplicates, and blocks stale suggestions', () => {
    const data = dataWithSources();
    const lecture = data.lectures[0];
    const processed = record(lecture.id, lecture.pdf!.id, 'Learning Objectives\nExplain the example workflow.');
    data.processedLectures = [processed];
    data.objectives = [{ id: 'manual', lectureId: lecture.id, text: 'My manual objective', reviewed: true, source: { kind: 'manual' } }];
    expect(data.objectives).toHaveLength(1);
    const updated = acceptObjective(data, lecture.id, processed.suggestions[0].id);
    expect(updated.objectives[0]).toEqual(data.objectives[0]);
    expect(updated.objectives).toHaveLength(2);
    expect(updated.objectives[1].source).toMatchObject({ kind: 'pdf', documentId: lecture.pdf!.id, page: 1 });
    expect(acceptObjective(updated, lecture.id, processed.suggestions[0].id).objectives).toHaveLength(2);
    lecture.pdf = createPdfDocument(new File(['%PDF-2.0'], 'new.pdf'), lecture.id);
    expect(acceptObjective(data, lecture.id, processed.suggestions[0].id)).toBe(data);
  });
});

describe('Stored processing service', () => {
  it('persists processed pages, chunks, metadata, suggestion decisions and accepted objectives across reinitialization', async () => {
    const data = dataWithSources();
    const lecture = data.lectures[0];
    const repository = new IndexedDbLibraryRepository('processed-persistence');
    await repository.save({ data, selected: [lecture.id] }, 0);
    const processed = await processStoredPdf(repository, lecture.id, lecture.pdf!.id, async () => [{ pageNumber: 1, rawText: 'Learning Objectives\nExplain the sample workflow.' }, { pageNumber: 2, rawText: '' }, { pageNumber: 3, rawText: '', error: 'A page failure' }]);
    expect(processed.pages.map(p => p.extractionStatus)).toEqual(['extracted', 'empty', 'failed']);
    data.processedLectures = [processed];
    const accepted = acceptObjective(data, lecture.id, processed.suggestions[0].id);
    await repository.save({ data: accepted, selected: [lecture.id] }, 1);
    const restored = await new IndexedDbLibraryRepository('processed-persistence').load();
    expect(restored?.snapshot.data.processedLectures).toEqual(accepted.processedLectures);
    expect(restored?.snapshot.data.objectives).toEqual(accepted.objectives);
    expect(searchSources(restored!.snapshot.data, [lecture.id], 'sample')).toHaveLength(1);
    restored!.snapshot.data.lectures[0].pdf = createPdfDocument(new File(['%PDF-2.0'], 'changed.pdf'), lecture.id);
    await repository.save(restored!.snapshot, 2);
    const afterReplace = (await repository.load())!.snapshot.data;
    expect(processingStatus(afterReplace.processedLectures![0], afterReplace.lectures[0].pdf!.id)).toBe('stale');
    expect(searchSources(afterReplace, [lecture.id], 'sample')).toEqual([]);
    delete afterReplace.lectures[0].pdf;
    await repository.save({ data: afterReplace, selected: [] }, 3);
    expect((await repository.load())?.snapshot.data.processedLectures).toHaveLength(1);
  });
  it('handles all-page failure and refuses missing, mismatched or invalid page references', async () => {
    const data = dataWithSources();
    const lecture = data.lectures[0];
    const repo = new IndexedDbLibraryRepository('failed-processing');
    await repo.save({ data, selected: [] }, 0);
    await expect(processStoredPdf(repo, lecture.id, 'missing')).rejects.toThrow('not available');
    await expect(processStoredPdf(repo, 'other-lecture', lecture.pdf!.id)).rejects.toThrow('does not belong');
    const result = await processStoredPdf(repo, lecture.id, lecture.pdf!.id, async () => [{ pageNumber: 1, rawText: '', error: 'Could not read' }]);
    expect(result.status).toBe('failed'); expect(result.chunks).toEqual([]);
    await expect(processStoredPdf(repo, lecture.id, lecture.pdf!.id, async () => [])).rejects.toThrow('No pages');
    await expect(processStoredPdf(repo, lecture.id, lecture.pdf!.id, async () => [{ pageNumber: 0, rawText: '' }])).rejects.toThrow('references');
  });
  it('keeps the original version-one snapshot usable and drops demo processed data when demos are removed', async () => {
    const repo = new IndexedDbLibraryRepository('old-snapshot');
    const data = emptyLibrary();
    expect(data.processedLectures).toBeUndefined();
    await repo.save({ data, selected: [] }, 0);
    expect(searchSources((await repo.load())!.snapshot.data, ['any'], 'text')).toEqual([]);
    const withSources = dataWithSources(); withSources.lectures[0].isDemo = true;
    expect(removeDemoData(withSources).processedLectures?.some(p => p.lectureId === withSources.lectures[0].id)).toBe(false);
  });
});


describe('Processing result updates', () => {
  it('retains previous PDF versions, manual objectives and review decisions without mixing current retrieval', () => {
    const data = dataWithSources();
    const lecture = data.lectures[0];
    const first = record(lecture.id, lecture.pdf!.id, 'Learning Objectives\nExplain the sample workflow.');
    const withFirst = applyProcessingResult(data, first);
    const accepted = acceptObjective(withFirst, lecture.id, first.suggestions[0].id);
    const retried = applyProcessingResult(accepted, { ...first });
    expect(retried.processedLectures?.find(p => p.id === first.id)?.suggestions[0].status).toBe('accepted');
    expect(retried.objectives).toEqual(accepted.objectives);
    const replacement = createPdfDocument(new File(['%PDF-2.0'], 'replacement.pdf'), lecture.id);
    const replaced = { ...retried, lectures: retried.lectures.map(l => l.id === lecture.id ? { ...l, pdf: replacement } : l) };
    const second = record(lecture.id, replacement.id, 'The new source has different content.');
    const withSecond = applyProcessingResult(replaced, second);
    expect(withSecond.processedLectures?.find(p => p.id === first.id)?.pages).toEqual(first.pages);
    expect(searchSources(withSecond, [lecture.id], 'workflow')).toEqual([]);
    expect(searchSources(withSecond, [lecture.id], 'different')).toHaveLength(1);
    const failed = applyProcessingResult(withSecond, failedProcessing(lecture.id, replacement, new Error('Unreadable')));
    expect(failed.processedLectures?.find(p => p.id === second.id)?.pages).toEqual(second.pages);
    expect(searchSources(failed, [lecture.id], 'different')).toEqual([]);
    expect(failed.objectives).toEqual(accepted.objectives);
  });
});
