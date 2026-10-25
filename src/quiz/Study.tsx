import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryData } from '../library/models';
import { buildEvidencePacket, eligibleSources } from './evidence';
import { studyApi, type StudyApi } from './api';
import type { ChoiceLabel, PublicRound, RoundFeedback } from './schema';

export default function Study({ data, selected, api = studyApi, onLectures }: { data: LibraryData; selected: string[]; api?: StudyApi; onLectures: () => void }) {
  const packet = useMemo(() => buildEvidencePacket(data, selected), [data, selected]);
  const signature = JSON.stringify(packet);
  const [round, setRound] = useState<PublicRound | null>(null);
  const [answers, setAnswers] = useState<Record<string, ChoiceLabel>>({});
  const [feedback, setFeedback] = useState<RoundFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [configuration, setConfiguration] = useState<string | null>(null);
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = data.lectures.filter(l => selected.includes(l.id) && !l.isDemo);
  const eligibleCount = eligibleSources(packet).length;
  useEffect(() => {
    generation.current++;
    setRound(null); setAnswers({}); setFeedback(null); setBusy(false); setError(round ? 'The lecture selection or source content changed. Start a new round from the current sources.' : '');
  }, [signature]);
  useEffect(() => () => { generation.current++; }, []);
  async function start() {
    const token = ++generation.current;
    setBusy(true); setError('');
    try {
      const next = await api.start(packet, feedback ? round?.roundId : undefined);
      if (generation.current !== token) return;
      setRound(next); setAnswers({}); setFeedback(null);
      heading.current?.focus();
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Unable to prepare a study round.'); }
    finally { if (generation.current === token) setBusy(false); }
  }
  async function submit() {
    if (!round) return;
    const token = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await api.grade(round.roundId, packet, round.questions.map(q => ({ questionId: q.id, choice: answers[q.id] })));
      if (generation.current !== token) return;
      setFeedback(result); heading.current?.focus();
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Unable to submit this round.'); }
    finally { if (generation.current === token) setBusy(false); }
  }
  // Configuration is checked on demand, without importing any server configuration into the browser.
  async function checkService() {
    try {
      const response = await fetch('/api/health');
      const result = await response.json();
      setConfiguration(response.ok && result.configured ? 'Study service is configured.' : 'AI is not configured yet. Follow the README local setup instructions, then restart the app.');
    } catch { setConfiguration('Study service is not available. Start the app with npm run dev.'); }
  }
  const complete = round?.questions.every(q => answers[q.id]);
  return <section className="study-page" aria-labelledby="study-heading">
    <p className="eyebrow">ONE ROUND. THREE QUESTIONS.</p><h1 id="study-heading" tabIndex={-1} ref={heading}>Study</h1>
    <p className="muted">Practice from your selected lectures, with explanations grounded in the pages you uploaded.</p>
    <div className="study-scope"><strong>Lecture Only</strong><p>{scope.length ? scope.map(l => `Lecture ${l.number} — ${l.title}`).join('; ') : 'Choose lectures in your library to begin.'}</p><button onClick={onLectures}>Change lecture selection</button></div>
    {!round && <>{scope.length > 0 && !eligibleCount && <p className="empty-state">No eligible evidence yet. Process more complete lecture pages or choose other lectures. Flagged pages and topic names alone cannot support questions.</p>}<p className="muted">{eligibleCount} eligible source {eligibleCount === 1 ? 'chunk' : 'chunks'}. Pages flagged for extraction checks and name-only content are excluded.</p><button onClick={start} className="button" disabled={busy || !scope.length || !eligibleCount}>Start Study Session</button><button className="service-check" onClick={checkService}>Check study service</button>{configuration && <p role="status">{configuration}</p>}</>}
    {busy && <p role="status">{round && !feedback ? 'Submitting your answers…' : 'Preparing and checking three source-grounded questions…'}</p>}
    {error && <div className="storage-message" role="alert">{error}</div>}
    {round && <>
      {feedback && <p className="round-score" role="status">Round complete · {feedback.correct} / 3 correct</p>}
      <form onSubmit={e => { e.preventDefault(); if (complete && !busy && !feedback) void submit(); }}>
        {round.questions.map((q, index) => {
          const result = feedback?.questions.find(item => item.id === q.id);
          return <article className="quiz-question" key={q.id}>
            <h2>Question {index + 1}</h2><p className="question-stem">{q.stem}</p>
            <fieldset disabled={busy || Boolean(feedback)}><legend className="sr-only">Choose an answer for Question {index + 1}</legend>{q.choices.map(c => <label className={`quiz-choice ${answers[q.id] === c.label ? 'chosen' : ''}`} key={c.label}><input type="radio" name={q.id} value={c.label} checked={answers[q.id] === c.label} onChange={() => setAnswers(current => ({ ...current, [q.id]: c.label }))} /><span><strong>{c.label}.</strong> {c.text}</span></label>)}</fieldset>
            {result && <section className="quiz-feedback" aria-label={`Feedback for Question ${index + 1}`}>
              <h3>{result.correct ? 'Correct' : 'Incorrect'} · Correct answer: {result.correctAnswer}</h3><p>{result.explanation}</p>
              <p><strong>The clue that wins is:</strong> {result.clue}</p><p><strong>Tested concept:</strong> {result.concept}</p>
              <div className="choice-explanations">{result.choices.map(c => <p key={c.label}><strong>{c.label}. {c.text}{c.label === result.chosenAnswer ? ' · Your choice' : ''}</strong><br />{c.explanation}</p>)}</div>
              <details className="quiz-sources"><summary>Sources · {result.sources.length} lecture {result.sources.length === 1 ? 'excerpt' : 'excerpts'}</summary>{result.sources.map(source => <article className="source-chunk" key={source.chunkId}><strong>Lecture {source.lectureNumber} — {source.lectureTitle}</strong><p>PDF {source.pageNumbers.length === 1 ? 'page' : 'pages'} {source.pageNumbers.join(', ')}</p><p>{source.text}</p><details><summary>Supporting quotations</summary>{source.quotes.map(quote => <blockquote key={quote}>{quote}</blockquote>)}</details></article>)}</details>
            </section>}
          </article>;
        })}
        {!feedback && <><p className="muted">{Object.keys(answers).length} / 3 answered. Submit all three together to see feedback.</p><button className="button" type="submit" disabled={!complete || busy}>Submit all 3 answers</button></>}
      </form>
      {feedback && <button className="button next-round" onClick={start} disabled={busy}>Next 3 Questions</button>}
      {error && <button onClick={() => { generation.current++; setRound(null); setFeedback(null); setAnswers({}); setError(''); }}>Start a fresh round</button>}
    </>}
  </section>;
}
