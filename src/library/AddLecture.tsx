import { useState, type FormEvent } from 'react';
import { validatePdf } from './pdf';
import type { LibraryData, NewLecture } from './models';

export default function AddLecture({ data, onSave, onCancel }: { data: LibraryData; onSave: (input: NewLecture) => void; onCancel: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? '');
    const fileInput = event.currentTarget.elements.namedItem('pdf') as HTMLInputElement;
    const file = fileInput.files?.[0];
    setBusy(true);
    try {
      if (file) await validatePdf(file);
      onSave({ number: Number(field('number')), title: field('title'), course: field('course'), module: field('module'),
        professor: field('professor'), exam: field('exam'), pdf: file });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to add lecture.'); } finally { setBusy(false); }
  }
  return <section className="form-panel" aria-labelledby="add-heading">
    <p className="eyebrow">GROW YOUR LIBRARY</p><h1 id="add-heading">Add a lecture</h1>
    <p className="muted">Give your lecture a home. You can add its learning objectives next.</p>
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Lecture number<input autoFocus name="number" type="number" min="1" step="1" required /></label>
        <label>Lecture title<input name="title" required maxLength={200} /></label>
        <label>Course<input name="course" list="course-options" required maxLength={120} /></label>
        <label>Block / module<input name="module" list="module-options" required maxLength={120} /></label>
        <label>Professor (optional)<input name="professor" maxLength={120} /></label>
        <label>Exam association (optional)<input name="exam" list="exam-options" maxLength={120} /></label>
      </div>
      <datalist id="course-options">{data.courses.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="module-options">{[...new Set(data.modules.map(m => m.name))].map(name => <option key={name} value={name} />)}</datalist>
      <datalist id="exam-options">{[...new Set(data.exams.map(e => e.name))].map(name => <option key={name} value={name} />)}</datalist>
      <label className="file-field">Lecture PDF (optional)<input name="pdf" type="file" accept=".pdf,application/pdf" /></label>
      {error && <p role="alert">{error}</p>}
      <div className="actions"><button className="button" type="submit" disabled={busy}>{busy ? 'Checking PDF…' : 'Add lecture'}</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}
