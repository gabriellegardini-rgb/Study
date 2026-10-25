import { z } from 'zod';
import type { LibraryData } from '../library/models';

const identifier = z.string().min(1).max(300);
const pageSchema = z.object({ id: identifier, lectureId: identifier, fileId: identifier, pageNumber: z.number().int().positive(), normalizedText: z.string().max(100000), extractionStatus: z.enum(['extracted', 'empty', 'failed']), warning: z.string().optional() }).strict();
const chunkSchema = z.object({ id: identifier, source: z.object({ lectureId: identifier, fileId: identifier, pageNumbers: z.array(z.number().int().positive()).length(1), pageIds: z.array(identifier).length(1) }).strict(), text: z.string().min(1).max(2000), startOffset: z.number().int().nonnegative(), endOffset: z.number().int().positive() }).strict();
export const evidencePacketSchema = z.object({
  selectedLectureIds: z.array(identifier).min(1).max(100),
  objectiveLinks: z.array(z.object({ id: identifier, lectureId: identifier, fileId: identifier, pageNumber: z.number().int().positive() }).strict()).max(1000),
  lectures: z.array(z.object({ id: identifier, title: z.string().min(1).max(200), number: z.number().int().positive(), isDemo: z.boolean(), currentFileId: identifier.nullable() }).strict()).max(100),
  records: z.array(z.object({ lectureId: identifier, fileId: identifier, status: z.enum(['processed', 'failed']), pages: z.array(pageSchema).max(200), chunks: z.array(chunkSchema).max(200) }).strict()).max(100),
}).strict();
export type EvidencePacket = z.infer<typeof evidencePacketSchema>;
export interface EligibleSource { chunkId: string; lectureId: string; fileId: string; lectureTitle: string; lectureNumber: number; pageNumbers: number[]; text: string; learningObjectiveIds: string[] }

// Conservative syntax gate, not a medical-fact classifier. Names/lists alone do not qualify.
export function factualStatements(text: string): string[] {
  return text.split(/\n|(?<=[.!?])\s+/).filter(line =>
    line.trim().length >= 45 && line.trim().split(/\s+/).length >= 7 &&
    /\b(?:is|are|has|have|inhibits?|blocks?|causes?|reduces?|increases?|prevents?|binds?|requires?|produces?|leads?|results?|associated|characterized|used|acts?|occurs?|contains?|includes?|maintains?)\b|:\s+\S/i.test(line));
}
export function eligibleSources(packet: EvidencePacket): EligibleSource[] {
  const scope = new Set(packet.selectedLectureIds);
  if (!scope.size) return [];
  if (scope.size !== packet.selectedLectureIds.length || new Set(packet.lectures.map(l => l.id)).size !== packet.lectures.length) throw new Error('Invalid lecture selection.');
  const result: EligibleSource[] = [];
  const seen = new Set<string>();
  for (const record of packet.records) {
    const lecture = packet.lectures.find(l => l.id === record.lectureId);
    if (!lecture || !scope.has(lecture.id) || lecture.isDemo || !lecture.currentFileId || lecture.currentFileId !== record.fileId || record.status !== 'processed') continue;
    for (const chunk of record.chunks) {
      const page = record.pages.find(p => p.id === chunk.source.pageIds[0]);
      if (!page || page.warning !== undefined || page.extractionStatus !== 'extracted' || page.normalizedText.trim().length < 40
        || page.lectureId !== lecture.id || page.fileId !== record.fileId || page.pageNumber !== chunk.source.pageNumbers[0]
        || chunk.source.lectureId !== lecture.id || chunk.source.fileId !== record.fileId
        || chunk.endOffset > page.normalizedText.length || chunk.startOffset >= chunk.endOffset
        || chunk.text !== page.normalizedText.slice(chunk.startOffset, chunk.endOffset)
        || !factualStatements(chunk.text).length || seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      result.push({ chunkId: chunk.id, lectureId: lecture.id, fileId: record.fileId, lectureTitle: lecture.title, lectureNumber: lecture.number, pageNumbers: [...chunk.source.pageNumbers], text: chunk.text, learningObjectiveIds: packet.objectiveLinks.filter(o => o.lectureId === lecture.id && o.fileId === record.fileId && o.pageNumber === page.pageNumber).map(o => o.id) });
    }
  }
  return result;
}
export function buildEvidencePacket(data: LibraryData, selected: string[]): EvidencePacket {
  const lectures = data.lectures.filter(l => selected.includes(l.id)).map(l => ({ id: l.id, title: l.title, number: l.number, isDemo: l.isDemo, currentFileId: l.pdf?.id ?? null }));
  const objectiveLinks = data.objectives.flatMap(o => o.source.kind === 'pdf' && !o.source.edited && selected.includes(o.lectureId) ? [{ id: o.id, lectureId: o.lectureId, fileId: o.source.documentId, pageNumber: o.source.page }] : []);
  // Never send blobs or an entire unselected library to the API.
  const records = (data.processedLectures ?? []).filter(r => lectures.some(l => !l.isDemo && l.id === r.lectureId && l.currentFileId === r.fileId)).map(r => ({
    lectureId: r.lectureId, fileId: r.fileId, status: r.status,
    pages: r.pages.map(p => ({ id: p.id, lectureId: p.lectureId, fileId: p.fileId, pageNumber: p.pageNumber, normalizedText: p.normalizedText, extractionStatus: p.extractionStatus, ...(p.warning === undefined ? {} : { warning: p.warning }) })),
    chunks: r.chunks,
  }));
  // Balanced cap across selected lectures. Only eligible chunks and their pages cross the API boundary.
  const all = eligibleSources({ selectedLectureIds: selected, objectiveLinks, lectures, records });
  const groups = lectures.map(l => all.filter(c => c.lectureId === l.id));
  const chosen = new Set<string>();
  for (let index = 0; chosen.size < 36 && groups.some(g => index < g.length); index++) {
    for (const group of groups) { if (chosen.size < 36 && group[index]) chosen.add(group[index].chunkId); }
  }
  return { selectedLectureIds: selected, objectiveLinks, lectures, records: records.map(r => {
    const chunks = r.chunks.filter(c => chosen.has(c.id));
    return { ...r, chunks, pages: r.pages.filter(p => chunks.some(c => c.source.pageIds.includes(p.id))) };
  }).filter(r => r.chunks.length) };
}
