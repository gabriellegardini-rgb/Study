import { useState } from 'react';
import Study from './quiz/Study';
import LectureLibrary from './library/LectureLibrary';
import { useLibrary } from './library/useLibrary';

export default function App() {
  const [page, setPage] = useState<'dashboard' | 'lectures' | 'study'>('dashboard');
  const { data, setData, selected, setSelected, ready, saving, error, retry } = useLibrary();
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="SGU Study home">
          <span className="brand-mark" aria-hidden="true">S</span>
          SGU <span className="brand-light">Study</span>
        </a>
        <nav className="primary-nav" aria-label="Main navigation">
          <button aria-current={page === 'dashboard' ? 'page' : undefined} onClick={() => setPage('dashboard')}>Dashboard</button>
          <button aria-current={page === 'lectures' ? 'page' : undefined} onClick={() => setPage('lectures')}>Lectures</button>
          <button aria-current={page === 'study' ? 'page' : undefined} onClick={() => setPage('study')}>Study</button><span>Performance · Soon</span><span>Exams · Soon</span>
        </nav>
        <span className="status"><span aria-hidden="true" /> Getting started</span>
      </header>

      <main id="main">
        {error && <div className="storage-message" role="alert"><p>{error}</p><button onClick={retry}>Retry storage</button></div>}
        {saving && <p className="save-indicator" role="status">Saving changes…</p>}
        {!ready ? <p role="status">Opening your library…</p> : page === 'lectures' ? <LectureLibrary data={data} setData={setData} selected={selected} setSelected={setSelected} /> : page === 'study' ? <Study data={data} selected={selected} onLectures={() => setPage('lectures')} /> : <>
        <section className="welcome" aria-labelledby="welcome-heading">
          <p className="eyebrow">A LITTLE PROGRESS, EVERY DAY</p>
          <h1 id="welcome-heading">Make room for understanding.</h1>
          <p className="intro">Your focused space for SGU exam preparation. Build knowledge,
            connect the concepts, and prepare with purpose.</p>
          <a className="button" href="#getting-started">Explore your workspace <span aria-hidden="true">↗</span></a>
          <span className="hero-decoration" aria-hidden="true">✳</span>
        </section>

        <section className="stats" aria-label="Study overview">
          <article className="stat"><p>Lectures added</p><strong>{data.lectures.filter(l => !l.isDemo).length}</strong><span>Your library starts here</span></article>
          <article className="stat"><p>Questions completed</p><strong>0</strong><span>One concept at a time</span></article>
          <article className="stat"><p>Overall accuracy</p><strong>—</strong><span>Available after your first session</span></article>
        </section>

        <section className="next-steps" id="getting-started" aria-labelledby="next-heading">
          <div className="section-heading"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2 id="next-heading">A foundation for better study.</h2></div><span className="badge">Initial version</span></div>
          <div className="cards">
            <article className="card"><span className="step">01 / ORGANIZE</span><h3>Keep your lectures together</h3><p>Keep your slides and learning objectives organized around your course material.</p><button className="text-button" onClick={() => setPage('lectures')}>Open lecture library →</button></article>
            <article className="card"><span className="step">02 / PRACTICE</span><h3>Think through each question</h3><p>Practice in focused batches, with explanations grounded in your uploaded lectures.</p><button className="text-button" onClick={() => setPage('study')}>Open Study →</button></article>
            <article className="card"><span className="step">03 / REVISIT</span><h3>Turn weak spots into strengths</h3><p>Return to challenging concepts and follow your progress as your understanding grows.</p><span className="coming-soon">Progress tracking · Planned</span></article>
          </div>
        </section>
        <aside className="empty-note"><strong>A fresh start.</strong> This dashboard is a working application shell. Your lecture count reflects lectures you add here. Quiz numbers above are initial placeholders; long-term performance tracking is coming later.</aside>
        </>}
      </main>
      <footer><span>SGU Study</span><span>Built for focused learning. Independent student project.</span></footer>
    </div>
  );
}
