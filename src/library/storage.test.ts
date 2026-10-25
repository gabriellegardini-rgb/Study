import { describe, expect, it } from 'vitest';
import { addLecture, createPdfDocument, emptyLibrary, removeDemoData } from './data';
import { createDemoLibrary } from './demo';
import { IndexedDbLibraryRepository } from './storage';
import { readBlob, validatePdf } from './pdf';

function setup() {
  const name = `test-${crypto.randomUUID()}`;
  const repo = new IndexedDbLibraryRepository(name);
  const file = new File(['%PDF-1.7\nexample'], 'original.pdf', { type: 'application/pdf' });
  const { data, lectureId } = addLecture(emptyLibrary(), { number: 19, title: 'Personal lecture', course: 'Course', module: 'Block', professor: 'Professor', exam: 'Exam', pdf: file });
  data.lectures[0].status = 'improving';
  data.objectives.push({ id: 'objective', lectureId, text: 'A manually entered objective', reviewed: true, source: { kind: 'manual' } });
  return { name, repo, data, lectureId, file };
}

describe('IndexedDB library repository', () => {
  it('restores lectures, objectives, organization, status, exams and selection after repository reinitialization', async () => {
    const { name, repo, data, lectureId } = setup();
    expect(await repo.load()).toBeNull();
    await repo.save({ data, selected: [lectureId, 'deleted-id'] }, 0);
    const loaded = await new IndexedDbLibraryRepository(name).load();
    expect(loaded?.snapshot.data.lectures[0]).toMatchObject({ id: lectureId, status: 'improving', professor: 'Professor', examId: data.exams[0].id });
    expect(loaded?.snapshot.data.courses).toEqual(data.courses);
    expect(loaded?.snapshot.data.modules).toEqual(data.modules);
    expect(loaded?.snapshot.data.exams).toEqual(data.exams);
    expect(loaded?.snapshot.data.objectives).toEqual(data.objectives);
    expect(loaded?.snapshot.selected).toEqual([lectureId]);
    expect(loaded?.missingFileIds).toEqual([]);
    expect(loaded?.snapshot.data.lectures[0].pdf).not.toHaveProperty('file');
    // Subsequent objective edits/deletions and status changes persist as well.
    loaded!.snapshot.data.objectives[0].text = 'Updated objective';
    loaded!.snapshot.data.objectives[0].reviewed = false;
    await repo.save(loaded!.snapshot, 1);
    expect((await repo.load())?.snapshot.data.objectives[0]).toMatchObject({ text: 'Updated objective', reviewed: false });
    loaded!.snapshot.data.objectives = [];
    await repo.save(loaded!.snapshot, 2);
    expect((await repo.load())?.snapshot.data.objectives).toEqual([]);
  });

  it('persists complete PDF metadata and retrieves the binary by stable file ID', async () => {
    const { repo, data, lectureId, file } = setup();
    await repo.save({ data, selected: [] }, 0);
    const id = data.lectures[0].pdf!.id;
    const stored = await repo.getPdf(id);
    expect(stored?.metadata).toEqual({ id, lectureId, name: 'original.pdf', type: 'application/pdf', size: file.size, uploadedAt: data.lectures[0].pdf!.uploadedAt });
    expect(Number.isNaN(Date.parse(stored!.metadata.uploadedAt))).toBe(false);
    expect(new Uint8Array(await readBlob(stored!.blob))).toEqual(new Uint8Array(await readBlob(file)));
  });

  it('replaces and removes a PDF atomically, deleting obsolete binary records', async () => {
    const { repo, data, lectureId } = setup();
    await repo.save({ data, selected: [] }, 0);
    const oldId = data.lectures[0].pdf!.id;
    const replacement = createPdfDocument(new File(['%PDF-2.0\nreplacement'], 'replacement.pdf', { type: 'application/pdf' }), lectureId);
    data.lectures[0].pdf = replacement;
    await repo.save({ data, selected: [] }, 1);
    expect(await repo.getPdf(oldId)).toBeNull();
    expect((await repo.getPdf(replacement.id))?.metadata.name).toBe('replacement.pdf');
    delete data.lectures[0].pdf;
    await repo.save({ data, selected: [] }, 2);
    expect(await repo.getPdf(replacement.id)).toBeNull();
    expect((await repo.load())?.snapshot.data.lectures[0].pdf).toBeUndefined();
  });

  it('rejects stale writes and preserves the last committed PDF and lecture', async () => {
    const { repo, data, lectureId } = setup();
    await repo.save({ data, selected: [] }, 0);
    const oldId = data.lectures[0].pdf!.id;
    data.lectures[0].pdf = createPdfDocument(new File(['%PDF-2.0'], 'new.pdf'), lectureId);
    await expect(repo.save({ data, selected: [] }, 0)).rejects.toThrow('another tab');
    expect((await repo.load())?.snapshot.data.lectures[0].pdf?.id).toBe(oldId);
    expect(await repo.getPdf(oldId)).not.toBeNull();
    expect(await repo.getPdf(data.lectures[0].pdf!.id)).toBeNull();
  });


  it('rolls back both stores if a new binary cannot be cloned', async () => {
    const { repo, data, lectureId } = setup();
    await repo.save({ data, selected: [] }, 0);
    const oldId = data.lectures[0].pdf!.id;
    const replacement = createPdfDocument(new File(['%PDF-2.0'], 'replacement.pdf'), lectureId);
    replacement.file = (() => undefined) as unknown as Blob;
    data.lectures[0].pdf = replacement;
    await expect(repo.save({ data, selected: [] }, 1)).rejects.toThrow();
    expect((await repo.load())?.revision).toBe(1);
    expect((await repo.load())?.snapshot.data.lectures[0].pdf?.id).toBe(oldId);
    expect(await repo.getPdf(oldId)).not.toBeNull();
    expect(await repo.getPdf(replacement.id)).toBeNull();
  });

  it('reports a missing binary without dropping lecture or objective records', async () => {
    const { repo, data } = setup();
    const id = data.lectures[0].pdf!.id;
    delete data.lectures[0].pdf!.file;
    await repo.save({ data, selected: [] }, 0);
    expect((await repo.load())?.missingFileIds).toEqual([id]);
    expect((await repo.load())?.snapshot.data.objectives).toHaveLength(1);
    expect(await repo.getPdf(id)).toBeNull();
  });

  it('persists demo removal and retains user records', async () => {
    const repo = new IndexedDbLibraryRepository(`demo-${crypto.randomUUID()}`);
    const { data, lectureId } = addLecture(createDemoLibrary(), { number: 1, title: 'Real lecture', course: 'Course', module: 'Block', professor: '', exam: '' });
    await repo.save({ data, selected: [] }, 0);
    await repo.save({ data: removeDemoData(data), selected: [] }, 1);
    expect((await repo.load())?.snapshot.data.lectures.map(l => l.id)).toEqual([lectureId]);
  });
});

describe('PDF validation', () => {
  it('accepts a PDF header and rejects empty, disguised and non-PDF files', async () => {
    await expect(validatePdf(new File(['%PDF-1.7'], 'ok.pdf', { type: 'application/pdf' }))).resolves.toBeUndefined();
    await expect(validatePdf(new File(['plain text'], 'fake.pdf'))).rejects.toThrow('header');
    await expect(validatePdf(new File([], 'empty.pdf'))).rejects.toThrow('header');
    await expect(validatePdf(new File(['%PDF-1.7'], 'wrong.txt'))).rejects.toThrow('Choose a PDF');
    await expect(validatePdf(new File(['%PDF-1.7'], 'wrong.pdf', { type: 'text/plain' }))).rejects.toThrow('Choose a PDF');
  });
});
