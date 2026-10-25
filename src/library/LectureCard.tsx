import type { Lecture, LearningObjective } from './models';
import { studyStatusLabels } from './models';

export default function LectureCard({ lecture, objectives, examName, selected, onOpen, onSelect }: {
  lecture: Lecture;
  objectives: LearningObjective[];
  examName?: string;
  selected: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const reviewed = objectives.filter(objective => objective.reviewed).length;
  return (
    <article className={`lecture-card ${selected ? 'is-selected' : ''}`} aria-label={`Lecture ${lecture.number}: ${lecture.title}`}>
      {/* The body is a native button. Selection is a sibling control, never nested inside it. */}
      <button
        type="button"
        id={`open-lecture-${lecture.id}`}
        className="lecture-card-open"
        aria-label={lecture.title}
        aria-describedby={`lecture-summary-${lecture.id}`}
        onClick={onOpen}
      >
        <span className="lecture-card-top">
          <span className="lecture-number">LECTURE {lecture.number}{lecture.isDemo && <span className="demo-tag">Demo</span>}</span>
        </span>
        <span className="lecture-title">{lecture.title}</span>
        <span className="professor">{lecture.professor || 'Professor not added'}</span>
        <span className={`study-pill ${lecture.status}`}>{studyStatusLabels[lecture.status]}{lecture.statusSource === 'demo' ? ' · Demo' : ''}</span>
        <span className="objective-summary" id={`lecture-summary-${lecture.id}`}>
          <span>{objectives.length} learning {objectives.length === 1 ? 'objective' : 'objectives'}</span>
          <span>{reviewed} reviewed</span>
        </span>
        {objectives.length > 0 && <span className="lecture-progress" aria-hidden="true"><span style={{ width: `${reviewed / objectives.length * 100}%` }} /></span>}
        <span className="lecture-card-bottom"><span>{lecture.pdf ? 'PDF attached' : 'No PDF yet'}</span><span>{examName || 'No exam'}</span></span>
        <span className="open-lecture-affordance">Open lecture <span aria-hidden="true">→</span></span>
      </button>
      <label className="lecture-card-select" title="Select for study">
        <span aria-hidden="true">Select</span>
        <input
          aria-label={`Select lecture ${lecture.number}: ${lecture.title}`}
          type="checkbox"
          checked={selected}
          onChange={onSelect}
        />
      </label>
    </article>
  );
}
