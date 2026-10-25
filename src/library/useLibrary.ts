import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createDemoLibrary, INCLUDE_DEMO_DATA } from './demo';
import { emptyLibrary } from './data';
import type { LibraryData, LibrarySnapshot } from './models';
import { libraryRepository, type LibraryRepository } from './storage';

export function useLibrary(repository: LibraryRepository = libraryRepository) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [missingFileIds, setMissingFileIds] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const saved = useRef<LibrarySnapshot | null>(null);
  const queue = useRef(Promise.resolve());
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    repository.load().then(result => {
      if (!active) return;
      revision.current = result?.revision ?? 0;
      const initial = result?.snapshot ?? { data: INCLUDE_DEMO_DATA ? createDemoLibrary() : emptyLibrary(), selected: [] };
      saved.current = result ? initial : null;
      setSnapshot(initial);
      setMissingFileIds(result?.missingFileIds ?? []);
      setError('');
    }).catch(() => { if (active) setError('Your library could not be opened. Enable browser storage, then retry. Existing data has not been replaced.'); });
    return () => { active = false; };
  }, [repository, retry]);

  useEffect(() => {
    if (!snapshot || snapshot === saved.current) return;
    const task = ++sequence.current;
    setSaving(true);
    queue.current = queue.current.then(async () => {
      try {
        revision.current = await repository.save(snapshot, revision.current);
        saved.current = snapshot;
        if (task === sequence.current) { setError(''); setSaving(false); }
      } catch (e) {
        if (task === sequence.current) {
          setError(`Changes are not saved. Keep this page open and retry. ${e instanceof Error ? e.message : 'Browser storage may be full or unavailable.'}`);
          setSaving(false);
        }
      }
    });
  }, [snapshot, repository]);

  useEffect(() => {
    if (!saving && (!error || !snapshot)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving, error, snapshot]);

  const setData: Dispatch<SetStateAction<LibraryData>> = action => setSnapshot(s => s && ({ ...s, data: typeof action === 'function' ? action(s.data) : action }));
  const setSelected: Dispatch<SetStateAction<string[]>> = action => setSnapshot(s => s && ({ ...s, selected: typeof action === 'function' ? action(s.selected) : action }));
  return { data: snapshot?.data ?? emptyLibrary(), selected: snapshot?.selected ?? [], setData, setSelected,
    ready: snapshot !== null, saving, error, missingFileIds,
    retry: () => snapshot ? setSnapshot(s => s && ({ ...s })) : setRetry(n => n + 1) };
}
