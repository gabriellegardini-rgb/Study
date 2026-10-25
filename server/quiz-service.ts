import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eligibleSources, evidencePacketSchema, factualStatements, type EvidencePacket, type EligibleSource } from '../src/quiz/evidence';
import { generatedRound, type Answer, type GeneratedRound, type GroundedText, type PublicRound, type RoundFeedback } from '../src/quiz/schema';
import { auditSchema, type ModelProvider, ProviderError } from './provider';

export class StudyError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
interface Session { id: string; questions: (GeneratedRound['questions'][number] & { id: string })[]; sources: EligibleSource[]; fingerprint: string; expiresAt: number; answers?: Answer[]; feedback?: RoundFeedback }
export const roundRequest = z.object({ packet: evidencePacketSchema, previousRoundId: z.string().optional() }).strict();
export const gradeRequest = z.object({ roundId: z.string(), packet: evidencePacketSchema, answers: z.array(z.object({ questionId: z.string(), choice: z.enum(['A','B','C','D','E']) }).strict()).length(3) }).strict();
const fingerprint = (sources: EligibleSource[], ids: string[]) => createHash('sha256').update(JSON.stringify({ ids: [...ids].sort(), sources: [...sources].sort((a,b) => a.chunkId.localeCompare(b.chunkId)) })).digest('hex');
export function textFields(question: GeneratedRound['questions'][number]): GroundedText[] { return [question.stem, question.explanation, question.concept, question.clue, ...question.choices.flatMap(c => [c.content, c.explanation])]; }
export function validateGenerated(raw: unknown, sources: EligibleSource[]): GeneratedRound {
  const round = generatedRound.parse(raw);
  const stems = new Set<string>();
  for (const question of round.questions) {
    const labels = question.choices.map(c => c.label);
    if (labels.some((label, i) => label !== ['A','B','C','D','E'][i]) || !labels.includes(question.correctAnswer)
      || new Set(question.choices.map(c => c.content.text.trim().toLocaleLowerCase())).size !== labels.length) throw new Error('Invalid choices');
    if (/^\s*(?:diagnosis|organism|topic|lecture topic)\s*:/i.test(question.stem.text) || /\b(?:correct answer|the answer|answer key)\s*(?:is|:)/i.test(question.stem.text)) throw new Error('Answer leakage');
    const normalizedStem = question.stem.text.trim().toLocaleLowerCase();
    if (stems.has(normalizedStem)) throw new Error('Repeated question');
    stems.add(normalizedStem);
    for (const field of textFields(question)) for (const evidence of field.evidence) {
      const source = sources.find(s => s.chunkId === evidence.chunkId);
      if (!source || !source.text.includes(evidence.quote) || evidence.quote.trim().split(/\s+/).length < 4) throw new Error('Invalid evidence');
    }
  }
  return round;
}
export class QuizService {
  private sessions = new Map<string, Session>();
  constructor(private provider: ModelProvider, private now = () => Date.now()) {}
  private prune() { for (const [id,s] of this.sessions) if (s.expiresAt <= this.now()) this.sessions.delete(id); }
  private get(id: string) { this.prune(); const session = this.sessions.get(id); if (!session) throw new StudyError(410, 'expired', 'This round expired or the local server restarted. Start a new round.'); return session; }
  async start(raw: unknown): Promise<PublicRound> {
    const { packet, previousRoundId } = roundRequest.parse(raw);
    const sources = eligibleSources(packet);
    if (!sources.length || sources.reduce((n,s) => n + factualStatements(s.text).length, 0) < 3) throw new StudyError(422, 'insufficient_sources', 'There is not enough eligible lecture evidence for three grounded questions. Select and process more complete slides. Flagged pages and topic names alone cannot support a round.');
    if (sources.length > 36) throw new StudyError(400, 'too_much_context', 'Choose fewer lectures for this round.');
    const previous = previousRoundId ? this.get(previousRoundId) : undefined;
    if (previous && !previous.feedback) throw new StudyError(409, 'unfinished', 'Submit your current round before requesting the next three questions.');
    const avoidConcepts = previous?.questions.map(q => q.concept.text) ?? [];
    const input = { sources, avoidConcepts };
    let validated: GeneratedRound | undefined;
    // One bounded regeneration for malformed references/unsupported output; no ungrounded fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
      let stage = 'generation_or_structure';
      try {
        const candidate = validateGenerated(await this.provider.generate(input), sources);
        stage = 'grounding_review';
        const audit = auditSchema.parse(await this.provider.audit(input, candidate));
        if (new Set(audit.questions.map(q => q.index)).size !== 3 || audit.questions.some(q => !q.supported || !q.singleBestAnswer || !q.sufficientFacts || !q.noAnswerLeak)) throw new Error('Grounding audit rejected');
        validated = candidate; break;
      } catch (error) {
        if (error instanceof ProviderError) throw new StudyError(503, 'model_unavailable', error.message);
        // Log outcome codes only, never sources, provider responses, or secrets.
        console.warn(`[study] candidate_rejected stage=${stage} attempt=${attempt + 1}`);
      }
    }
    if (!validated) throw new StudyError(422, 'unsupported_output', 'A fully supported three-question round could not be verified. Try different or more complete lecture sources.');
    this.prune();
    if (this.sessions.size >= 100) throw new StudyError(503, 'busy', 'The local study server is busy. Try again later.');
    const session: Session = { id: randomUUID(), questions: validated.questions.map(q => ({ ...q, id: randomUUID() })), sources,
      fingerprint: fingerprint(sources, packet.selectedLectureIds), expiresAt: this.now() + 60 * 60 * 1000 };
    this.sessions.set(session.id, session);
    return { roundId: session.id, expiresAt: new Date(session.expiresAt).toISOString(), questions: session.questions.map(q => ({ id: q.id, stem: q.stem.text, choices: q.choices.map(c => ({ label: c.label, text: c.content.text })) })) };
  }
  grade(raw: unknown): RoundFeedback {
    const { roundId, packet, answers } = gradeRequest.parse(raw);
    const session = this.get(roundId);
    if (fingerprint(eligibleSources(packet), packet.selectedLectureIds) !== session.fingerprint) throw new StudyError(409, 'sources_changed', 'The lecture selection or source content changed. Start a new round from the current sources.');
    if (new Set(answers.map(a => a.questionId)).size !== 3 || session.questions.some(q => !answers.some(a => a.questionId === q.id && q.choices.some(c => c.label === a.choice)))) throw new StudyError(400, 'incomplete', 'Answer all three questions with a valid choice before submitting.');
    const ordered = session.questions.map(q => answers.find(a => a.questionId === q.id)!);
    if (session.answers && JSON.stringify(session.answers) !== JSON.stringify(ordered)) throw new StudyError(409, 'already_graded', 'This round has already been submitted. Start the next round to continue.');
    if (session.feedback) return session.feedback;
    session.answers = ordered;
    const questions = session.questions.map((q, i) => {
      const evidence = textFields(q).flatMap(field => field.evidence);
      const sources = session.sources.filter(s => evidence.some(e => e.chunkId === s.chunkId)).map(s => ({ ...s, quotes: [...new Set(evidence.filter(e => e.chunkId === s.chunkId).map(e => e.quote))] }));
      return { id: q.id, correct: q.correctAnswer === ordered[i].choice, chosenAnswer: ordered[i].choice, correctAnswer: q.correctAnswer,
        explanation: q.explanation.text, concept: q.concept.text, clue: q.clue.text, difficulty: q.difficulty,
        choices: q.choices.map(c => ({ label: c.label, text: c.content.text, explanation: c.explanation.text })), sources };
    });
    session.feedback = { roundId, correct: questions.filter(q => q.correct).length, total: 3, questions };
    return session.feedback;
  }
}
