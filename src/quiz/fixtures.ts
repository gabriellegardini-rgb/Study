import type { LibraryData } from '../library/models';
import { createChunks, createPages } from '../processing/content';
import { buildEvidencePacket, eligibleSources } from './evidence';
import type { GeneratedRound, GroundedText } from './schema';

// Synthetic non-medical facts exclusively for automated tests. Never used by the app/provider.
export const facts = [
  'The amber device blocks the entry gate and reduces incoming flow in the sample system.',
  'The violet device increases exit flow without changing the entry gate in the sample system.',
  'The silver device maintains constant flow by keeping both gates fixed in the sample system.',
];
export function quizLibrary(): LibraryData {
  const lectures = [26, 28].map(number => ({ id: `lecture-${number}`, moduleId: 'module', number, title: `Sample lecture ${number}`, isDemo: false,
    status: 'not-started' as const, statusSource: 'self-reported' as const,
    pdf: { id: `file-${number}`, lectureId: `lecture-${number}`, name: `sample-${number}.pdf`, type: 'application/pdf', size: 100, uploadedAt: '2026-01-01T00:00:00Z' } }));
  return { courses: [{ id: 'course', name: 'Example course' }], modules: [{ id: 'module', name: 'Example module', courseId: 'course' }], exams: [], lectures, objectives: [],
    processedLectures: lectures.map(l => {
      const pages = createPages(l.id, l.pdf.id, [{ pageNumber: 1, rawText: facts.join('\n') }]);
      return { id: `${l.id}:${l.pdf.id}:v1`, lectureId: l.id, fileId: l.pdf.id, filename: l.pdf.name, pipelineVersion: 1 as const, status: 'processed' as const, processedAt: '2026-01-01T00:00:00Z', pages, chunks: createChunks(pages), suggestions: [] };
    }) };
}
export function quizPacket(ids = ['lecture-26']) { return buildEvidencePacket(quizLibrary(), ids); }
export function quizCandidate(packet = quizPacket()): GeneratedRound {
  const source = eligibleSources(packet)[0];
  const grounded = (text: string): GroundedText => ({ text, evidence: [{ chunkId: source.chunkId, quote: source.text }] });
  const stems = ['Which device blocks the entry gate in the sample system?', 'Which device increases exit flow without changing the entry gate?', 'Which device maintains constant flow in the sample system?'];
  return { questions: stems.map((stem, index) => ({ stem: grounded(stem), choices: ['Amber device', 'Violet device', 'Silver device'].map((text, i) => ({ label: ['A','B','C'][i] as 'A'|'B'|'C', content: grounded(text), explanation: grounded(facts[i]) })), correctAnswer: ['A','B','C'][index] as 'A'|'B'|'C', explanation: grounded(facts[index]), concept: grounded(['Entry gate blockade','Exit flow increase','Constant flow'][index]), clue: grounded(facts[index]), difficulty: 'foundational' as const })) };
}
export const passingAudit = () => ({ questions: [0,1,2].map(index => ({ index, supported: true, singleBestAnswer: true, sufficientFacts: true, noAnswerLeak: true, reason: 'All content is supported by the supplied sample facts.' })) });
