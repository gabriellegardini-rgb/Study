export type StudyStatus = 'not-started' | 'learning' | 'weak' | 'improving' | 'mastered';
export const studyStatusLabels: Record<StudyStatus, string> = {
  'not-started': 'Not started', learning: 'Learning', weak: 'Weak', improving: 'Improving', mastered: 'Mastered',
};
export interface Course { id: string; name: string }
export interface CourseModule { id: string; courseId: string; name: string }
export interface Exam { id: string; courseId: string; name: string; date?: string }
export interface LearningObjective {
  id: string;
  lectureId: string;
  text: string;
  reviewed: boolean;
  source: { kind: 'manual' } | { kind: 'pdf'; documentId: string; page: number };
}
export interface PdfDocument {
  id: string;
  lectureId: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  // Pending binary is present only for newly attached files; IndexedDB stores it separately.
  file?: Blob;
}
export interface LibrarySnapshot { data: LibraryData; selected: string[] }
export interface Lecture {
  id: string;
  moduleId: string;
  number: number;
  title: string;
  professor?: string;
  examId?: string;
  status: StudyStatus;
  statusSource: 'self-reported' | 'demo';
  pdf?: PdfDocument;
  isDemo: boolean;
}
export interface LibraryData {
  courses: Course[];
  modules: CourseModule[];
  exams: Exam[];
  lectures: Lecture[];
  objectives: LearningObjective[];
}
export interface NewLecture {
  number: number; title: string; course: string; module: string; professor: string; exam: string; pdf?: File;
}
