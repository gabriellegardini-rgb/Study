import { z } from 'zod';

export const choiceLabel = z.enum(['A', 'B', 'C', 'D', 'E']);
export const quoteSchema = z.object({ chunkId: z.string().min(1).max(300), quote: z.string().min(12).max(2000) }).strict();
export const groundedText = z.object({ text: z.string().min(1).max(4000), evidence: z.array(quoteSchema).min(1).max(8) }).strict();
export const generatedQuestion = z.object({
  stem: groundedText,
  choices: z.array(z.object({ label: choiceLabel, content: groundedText, explanation: groundedText }).strict()).min(3).max(5),
  correctAnswer: choiceLabel,
  explanation: groundedText,
  concept: groundedText,
  clue: groundedText,
  difficulty: z.enum(['foundational', 'second-order', 'third-order']),
}).strict();
export const generatedRound = z.object({ questions: z.array(generatedQuestion).length(3) }).strict();
export type GeneratedQuestion = z.infer<typeof generatedQuestion>;
export type GeneratedRound = z.infer<typeof generatedRound>;
export type GroundedText = z.infer<typeof groundedText>;
export type ChoiceLabel = z.infer<typeof choiceLabel>;

export const publicRoundSchema = z.object({
  roundId: z.string(), expiresAt: z.string(),
  questions: z.array(z.object({ id: z.string(), stem: z.string(), choices: z.array(z.object({ label: choiceLabel, text: z.string() }).strict()).min(3).max(5) }).strict()).length(3),
}).strict();
export type PublicRound = z.infer<typeof publicRoundSchema>;
export interface Answer { questionId: string; choice: ChoiceLabel }
export const citationSchema = z.object({ chunkId: z.string(), lectureId: z.string(), lectureTitle: z.string(), lectureNumber: z.number().int(), fileId: z.string(), pageNumbers: z.array(z.number().int().positive()).min(1), text: z.string(), quotes: z.array(z.string()).min(1), learningObjectiveIds: z.array(z.string()) }).strict();
export const feedbackSchema = z.object({ roundId: z.string(), correct: z.number().int().min(0).max(3), total: z.literal(3), questions: z.array(z.object({
  id: z.string(), correct: z.boolean(), chosenAnswer: choiceLabel, correctAnswer: choiceLabel, explanation: z.string(), concept: z.string(), clue: z.string(), difficulty: z.enum(['foundational','second-order','third-order']),
  choices: z.array(z.object({ label: choiceLabel, text: z.string(), explanation: z.string() }).strict()).min(3).max(5), sources: z.array(citationSchema).min(1),
}).strict()).length(3) }).strict();
export type Citation = z.infer<typeof citationSchema>;
export type RoundFeedback = z.infer<typeof feedbackSchema>;
