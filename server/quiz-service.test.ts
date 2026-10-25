// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { QuizService, validateGenerated } from './quiz-service';
import { passingAudit, quizCandidate, quizLibrary, quizPacket } from '../src/quiz/fixtures';
import { buildEvidencePacket, eligibleSources } from '../src/quiz/evidence';
import { ProviderError } from './provider';

function setup() {
  const packet = quizPacket();
  const provider = { generate: vi.fn().mockResolvedValue(quizCandidate(packet)), audit: vi.fn().mockResolvedValue(passingAudit()) };
  return { packet, provider, service: new QuizService(provider) };
}
describe('Grounded quiz service', () => {
  it('returns exactly three questions with IDs, never answer keys, feedback or citations before submission', async () => {
    const { packet, service, provider } = setup();
    const round = await service.start({ packet });
    expect(round.questions).toHaveLength(3);
    expect(new Set(round.questions.map(q => q.id)).size).toBe(3);
    const raw = JSON.stringify(round);
    for (const key of ['correctAnswer','explanation','concept','clue','evidence','quote','sources']) expect(raw).not.toContain(`"${key}"`);
    expect(provider.generate.mock.calls[0][0].sources.every((s: {lectureId: string}) => s.lectureId === 'lecture-26')).toBe(true);
    expect(provider.audit).toHaveBeenCalledTimes(1);
  });
  it('grades only after all three valid answers, attaches verified lecture/page/chunk citations, and is idempotent', async () => {
    const { packet, service } = setup();
    const round = await service.start({ packet });
    const answers = round.questions.map(q => ({ questionId: q.id, choice: 'A' }));
    expect(() => service.grade({ roundId: round.roundId, packet, answers: answers.slice(1) })).toThrow();
    expect(() => service.grade({ roundId: round.roundId, packet, answers: [answers[0],answers[0],answers[0]] })).toThrow();
    expect(() => service.grade({ roundId: round.roundId, packet, answers: answers.map(a => ({ ...a, choice: 'E' })) })).toThrow();
    const result = service.grade({ roundId: round.roundId, packet, answers });
    expect(result.correct).toBe(1); expect(result.total).toBe(3);
    expect(result.questions[0].sources[0]).toMatchObject({ lectureId: 'lecture-26', lectureNumber: 26, lectureTitle: 'Sample lecture 26', pageNumbers: [1] });
    expect(result.questions[1].choices[0].explanation).toBeTruthy();
    expect(service.grade({ roundId: round.roundId, packet, answers })).toEqual(result);
    expect(() => service.grade({ roundId: round.roundId, packet, answers: answers.map(a => ({ ...a, choice: 'B' })) })).toThrow('already');
  });
  it('passes only multiple selected lectures and carries previous concepts to a subsequent graded round', async () => {
    const { provider, service } = setup();
    const packet = quizPacket(['lecture-26','lecture-28']);
    const round = await service.start({ packet });
    expect(new Set(provider.generate.mock.calls[0][0].sources.map((s: {lectureId:string}) => s.lectureId))).toEqual(new Set(['lecture-26','lecture-28']));
    await expect(service.start({ packet, previousRoundId: round.roundId })).rejects.toThrow('Submit');
    service.grade({ roundId: round.roundId, packet, answers: round.questions.map(q => ({ questionId:q.id, choice:'A' })) });
    await service.start({ packet, previousRoundId: round.roundId });
    expect(provider.generate.mock.calls.at(-1)![0].avoidConcepts).toHaveLength(3);
  });
  it('rejects fabricated/unselected references, unsupported output and malformed answer schemas with one bounded retry', async () => {
    const { packet, provider, service } = setup();
    const invalid = quizCandidate(packet); invalid.questions[0].stem.evidence[0].chunkId = 'invented-chunk';
    provider.generate.mockResolvedValue(invalid);
    await expect(service.start({ packet })).rejects.toThrow('could not be verified');
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.audit).not.toHaveBeenCalled();
    const wrongLecture = quizCandidate(quizPacket(['lecture-28']));
    expect(() => validateGenerated(wrongLecture, eligibleSources(packet))).toThrow('evidence');
    const wrongAnswer = quizCandidate(packet); wrongAnswer.questions[0].correctAnswer = 'E';
    expect(() => validateGenerated(wrongAnswer, eligibleSources(packet))).toThrow('choices');
    expect(() => validateGenerated({ questions: [] }, eligibleSources(packet))).toThrow();
    const leaked = quizCandidate(packet); leaked.questions[0].stem.text = 'The correct answer is A.';
    expect(() => validateGenerated(leaked, eligibleSources(packet))).toThrow('leakage');
    const falseQuote = quizCandidate(packet); falseQuote.questions[0].stem.evidence[0].quote = 'A claim not present in the original source material.';
    expect(() => validateGenerated(falseQuote, eligibleSources(packet))).toThrow('evidence');
  });
  it('rejects substantively unsupported content even with real source IDs and quotes', async () => {
    const { packet, provider, service } = setup();
    const audit = passingAudit(); audit.questions[1].supported = false;
    provider.audit.mockResolvedValue(audit);
    await expect(service.start({ packet })).rejects.toThrow('could not be verified');
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });
  it('reports insufficient evidence before calling any model, with no fallback', async () => {
    const { provider, service } = setup();
    const data = quizLibrary(); data.processedLectures![0].pages[0].warning = 'Check extraction';
    const packet = buildEvidencePacket(data, ['lecture-26']);
    await expect(service.start({ packet })).rejects.toThrow('not enough eligible');
    expect(provider.generate).not.toHaveBeenCalled();
    await expect(service.start({ packet: { ...packet, selectedLectureIds: [] } })).rejects.toThrow();
  });
  it('rejects stale content at grading and rounds that expired or disappeared after restart', async () => {
    const { packet, provider } = setup();
    let now = 0; const service = new QuizService(provider, () => now);
    const round = await service.start({ packet });
    const answers = round.questions.map(q => ({ questionId:q.id,choice:'A' }));
    const changed = structuredClone(packet); changed.lectures[0].currentFileId = 'replacement';
    expect(() => service.grade({ roundId: round.roundId, packet: changed, answers })).toThrow('changed');
    now = 61 * 60 * 1000;
    expect(() => service.grade({ roundId: round.roundId, packet, answers })).toThrow('expired');
    expect(() => new QuizService(provider).grade({ roundId: round.roundId, packet, answers })).toThrow('expired');
  });
  it('exposes only a safe model failure message', async () => {
    const { packet, provider, service } = setup();
    provider.generate.mockRejectedValue(new ProviderError('The model service could not be reached. Please retry.'));
    await expect(service.start({ packet })).rejects.toThrow('could not be reached');
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
