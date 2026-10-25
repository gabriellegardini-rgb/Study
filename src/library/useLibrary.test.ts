import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLibrary } from './useLibrary';
import { emptyLibrary } from './data';
import type { LibraryRepository } from './storage';

function repository(): LibraryRepository {
  return { load: vi.fn().mockResolvedValue({ snapshot: { data: emptyLibrary(), selected: [] }, revision: 1, missingFileIds: [] }),
    save: vi.fn().mockResolvedValue(2), getPdf: vi.fn().mockResolvedValue(null) };
}
describe('Persistence lifecycle failures', () => {
  it('keeps edits in memory after a quota failure and retries without reloading over them', async () => {
    const repo = repository();
    vi.mocked(repo.save).mockRejectedValueOnce(new DOMException('Storage full', 'QuotaExceededError'));
    const { result } = renderHook(() => useLibrary(repo));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setData(d => ({ ...d, courses: [{ id: 'course', name: 'Unsaved course' }] })));
    await waitFor(() => expect(result.current.error).toContain('not saved'));
    expect(result.current.data.courses[0].name).toBe('Unsaved course');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBe(''));
    expect(repo.load).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(2);
    expect(result.current.data.courses[0].name).toBe('Unsaved course');
  });
  it('does not overwrite unreadable storage with demo data', async () => {
    const repo = repository();
    vi.mocked(repo.load).mockRejectedValueOnce(new Error('unavailable'));
    const { result } = renderHook(() => useLibrary(repo));
    await waitFor(() => expect(result.current.error).toContain('could not be opened'));
    expect(result.current.ready).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(repo.save).not.toHaveBeenCalled();
  });
});
