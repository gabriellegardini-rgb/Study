import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { addLecture, emptyLibrary } from '../library/data';
import { libraryRepository } from '../library/storage';
import { extractPdfPages } from './pdfjs';
vi.mock('./pdfjs', () => ({ extractPdfPages: vi.fn() }));

beforeEach(() => vi.mocked(extractPdfPages).mockReset());
async function openLecture() {
  const { data, lectureId } = addLecture(emptyLibrary(), { number: 26, title: 'Source example', course: 'Example course', module: 'Example module', professor: '', exam: '', pdf: new File(['%PDF-1.7'], 'example.pdf', { type: 'application/pdf' }) });
  data.objectives.push({ id: 'manual', lectureId, text: 'Keep my manual objective.', reviewed: true, source: { kind: 'manual' } });
  await libraryRepository.save({ data, selected: [lectureId] }, 0);
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Make room for understanding.' });
  fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
  fireEvent.click(screen.getByRole('button', { name: 'Source example' }));
  return { view, lectureId };
}
async function processExample() {
  vi.mocked(extractPdfPages).mockResolvedValue([{ pageNumber: 1, rawText: 'Learning Objectives\n1. Explain the sample workflow.\n2. Compare the sample stages.' }, { pageNumber: 2, rawText: '' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Process Lecture' }));
  await screen.findByText('Processed', { selector: '.badge' });
}

describe('Source processing interface', () => {
  it('processes on demand, exposes source pages, accepts/dismisses suggestions and preserves manual objectives across reloads', async () => {
    const { view } = await openLecture();
    expect(screen.getByText('Not processed')).toBeVisible();
    expect(extractPdfPages).not.toHaveBeenCalled();
    await processExample();
    expect(screen.getByText(/1 page needs a closer look/)).toBeVisible();
    const suggestions = screen.getByRole('region', { name: 'Suggested learning objectives' });
    expect(within(suggestions).getAllByRole('button', { name: 'Accept objective' })).toHaveLength(2);
    const objectives = screen.getByRole('region', { name: 'Learning objectives' });
    expect(within(objectives).queryByText('Explain the sample workflow.')).not.toBeInTheDocument();
    fireEvent.click(within(suggestions).getAllByRole('button', { name: 'Inspect page 1' })[0]);
    await waitFor(() => expect(screen.getByLabelText('PDF page')).toBeVisible());
    expect(screen.getByLabelText('Extracted text for PDF page 1')).toHaveTextContent('Learning Objectives 1. Explain the sample workflow. 2. Compare the sample stages.');
    fireEvent.change(screen.getByLabelText('PDF page'), { target: { value: '2' } });
    expect(screen.getByText('No usable source chunks on this page.')).toBeVisible();
    fireEvent.click(within(suggestions).getAllByRole('button', { name: 'Accept objective' })[0]);
    fireEvent.click(within(suggestions).getByRole('button', { name: 'Dismiss' }));
    expect(within(objectives).getByRole('checkbox', { name: /Keep my manual objective/ })).toBeChecked();
    expect(within(objectives).getByRole('checkbox', { name: /Explain the sample workflow/ })).not.toBeChecked();
    expect(within(objectives).getByText(/Accepted from PDF page 1/)).toBeVisible();
    await waitFor(async () => {
      const stored = await libraryRepository.load();
      expect(stored?.snapshot.data.objectives).toHaveLength(2);
      expect(stored?.snapshot.data.processedLectures?.[0].suggestions.map(s => s.status)).toEqual(['accepted', 'dismissed']);
    });
    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { name: 'Make room for understanding.' });
    fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
    fireEvent.change(screen.getByLabelText('Search selected lecture sources'), { target: { value: 'workflow' } });
    expect(screen.getByText(/1 matching source chunk/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lecture 26 · PDF page 1' }));
    expect(screen.getByText('Processed', { selector: '.badge' })).toBeVisible();
    expect(screen.getByLabelText('PDF page')).toHaveValue('1');
    expect(screen.getByRole('checkbox', { name: /Keep my manual objective/ })).toBeChecked();
  });

  it('marks sources stale after replacement, blocks old suggestions, and archives sources after removal', async () => {
    const { lectureId } = await openLecture();
    await processExample();
    fireEvent.change(screen.getByLabelText('Replace PDF'), { target: { files: [new File(['%PDF-2.0'], 'replacement.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('PDF changed — reprocessing required')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept objective' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await libraryRepository.load())?.snapshot.data.lectures.find(l => l.id === lectureId)?.pdf?.name).toBe('replacement.pdf'));
    vi.mocked(extractPdfPages).mockResolvedValue([{ pageNumber: 1, rawText: 'Only the new source content.' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess Lecture' }));
    expect(await screen.findByText('Processed', { selector: '.badge' })).toBeVisible();
    expect(screen.getByText('No objectives were detected. You can enter them manually below.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove PDF' }));
    expect(screen.getByText('PDF removed — sources archived')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reprocess Lecture' })).not.toBeInTheDocument();
  });

  it('shows failure honestly and supports retry without changing manual objectives', async () => {
    await openLecture();
    vi.mocked(extractPdfPages).mockRejectedValue(new Error('Malformed PDF'));
    fireEvent.click(screen.getByRole('button', { name: 'Process Lecture' }));
    expect(await screen.findByText('Processing failed', { selector: '.badge' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be processed');
    expect(screen.getByRole('checkbox', { name: /Keep my manual objective/ })).toBeChecked();
    vi.mocked(extractPdfPages).mockResolvedValue([{ pageNumber: 1, rawText: 'A recovered page from the PDF.' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Reprocess Lecture' }));
    expect(await screen.findByText('Processed', { selector: '.badge' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
