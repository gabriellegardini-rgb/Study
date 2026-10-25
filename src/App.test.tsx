import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

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
    expect(screen.getAllByText(/· Planned/)).toHaveLength(2);
  });
});
