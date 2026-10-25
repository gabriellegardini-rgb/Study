import type { LibrarySnapshot, PdfDocument } from './models';

export interface LoadedLibrary { snapshot: LibrarySnapshot; revision: number; missingFileIds: string[] }
export interface LibraryRepository {
  load(): Promise<LoadedLibrary | null>;
  save(snapshot: LibrarySnapshot, expectedRevision: number): Promise<number>;
  getPdf(id: string): Promise<{ metadata: Omit<PdfDocument, 'file'>; blob: Blob } | null>;
}
interface StoredState { key: 'library'; snapshot: LibrarySnapshot; revision: number }
interface StoredPdf { metadata: Omit<PdfDocument, 'file'>; blob: Blob }
const DB_NAME = 'sgu-study-library';
export class IndexedDbLibraryRepository implements LibraryRepository {
  constructor(private name = DB_NAME) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('Browser storage is unavailable. Enable site storage and try again.')); return; }
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('state', { keyPath: 'key' });
        db.createObjectStore('pdfs', { keyPath: 'metadata.id' });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other study tabs to allow a storage upgrade.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });
  }
  async load(): Promise<LoadedLibrary | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['state', 'pdfs'], 'readonly');
      const state = tx.objectStore('state').get('library');
      const keys = tx.objectStore('pdfs').getAllKeys();
      tx.oncomplete = () => {
        db.close();
        const record = state.result as StoredState | undefined;
        if (!record) { resolve(null); return; }
        const files = new Set(keys.result);
        resolve({ snapshot: record.snapshot, revision: record.revision,
          missingFileIds: record.snapshot.data.lectures.flatMap(l => l.pdf && !files.has(l.pdf.id) ? [l.pdf.id] : []) });
      };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Unable to load your library.')); };
    });
  }
  async save(snapshot: LibrarySnapshot, expectedRevision: number): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['state', 'pdfs'], 'readwrite');
      const state = tx.objectStore('state');
      const pdfs = tx.objectStore('pdfs');
      let failure: Error | null = null;
      const current = state.get('library');
      current.onsuccess = () => {
        if (((current.result as StoredState | undefined)?.revision ?? 0) !== expectedRevision) {
          failure = new Error('Your library changed in another tab. Keep this tab open to preserve unsaved edits; use the latest tab before continuing.');
          tx.abort(); return;
        }
        try {
        const referenced = new Set<string>();
        const lectures = snapshot.data.lectures.map(lecture => {
          if (!lecture.pdf) return lecture;
          const { file, ...metadata } = lecture.pdf;
          referenced.add(metadata.id);
          if (file) {
            const existing = pdfs.get(metadata.id);
            existing.onsuccess = () => {
              try { if (!existing.result) pdfs.put({ metadata, blob: file } satisfies StoredPdf); }
              catch (e) { failure = e instanceof Error ? e : new Error('Unable to store this PDF.'); tx.abort(); }
            };
          }
          return { ...lecture, pdf: metadata };
        });
        const keys = pdfs.getAllKeys();
        keys.onsuccess = () => { for (const key of keys.result) if (!referenced.has(String(key))) pdfs.delete(key); };
        state.put({ key: 'library', snapshot: { data: { ...snapshot.data, lectures }, selected: snapshot.selected.filter(id => lectures.some(l => l.id === id)) }, revision: expectedRevision + 1 } satisfies StoredState);
        } catch (e) {
          failure = e instanceof Error ? e : new Error('Unable to save your library.');
          tx.abort();
        }
      };
      tx.oncomplete = () => { db.close(); resolve(expectedRevision + 1); };
      tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('Unable to save your library.')); };
    });
  }
  async getPdf(id: string): Promise<StoredPdf | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const request = tx.objectStore('pdfs').get(id);
      tx.oncomplete = () => { db.close(); resolve(request.result ?? null); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Unable to read this PDF.')); };
    });
  }
}
export const libraryRepository: LibraryRepository = new IndexedDbLibraryRepository();
