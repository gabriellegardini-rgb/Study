import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { libraryRepository } from './storage';
import { addLecture, emptyLibrary } from './data';

async function openLibrary() {
  const view = render(<App />);
  await screen.findByRole('heading', { name: 'Make room for understanding.' });
  fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
  return view;
}
async function createLecture(pdf = false) {
  fireEvent.click(screen.getByRole('button', { name: '+ Add lecture' }));
  for (const [label, value] of [['Lecture number', '19'], ['Lecture title', 'My first lecture'], ['Course', 'My course'], ['Block / module', 'Module A'], ['Professor (optional)', 'Dr Example'], ['Exam association (optional)', 'Exam A']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  if (pdf) fireEvent.change(screen.getByLabelText('Lecture PDF (optional)'), { target: { files: [new File(['%PDF-1.7'], 'lecture.pdf', { type: 'application/pdf' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Add lecture' }));
  await screen.findByRole('heading', { name: 'My first lecture' });
}

describe('Lecture Library workflows', async () => {
  it('creates a lecture with organization, exam and a PDF; retains it across navigation', async () => {
    await openLibrary();
    await createLecture(true);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My first lecture');
    expect(screen.getByText('My course / Module A')).toBeVisible();
    expect(screen.getByText('Professor: Dr Example')).toBeVisible();
    expect(screen.getByText('Exam: Exam A')).toBeVisible();
    expect(screen.getByText('lecture.pdf')).toBeVisible();
    expect(screen.getByText('No quiz attempts yet.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    const overview = screen.getByRole('region', { name: 'Study overview' });
    expect(within(overview).getByText('1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
    expect(screen.getByRole('button', { name: 'My first lecture' })).toBeVisible();
  });

  it('adds, reviews, edits and deletes objectives without inflating mastery', async () => {
    await openLibrary(); await createLecture();
    expect(screen.getByText('No PDF attached')).toBeVisible();
    fireEvent.change(screen.getByLabelText('New learning objective'), { target: { value: 'Explain the first concept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add objective' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Explain the first concept/ }));
    expect(screen.getByText('1 / 1 reviewed')).toBeVisible();
    expect(screen.getByLabelText('Study status (self-assessed)')).toHaveValue('not-started');
    fireEvent.click(screen.getByRole('button', { name: 'Edit objective 1' }));
    fireEvent.change(screen.getByLabelText('Edit objective'), { target: { value: 'Explain the revised concept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save objective' }));
    expect(screen.getByRole('checkbox', { name: /Explain the revised concept/ })).not.toBeChecked();
    expect(screen.getByText('0 / 1 reviewed')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Study status (self-assessed)'), { target: { value: 'learning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete objective 1' }));
    expect(screen.getByText('0 / 0 reviewed')).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← All lectures' }));
    expect(screen.getByText('Learning', { selector: '.study-pill' })).toBeVisible();
  });

  it('supports individual, module and cross-navigation selection', async () => {
    await openLibrary();
    const first = screen.getByRole('checkbox', { name: 'Select lecture 1: Getting oriented' });
    fireEvent.click(first);
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('1 lecture selected');
    const group = screen.getByRole('checkbox', { name: 'Select all in Example module' });
    expect(group).toBePartiallyChecked();
    fireEvent.click(group);
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('5 lectures selected');
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lectures' }));
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('5 lectures selected');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all in Example module' }));
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('0 lectures selected');
  });

  it('filters lectures and removes demo data while preserving added lectures', async () => {
    await openLibrary();
    fireEvent.change(screen.getByLabelText('Find a lecture'), { target: { value: 'Connecting' } });
    expect(screen.getByRole('button', { name: 'Connecting ideas' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Getting oriented' })).not.toBeInTheDocument();
    // Module selection includes the whole module even when the list is filtered.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all in Example module' }));
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('5 lectures selected');
    fireEvent.change(screen.getByLabelText('Find a lecture'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Study status'), { target: { value: 'weak' } });
    expect(screen.getByRole('button', { name: 'Working through examples' })).toBeVisible();
    fireEvent.change(screen.getByLabelText('Study status'), { target: { value: '' } });
    await createLecture();
    fireEvent.click(screen.getByRole('button', { name: '← All lectures' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove demo lectures' }));
    expect(screen.queryByRole('button', { name: 'Getting oriented' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My first lecture' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Lecture selection' })).toHaveTextContent('0 lectures selected');
  });

  it('shows a useful empty library and allows canceling lecture creation', async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Remove demo lectures' }));
    expect(screen.getByRole('heading', { name: 'Your library starts here' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '+ Add lecture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Your library starts here' })).toBeVisible();
  });
});


describe('Persistent library interface', () => {
  it('restores a lecture, PDF, reviewed objective, status and selection after an app remount', async () => {
    const view = await openLibrary();
    await createLecture(true);
    fireEvent.change(screen.getByLabelText('New learning objective'), { target: { value: 'Remember this objective' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add objective' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember this objective/ }));
    fireEvent.change(screen.getByLabelText('Study status (self-assessed)'), { target: { value: 'improving' } });
    fireEvent.click(screen.getByRole('button', { name: '← All lectures' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select lecture 19: My first lecture' }));
    await waitFor(async () => {
      const saved = await libraryRepository.load();
      expect(saved?.snapshot.data.objectives.some(o => o.text === 'Remember this objective' && o.reviewed)).toBe(true);
      expect(saved?.snapshot.selected).toHaveLength(1);
    });
    view.unmount();
    await openLibrary();
    expect(screen.getByRole('checkbox', { name: 'Select lecture 19: My first lecture' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'My first lecture' }));
    expect(screen.getByText('lecture.pdf')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Remember this objective/ })).toBeChecked();
    expect(screen.getByLabelText('Study status (self-assessed)')).toHaveValue('improving');
  });

  it('rejects an invalid replacement, replaces a PDF, and removes its saved binary', async () => {
    await openLibrary(); await createLecture(true);
    fireEvent.change(screen.getByLabelText('Replace PDF'), { target: { files: [new File(['text'], 'fake.pdf')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('valid PDF header');
    expect(screen.getByText('lecture.pdf')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Replace PDF'), { target: { files: [new File(['%PDF-2.0'], 'replacement.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('replacement.pdf')).toBeVisible();
    await waitFor(async () => {
      const saved = await libraryRepository.load();
      expect(saved?.snapshot.data.lectures.find(l => !l.isDemo)?.pdf?.name).toBe('replacement.pdf');
    });
    const id = (await libraryRepository.load())!.snapshot.data.lectures.find(l => !l.isDemo)!.pdf!.id;
    fireEvent.click(screen.getByRole('button', { name: 'Remove PDF' }));
    expect(screen.getByText('No PDF attached')).toBeVisible();
    await waitFor(async () => expect(await libraryRepository.getPdf(id)).toBeNull());
  });
});


it('shows a recoverable missing-file state without losing the lecture', async () => {
  const { data } = addLecture(emptyLibrary(), { number: 1, title: 'Lecture with missing file', course: 'Course', module: 'Module', professor: '', exam: '', pdf: new File(['%PDF-1.7'], 'missing.pdf') });
  delete data.lectures[0].pdf!.file;
  await libraryRepository.save({ data, selected: [] }, 0);
  await openLibrary();
  fireEvent.click(screen.getByRole('button', { name: 'Lecture with missing file' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('missing from browser storage');
  expect(screen.getByRole('heading', { name: 'Lecture with missing file' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Remove PDF' }));
  expect(screen.getByText('No PDF attached')).toBeVisible();
});
