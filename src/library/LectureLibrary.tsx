import { useState, type Dispatch, type SetStateAction } from 'react';
import type { LibraryData, StudyStatus } from './models';
import { studyStatusLabels } from './models';
import { addLecture, removeDemoData, toggleGroupSelection } from './data';
import AddLecture from './AddLecture';
import LectureDetail from './LectureDetail';
import SourceSearch from '../processing/SourceSearch';

export default function LectureLibrary({ data, setData, selected, setSelected }: { data: LibraryData; setData: Dispatch<SetStateAction<LibraryData>>; selected: string[]; setSelected: Dispatch<SetStateAction<string[]>> }) {
  const [adding, setAdding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StudyStatus | ''>('');
  const lecture = data.lectures.find(l => l.id === activeId);
  if (adding) return <AddLecture data={data} onCancel={() => setAdding(false)} onSave={input => { const result = addLecture(data, input); setData(result.data); setAdding(false); setActiveId(result.lectureId); }} />;
  if (lecture) return <LectureDetail initialPage={sourcePage} key={lecture.id} lecture={lecture} data={data} setData={setData} onBack={() => { setActiveId(null); setSourcePage(undefined); }} />;
  const visible = data.lectures.filter(l => {
    const module = data.modules.find(m => m.id === l.moduleId)!;
    const course = data.courses.find(c => c.id === module.courseId)!;
    return (!status || status === l.status) && `${l.number} ${l.title} ${l.professor ?? ''} ${module.name} ${course.name}`.toLowerCase().includes(search.toLowerCase().trim());
  });
  return <>
    <div className="library-heading"><div><p className="eyebrow">YOUR KNOWLEDGE, ORGANIZED</p><h1>Lecture library</h1><p className="muted">A place for every lecture. A clearer path to your next exam.</p></div><button className="button" onClick={() => setAdding(true)}>+ Add lecture</button></div>
    {data.lectures.some(l => l.isDemo) && <aside className="demo-banner"><span><strong>Take a look around.</strong> Demo lectures show how your library can look.</span><button onClick={() => { setSelected(ids => ids.filter(id => data.lectures.some(l => l.id === id && !l.isDemo))); setData(removeDemoData(data)); }}>Remove demo lectures</button></aside>}
    <div className="library-toolbar"><label className="search-label">Find a lecture<input type="search" placeholder="Title, number, course, or professor" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Study status<select value={status} onChange={e => setStatus(e.target.value as StudyStatus | '')}><option value="">All statuses</option>{Object.entries(studyStatusLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label></div>
    <div className="selection-bar" role="status" aria-label="Lecture selection"><span><strong>{selected.length}</strong> {selected.length === 1 ? 'lecture' : 'lectures'} selected</span>{selected.length > 0 && <button onClick={() => setSelected([])}>Clear selection</button>}</div>
    <SourceSearch data={data} selected={selected} onOpen={(id, page) => { setSourcePage(page); setActiveId(id); }} />
    {visible.length === 0 && <div className="empty-state"><h2>{data.lectures.length ? 'No matching lectures' : 'Your library starts here'}</h2><p>{data.lectures.length ? 'Try another search or study status.' : 'Add your first lecture and bring its learning objectives together.'}</p></div>}
    {data.courses.map(course => {
      const modules = data.modules.filter(m => m.courseId === course.id && visible.some(l => l.moduleId === m.id));
      if (!modules.length) return null;
      return <section className="course-section" key={course.id} aria-label={course.name}><h2>{course.name}</h2>{modules.map(module => {
        const lectures = visible.filter(l => l.moduleId === module.id).sort((a, b) => a.number - b.number);
        const ids = data.lectures.filter(l => l.moduleId === module.id).map(l => l.id);
        const count = ids.filter(id => selected.includes(id)).length;
        return <section key={module.id} className="module-section" aria-label={module.name}>
          <div className="module-heading"><h3>{module.name} <span>{ids.length} lectures</span></h3><label className="module-select"><input type="checkbox" checked={count === ids.length} ref={node => { if (node) node.indeterminate = count > 0 && count < ids.length; }} onChange={() => setSelected(s => toggleGroupSelection(s, ids))} />Select all in {module.name}</label></div>
          <div className="lecture-grid">{lectures.map(l => {
            const objectives = data.objectives.filter(o => o.lectureId === l.id);
            const reviewed = objectives.filter(o => o.reviewed).length;
            return <article key={l.id} className={`lecture-card ${selected.includes(l.id) ? 'is-selected' : ''}`}>
              <div className="lecture-card-top"><span className="lecture-number">LECTURE {l.number}{l.isDemo && <span className="demo-tag">Demo</span>}</span><input aria-label={`Select lecture ${l.number}: ${l.title}`} type="checkbox" checked={selected.includes(l.id)} onChange={() => setSelected(s => toggleGroupSelection(s, [l.id]))} /></div>
              <h4><button className="lecture-title" onClick={() => setActiveId(l.id)}>{l.title}</button></h4><p className="professor">{l.professor || 'Professor not added'}</p>
              <span className={`study-pill ${l.status}`}>{studyStatusLabels[l.status]}{l.statusSource === 'demo' ? ' · Demo' : ''}</span>
              <div className="objective-summary"><span>{objectives.length} learning {objectives.length === 1 ? 'objective' : 'objectives'}</span><span>{reviewed} reviewed</span></div>
              {objectives.length > 0 && <progress aria-label={`Lecture ${l.number} objectives reviewed`} value={reviewed} max={objectives.length} />}
              <div className="lecture-card-bottom"><span>{l.pdf ? 'PDF attached' : 'No PDF yet'}</span><span>{data.exams.find(e => e.id === l.examId)?.name || 'No exam'}</span></div>
            </article>;
          })}</div>
        </section>;
      })}</section>;
    })}
  </>;
}
