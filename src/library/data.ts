import type { LibraryData, NewLecture, PdfDocument } from './models';
export const emptyLibrary = (): LibraryData => ({ courses: [], modules: [], exams: [], lectures: [], objectives: [] });
const matches = (a: string, b: string) => a.toLocaleLowerCase() === b.trim().toLocaleLowerCase();

// Immutable domain operations. Storage is handled by the repository adapter.
export function addLecture(data: LibraryData, input: NewLecture, id = () => crypto.randomUUID()): { data: LibraryData; lectureId: string } {
  if (!input.title.trim() || !input.course.trim() || !input.module.trim() || !Number.isInteger(input.number) || input.number < 1) {
    throw new Error('Enter a title, course, module, and a positive whole lecture number.');
  }
  if (input.pdf && !input.pdf.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file.');
  const next = { ...data, courses: [...data.courses], modules: [...data.modules], exams: [...data.exams], lectures: [...data.lectures] };
  let course = next.courses.find(c => matches(c.name, input.course));
  if (!course) { course = { id: id(), name: input.course.trim() }; next.courses.push(course); }
  let module = next.modules.find(m => m.courseId === course.id && matches(m.name, input.module));
  if (!module) { module = { id: id(), courseId: course.id, name: input.module.trim() }; next.modules.push(module); }
  let exam = next.exams.find(e => e.courseId === course.id && matches(e.name, input.exam));
  if (input.exam.trim() && !exam) { exam = { id: id(), courseId: course.id, name: input.exam.trim() }; next.exams.push(exam); }
  const lectureId = id();
  next.lectures.push({ id: lectureId, moduleId: module.id, number: input.number, title: input.title.trim(), professor: input.professor.trim() || undefined,
    examId: input.exam.trim() ? exam?.id : undefined, status: 'not-started', statusSource: 'self-reported', isDemo: false,
    pdf: input.pdf ? createPdfDocument(input.pdf, lectureId, id()) : undefined });
  return { data: next, lectureId };
}
export function toggleGroupSelection(selected: string[], groupIds: string[]): string[] {
  return groupIds.every(id => selected.includes(id))
    ? selected.filter(id => !groupIds.includes(id))
    : [...new Set([...selected, ...groupIds])];
}
export function removeDemoData(data: LibraryData): LibraryData {
  const lectures = data.lectures.filter(l => !l.isDemo);
  const modules = data.modules.filter(m => lectures.some(l => l.moduleId === m.id));
  return { lectures, modules, courses: data.courses.filter(c => modules.some(m => m.courseId === c.id)),
    exams: data.exams.filter(e => lectures.some(l => l.examId === e.id)), objectives: data.objectives.filter(o => lectures.some(l => l.id === o.lectureId)) };
}

export function createPdfDocument(file: File, lectureId: string, id = crypto.randomUUID()): PdfDocument {
  return { id, lectureId, name: file.name, size: file.size, type: file.type || 'application/pdf', uploadedAt: new Date().toISOString(), file };
}
