import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Lecture, LibraryData, StudyStatus } from './models';
import PdfAttachment from './PdfAttachment';
import ProcessingPanel from '../processing/ProcessingPanel';
import { studyStatusLabels } from './models';

export default function LectureDetail({ lecture, data, setData, onBack, initialPage }: {
  initialPage?: number; lecture: Lecture; data: LibraryData; setData: Dispatch<SetStateAction<LibraryData>>; onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const module = data.modules.find(m => m.id === lecture.moduleId)!;
  const course = data.courses.find(c => c.id === module.courseId)!;
  const objectives = data.objectives.filter(o => o.lectureId === lecture.id);
  const reviewed = objectives.filter(o => o.reviewed).length;
  return <>
    <button onClick={onBack} className="back-button">← All lectures</button>
    <section className="detail-header">
      <p className="eyebrow">{course.name} / {module.name}</p>
      <p className="muted">Lecture {lecture.number}{lecture.isDemo ? ' · Demo' : ''}</p>
      <h1 ref={heading} tabIndex={-1}>{lecture.title}</h1>
      <div className="metadata"><span>Professor: {lecture.professor || 'Not added'}</span><span>Exam: {data.exams.find(e => e.id === lecture.examId)?.name || 'Not associated'}</span></div>
      <div className="detail-tools"><label>Study status (self-assessed)<select value={lecture.status} onChange={e => setData(d => ({ ...d, lectures: d.lectures.map(l => l.id === lecture.id ? { ...l, status: e.target.value as StudyStatus, statusSource: 'self-reported' } : l) }))}>{Object.entries(studyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <PdfAttachment lecture={lecture} onChange={pdf => setData(d => ({ ...d, lectures: d.lectures.map(l => l.id === lecture.id ? { ...l, pdf } : l) }))} />
      </div>
    </section>
    <ProcessingPanel lecture={lecture} data={data} setData={setData} initialPage={initialPage} />
    <section className="objective-panel" aria-labelledby="objectives-heading">
      <div className="section-heading"><h2 id="objectives-heading">Learning objectives</h2><span className="badge">{reviewed} / {objectives.length} reviewed</span></div>
      {objectives.length > 0 ? <><progress aria-label="Objectives reviewed" value={reviewed} max={objectives.length} /><ul className="objective-list">{objectives.map((objective, i) => <li key={objective.id}>
        {editing === objective.id ? <form className="objective-edit" onSubmit={e => { e.preventDefault(); if (!editText.trim()) return; setData(d => ({ ...d, objectives: d.objectives.map(o => o.id === objective.id ? { ...o, text: editText.trim(), reviewed: false, source: o.source.kind === 'pdf' ? { ...o.source, edited: true } : o.source } : o) })); setEditing(null); }}>
          <label>Edit objective<textarea autoFocus required value={editText} onChange={e => setEditText(e.target.value)} /></label><div className="actions"><button className="button">Save objective</button><button type="button" onClick={() => setEditing(null)}>Cancel edit</button></div>
        </form> : <><label className="objective-check"><input type="checkbox" checked={objective.reviewed} onChange={() => setData(d => ({ ...d, objectives: d.objectives.map(o => o.id === objective.id ? { ...o, reviewed: !o.reviewed } : o) }))} /><span>{objective.text}<small>{objective.reviewed ? 'Reviewed' : 'Not reviewed'} · {objective.source.kind === 'manual' ? 'Manually entered' : `Accepted from PDF page ${objective.source.page}${objective.source.edited ? ' · Edited' : ''}${objective.source.documentId !== lecture.pdf?.id ? ' · Previous PDF' : ''}`}</small></span></label>
          <div className="actions"><button aria-label={`Edit objective ${i + 1}`} onClick={() => { setEditing(objective.id); setEditText(objective.text); }}>Edit</button><button aria-label={`Delete objective ${i + 1}`} onClick={() => setData(d => ({ ...d, objectives: d.objectives.filter(o => o.id !== objective.id) }))}>Delete</button></div></>}
      </li>)}</ul></> : <p className="empty-state">Start with the learning objectives from your lecture. Each one gives your study a clear direction.</p>}
      <form className="objective-add" onSubmit={e => { e.preventDefault(); if (!draft.trim()) return; const id = crypto.randomUUID(); setData(d => ({ ...d, objectives: [...d.objectives, { id, lectureId: lecture.id, text: draft.trim(), reviewed: false, source: { kind: 'manual' } }] })); setDraft(''); }}>
        <label>New learning objective<textarea required value={draft} onChange={e => setDraft(e.target.value)} placeholder="Enter an objective from your lecture…" /></label><button className="button" disabled={!draft.trim()}>Add objective</button>
      </form>
    </section>
    <section className="future-grid" aria-label="Future study insights">{[
      ['Quiz performance', 'No quiz attempts yet.'], ['Weak concepts', 'Concept insights will appear after practice.'],
      ['High-yield notes', 'Your lecture notes will have a home here.'], ['Question history', 'No questions answered for this lecture.'],
    ].map(([title, text]) => <article key={title} className="card"><span className="coming-soon">Planned</span><h3>{title}</h3><p>{text}</p></article>)}</section>
  </>;
}
