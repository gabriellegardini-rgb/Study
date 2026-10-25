import { describe, expect, it } from 'vitest';
import { addLecture, emptyLibrary, removeDemoData, toggleGroupSelection } from './data';
import { createDemoLibrary } from './demo';
import type { NewLecture } from './models';
const input: NewLecture = { number: 19, title: 'Example', course: 'Course A', module: 'Module A', professor: '', exam: 'Exam A' };

describe('Library data operations', () => {
  it('assigns stable IDs, reuses organization within a course and preserves the original data', () => {
    const original = emptyLibrary();
    const first = addLecture(original, input);
    const second = addLecture(first.data, { ...input, number: 21, course: ' course a ', module: 'module a' });
    expect(original.lectures).toHaveLength(0);
    expect(second.data.courses).toHaveLength(1);
    expect(second.data.modules).toHaveLength(1);
    expect(second.data.exams).toHaveLength(1);
    expect(second.data.lectures.map(l => l.id)).toContain(first.lectureId);
    expect(second.lectureId).not.toBe(first.lectureId);
    const otherCourse = addLecture(second.data, { ...input, course: 'Course B' });
    expect(otherCourse.data.modules).toHaveLength(2);
    expect(otherCourse.data.exams).toHaveLength(2);
  });
  it('rejects invalid metadata and non-PDF filenames', () => {
    expect(() => addLecture(emptyLibrary(), { ...input, title: '  ' })).toThrow();
    expect(() => addLecture(emptyLibrary(), { ...input, number: 1.5 })).toThrow();
    expect(() => addLecture(emptyLibrary(), { ...input, pdf: new File(['x'], 'other.txt') })).toThrow('Choose a PDF');
  });
  it('toggles module selection without dropping another module or duplicating IDs', () => {
    expect(toggleGroupSelection(['other', 'a'], ['a', 'b'])).toEqual(['other', 'a', 'b']);
    expect(toggleGroupSelection(['other', 'a', 'b'], ['a', 'b'])).toEqual(['other']);
  });
  it('cleans demo associations while retaining real lectures sharing demo organization', () => {
    const demo = createDemoLibrary();
    const added = addLecture(demo, { ...input, course: 'Example course', module: 'Example module', exam: 'Example exam' });
    const clean = removeDemoData(added.data);
    expect(clean.lectures.map(l => l.id)).toEqual([added.lectureId]);
    expect(clean.courses).toHaveLength(1);
    expect(clean.modules).toHaveLength(1);
    expect(clean.exams).toHaveLength(1);
    expect(clean.objectives).toHaveLength(0);
  });
});
