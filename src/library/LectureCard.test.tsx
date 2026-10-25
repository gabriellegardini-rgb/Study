import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LectureCard from './LectureCard';
import type { Lecture } from './models';

const lecture: Lecture = { id: 'lecture-a', moduleId: 'module', number: 19, title: 'Example lecture', professor: 'Example professor', status: 'learning', statusSource: 'self-reported', isDemo: false };
function setup(selected = false) {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  render(<LectureCard lecture={lecture} objectives={[]} selected={selected} onOpen={onOpen} onSelect={onSelect} />);
  return { user: userEvent.setup(), onOpen, onSelect };
}

describe('Lecture card actions', () => {
  it.each(['Example lecture', 'Example professor', 'No PDF yet', 'Open lecture'])('opens from %s without selecting', async text => {
    const { user, onOpen, onSelect } = setup();
    await user.click(screen.getByText(text));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps checkbox and its label separate from the open action', async () => {
    const { user, onOpen, onSelect } = setup();
    const checkbox = screen.getByRole('checkbox', { name: 'Select lecture 19: Example lecture' });
    expect(screen.getByRole('button', { name: 'Example lecture' })).not.toContainElement(checkbox);
    await user.click(checkbox);
    await user.click(screen.getByText('Select'));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each(['{Enter}', ' '])('opens with %s and offers a separate keyboard selection stop', async key => {
    const { user, onOpen, onSelect } = setup(true);
    const openButton = screen.getByRole('button', { name: 'Example lecture' });
    const checkbox = screen.getByRole('checkbox', { name: 'Select lecture 19: Example lecture' });
    await user.tab();
    expect(openButton).toHaveFocus();
    await user.keyboard(key);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    await user.tab();
    expect(checkbox).toHaveFocus();
    expect(checkbox).toBeChecked();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
