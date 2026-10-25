import { useState } from 'react';
import type { LibraryData } from '../library/models';
import { searchSources } from './content';

export default function SourceSearch({ data, selected, onOpen }: { data: LibraryData; selected: string[]; onOpen: (lectureId: string, page: number) => void }) {
  const [query, setQuery] = useState('');
  const lectures = data.lectures.filter(l => selected.includes(l.id) && !l.isDemo);
  const results = searchSources(data, lectures.map(l => l.id), query);
  return <section className="source-search" aria-labelledby="source-search-heading">
    <h2 id="source-search-heading">Search lecture content</h2>
    <p className="muted">{lectures.length ? `Searching only: ${lectures.map(l => `Lecture ${l.number} — ${l.title}`).join('; ')}.` : 'Select lectures in your library to search their processed content. Demo lectures are excluded.'}</p>
    <label>Search selected lecture sources<input type="search" value={query} disabled={!lectures.length} onChange={e => setQuery(e.target.value)} placeholder="Find a word or phrase in your lectures" /></label>
    {query.trim() && <div aria-live="polite"><p className="muted">{results.length} matching source {results.length === 1 ? 'chunk' : 'chunks'}{results.length > 50 ? ' · Showing the first 50' : ''}. Only current, processed PDFs are searched.</p>
      {results.slice(0, 50).map(c => <article className="source-chunk" key={c.id}><button className="text-button" onClick={() => onOpen(c.source.lectureId, c.source.pageNumbers[0])}>Lecture {data.lectures.find(l => l.id === c.source.lectureId)?.number} · PDF page {c.source.pageNumbers.join(', ')}</button><p>{c.text}</p></article>)}
      {!results.length && <p>No matches in the selected lectures. Check the selection or process their PDFs; other lectures will not be searched.</p>}
    </div>}
  </section>;
}
