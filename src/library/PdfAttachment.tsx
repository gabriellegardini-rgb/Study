import { useEffect, useState } from 'react';
import type { Lecture, PdfDocument } from './models';
import { createPdfDocument } from './data';
import { validatePdf } from './pdf';
import { libraryRepository } from './storage';

export default function PdfAttachment({ lecture, onChange }: { lecture: Lecture; onChange: (pdf: PdfDocument | undefined) => void }) {
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const pdf = lecture.pdf;
  useEffect(() => {
    let active = true;
    setMissing(false); setError('');
    if (pdf && !pdf.file) libraryRepository.getPdf(pdf.id).then(result => {
      if (active) setMissing(!result);
    }).catch(() => { if (active) setError('This PDF could not be checked. Try reopening this lecture.'); });
    return () => { active = false; };
  }, [pdf]);
  return <div className="pdf-status">
    <strong>{pdf ? 'PDF attached' : 'No PDF attached'}</strong>
    {pdf && <><span>{pdf.name}</span><small>{(pdf.size / 1024 / 1024).toFixed(2)} MB · Added {new Date(pdf.uploadedAt).toLocaleDateString()}</small></>}
    {missing && <p role="alert">This PDF is missing from browser storage. Your lecture is intact. Please attach the file again.</p>}
    {error && <p role="alert">{error}</p>}
    <label>{pdf ? 'Replace PDF' : 'Attach PDF'}<input aria-label={pdf ? 'Replace PDF' : 'Attach PDF'} type="file" accept=".pdf,application/pdf" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setBusy(true); setError('');
      try { await validatePdf(file); onChange(createPdfDocument(file, lecture.id)); }
      catch (e) { setError(e instanceof Error ? e.message : 'Unable to read this file.'); }
      finally { setBusy(false); }
    }} /></label>
    {pdf && <button type="button" onClick={() => onChange(undefined)}>Remove PDF</button>}
  </div>;
}
