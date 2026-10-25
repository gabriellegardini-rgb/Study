import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Lecture, LibraryData } from '../library/models';
import { libraryRepository } from '../library/storage';
import { acceptObjective, latestProcessing, processingStatus } from './content';
import { applyProcessingResult, failedProcessing, processStoredPdf } from './service';
import type { ProcessedLecture } from './models';

const labels = { 'not-processed': 'Not processed', processing: 'Processing', processed: 'Processed', failed: 'Processing failed', stale: 'PDF changed — reprocessing required' };
export default function ProcessingPanel({ lecture, data, setData, initialPage }: {
  lecture: Lecture; data: LibraryData; setData: Dispatch<SetStateAction<LibraryData>>; initialPage?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [sourceOpen, setSourceOpen] = useState(initialPage !== undefined);
  const [pageNumber, setPageNumber] = useState(initialPage ?? 1);
  const [viewFileId, setViewFileId] = useState<string>();
  const records = (data.processedLectures ?? []).filter(p => p.lectureId === lecture.id);
  const record = latestProcessing(data, lecture.id);
  const sourceRecord = records.find(p => p.fileId === viewFileId) ?? record;
  const status = processingStatus(record, lecture.pdf?.id);
  const current = status !== 'stale';
  const page = sourceRecord?.pages.find(p => p.pageNumber === pageNumber) ?? sourceRecord?.pages[0];
  const flagged = record?.pages.filter(p => p.warning).length ?? 0;
  async function process() {
    const pdf = lecture.pdf;
    if (!pdf || busy) return;
    setBusy(true); setProgress('Opening PDF…');
    let result: ProcessedLecture;
    try {
      result = await processStoredPdf(libraryRepository, lecture.id, pdf.id, undefined, (page, total) => setProgress(`Reading page ${page} of ${total}…`));
    } catch (e) {
      result = failedProcessing(lecture.id, pdf, e);
    }
    setData(d => applyProcessingResult(d, result));
    setBusy(false); setProgress('');
  }
  return <section className="processing-panel" aria-labelledby="processing-heading">
    <div className="section-heading"><div><p className="eyebrow">GROUNDED IN YOUR LECTURE</p><h2 id="processing-heading">Lecture content</h2></div><span className="badge">{busy ? labels.processing : !lecture.pdf && record ? 'PDF removed — sources archived' : labels[status]}</span></div>
    {!record && <p className="muted">Capture the text in your PDF, page by page, so you can check and search your lecture.</p>}
    {status === 'stale' && <p className="source-warning">These sources belong to a previous PDF and are excluded from search. {lecture.pdf ? 'Process the current PDF to update them.' : 'Attach a PDF to process new content.'} Previously accepted objectives remain in your list with their original source references.</p>}
    {lecture.pdf && <button className="button" disabled={busy} onClick={process}>{busy ? 'Processing…' : record ? 'Reprocess Lecture' : 'Process Lecture'}</button>}
    {busy && <p role="status">{progress}</p>}
    {record?.error && <p role="alert">{record.error}</p>}
    {record?.status === 'failed' && record.pages.length > 0 && <p className="source-warning">Previously captured pages are retained for inspection. They are excluded from search until processing succeeds.</p>}
    {record && <>
      <dl className="processing-stats"><div><dt>Pages read</dt><dd>{record.pages.length}</dd></div><div><dt>Source chunks</dt><dd>{record.chunks.length}</dd></div><div><dt>Objective suggestions</dt><dd>{record.suggestions.length}</dd></div><div><dt>{record.status === 'failed' && !record.pages.length ? 'Last attempted' : 'Last processed'}</dt><dd>{new Date(record.processedAt).toLocaleString()}</dd></div></dl>
      {flagged > 0 && <p className="source-warning">{flagged} {flagged === 1 ? 'page needs' : 'pages need'} a closer look. Images, diagrams, and image-only slides may not have extractable text. No OCR is applied.</p>}
      {records.some(r => r.pages.length > 0) && <details className="source-viewer" open={sourceOpen} onToggle={e => setSourceOpen(e.currentTarget.open)}>
        <summary>Inspect source pages{sourceRecord?.fileId !== lecture.pdf?.id ? ' (previous PDF)' : ''}</summary>
        {records.length > 1 && <label>Source PDF version<select value={sourceRecord?.fileId} onChange={e => { setViewFileId(e.target.value); setPageNumber(1); }}>{records.map((r, i) => <option key={r.id} value={r.fileId}>{r.filename} · {r.fileId === lecture.pdf?.id ? 'Current PDF' : `Previous PDF ${i + 1}`}</option>)}</select></label>}
        <p className="muted">Source: {sourceRecord?.filename}. Page numbers refer to PDF pages, not printed slide numbers.</p>
        <label>PDF page<select value={page?.pageNumber ?? 1} onChange={e => setPageNumber(Number(e.target.value))}>{sourceRecord?.pages.map(p => <option key={p.id} value={p.pageNumber}>Page {p.pageNumber}{p.warning ? ' · Check extraction' : ''}</option>)}</select></label>
        {page && <article><h3>PDF page {page.pageNumber}</h3><p className="muted">{page.extractionStatus === 'extracted' ? 'Text extracted' : page.extractionStatus === 'empty' ? 'No extractable text' : 'Extraction failed'}</p>
          {page.warning && <p className="source-warning">{page.warning}</p>}
          <h4>Extracted text</h4><pre aria-label={`Extracted text for PDF page ${page.pageNumber}`} className="source-text">{page.rawText || 'No text captured.'}</pre>
          <details><summary>Normalized text</summary><pre className="source-text">{page.normalizedText || 'No text captured.'}</pre></details>
          <h4>Source chunks on this page</h4>{sourceRecord?.chunks.filter(c => c.source.pageIds.includes(page.id)).map((c, index) => <div className="source-chunk" key={c.id}><strong>Chunk {index + 1} · PDF page {page.pageNumber}</strong><p>{c.text}</p></div>)}
          {!sourceRecord?.chunks.some(c => c.source.pageIds.includes(page.id)) && <p className="muted">No usable source chunks on this page.</p>}
        </article>}
      </details>}
      {current && record.status === 'processed' && <section className="suggestions" aria-labelledby="suggestions-heading"><h3 id="suggestions-heading">Suggested learning objectives</h3><p className="muted">Detected from headings and text in your PDF. Review each suggestion against the source before accepting; nothing is added automatically.</p>
        {!record.suggestions.length && <p className="empty-state">No objectives were detected. You can enter them manually below.</p>}
        {record.suggestions.map(s => <article className="suggestion" key={s.id}><p>{s.text}</p><span className="muted">PDF page {s.source.pageNumbers.join(', ')} · {s.status}</span>
          <div className="actions"><button onClick={() => { setViewFileId(record.fileId); setPageNumber(s.source.pageNumbers[0]); setSourceOpen(true); }}>Inspect page {s.source.pageNumbers[0]}</button>{s.status === 'pending' && <>
            <button onClick={() => setData(d => acceptObjective(d, lecture.id, s.id))}>Accept objective</button>
            <button onClick={() => setData(d => ({ ...d, processedLectures: d.processedLectures?.map(p => p.id === record.id ? { ...p, suggestions: p.suggestions.map(item => item.id === s.id ? { ...item, status: 'dismissed' } : item) } : p) }))}>Dismiss</button>
          </>}</div>
        </article>)}
      </section>}
    </>}
  </section>;
}
