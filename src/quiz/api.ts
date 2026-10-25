import type { EvidencePacket } from './evidence';
import { feedbackSchema, publicRoundSchema, type Answer, type PublicRound, type RoundFeedback } from './schema';

async function post(path: string, payload: unknown): Promise<unknown> {
  let response: Response;
  try { response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch { throw new Error('The local study service could not be reached. Start the app with npm run dev and retry.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The study service returned an unreadable response. Please retry.'); }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The study service could not complete this request.');
  return result;
}
export interface StudyApi {
  start(packet: EvidencePacket, previousRoundId?: string): Promise<PublicRound>;
  grade(roundId: string, packet: EvidencePacket, answers: Answer[]): Promise<RoundFeedback>;
}
export const studyApi: StudyApi = {
  start: async (packet, previousRoundId) => {
    const response = await post('/api/study/round', { packet, ...(previousRoundId ? { previousRoundId } : {}) });
    const parsed = publicRoundSchema.safeParse(response);
    if (!parsed.success) throw new Error('The study service returned invalid questions. Please retry.');
    return parsed.data;
  },
  grade: async (roundId, packet, answers) => {
    const response = await post('/api/study/grade', { roundId, packet, answers });
    const parsed = feedbackSchema.safeParse(response);
    if (!parsed.success) throw new Error('The study service returned invalid feedback. Please retry.');
    return parsed.data;
  },
};
