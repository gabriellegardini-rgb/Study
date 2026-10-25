import type { LibraryData, StudyStatus } from './models';

// Generic organization examples only. Set this to false to start with an empty library.
export const INCLUDE_DEMO_DATA = true;
export function createDemoLibrary(): LibraryData {
  return {
    courses: [{ id: 'demo-course', name: 'Example course' }],
    modules: [{ id: 'demo-module', courseId: 'demo-course', name: 'Example module' }],
    exams: [{ id: 'demo-exam', courseId: 'demo-course', name: 'Example exam' }],
    lectures: (['not-started', 'learning', 'weak', 'improving', 'mastered'] as StudyStatus[]).map((status, index) => ({
      id: `demo-lecture-${index}`, moduleId: 'demo-module', number: index + 1,
      title: ['Getting oriented', 'Connecting ideas', 'Working through examples', 'Building understanding', 'Bringing it together'][index],
      professor: index === 0 ? 'Example professor' : undefined,
      examId: 'demo-exam', status, statusSource: 'demo', isDemo: true,
    })),
    objectives: [{ id: 'demo-objective', lectureId: 'demo-lecture-0', text: 'Replace this example with a learning objective from your lecture.', reviewed: false, source: { kind: 'manual' } }],
  };
}
