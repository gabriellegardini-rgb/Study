import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { quizLibrary } from './quiz/fixtures';
import { libraryRepository } from './library/storage';

describe('Dashboard', async () => {
  it('offers navigation to the getting-started section', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Make room for understanding.' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Make room for understanding.');
    const link = screen.getByRole('link', { name: /explore your workspace/i });
    expect(link).toHaveAttribute('href', '#getting-started');
    expect(document.querySelector(link.getAttribute('href')!)).toContainElement(
      screen.getByRole('heading', { name: 'A foundation for better study.' }),
    );
  });

  it('shows an honest empty state without fabricated study results', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: 'Make room for understanding.' });
    const overview = screen.getByRole('region', { name: 'Study overview' });
    expect(within(overview).getAllByText('0')).toHaveLength(2);
    expect(within(overview).getByText('—')).toBeVisible();
    expect(screen.getByText(/numbers above are initial placeholders/)).toBeVisible();
    expect(screen.getAllByText(/· Planned/)).toHaveLength(1);
  });
});


it('opens Study using the lecture selection restored from the existing library', async () => {
  await libraryRepository.save({ data:quizLibrary(), selected:['lecture-26'] },0);
  render(<App />);
  await screen.findByRole('heading',{name:'Make room for understanding.'});
  fireEvent.click(screen.getByRole('button',{name:'Study'}));
  expect(await screen.findByRole('heading',{level:1,name:'Study'})).toBeVisible();
  expect(screen.getByText('Lecture 26 — Sample lecture 26')).toBeVisible();
  expect(screen.queryByText('Lecture 28 — Sample lecture 28')).not.toBeInTheDocument();
});
