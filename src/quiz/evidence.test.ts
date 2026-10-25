import { describe, expect, it } from 'vitest';
import { buildEvidencePacket, eligibleSources, factualStatements } from './evidence';
import { quizLibrary, quizPacket } from './fixtures';

describe('Question-generation evidence isolation', () => {
  it('requires explicit scope, excludes unselected content, and supports multiple lectures', () => {
    const data = quizLibrary();
    expect(eligibleSources(buildEvidencePacket(data, []))).toEqual([]);
    expect(eligibleSources(quizPacket()).map(s => s.lectureId)).toEqual(['lecture-26']);
    expect(eligibleSources(quizPacket(['lecture-26','lecture-28'])).map(s => s.lectureId)).toEqual(['lecture-26','lecture-28']);
    expect(JSON.stringify(quizPacket())).not.toContain('lecture-28');
    const extra = quizPacket(['lecture-26','lecture-28']); extra.selectedLectureIds = ['lecture-26'];
    expect(eligibleSources(extra).map(s => s.lectureId)).toEqual(['lecture-26']);
  });
  it.each(['low text', 'Check extraction', 'extraction failed', ''])('rejects any page warning, including %s', warning => {
    const packet = quizPacket(); packet.records[0].pages[0].warning = warning;
    expect(eligibleSources(packet)).toEqual([]);
  });
  it('rejects empty/failed/low-text pages, stale/failed processing and demo content on the server boundary', () => {
    for (const change of [
      (p: ReturnType<typeof quizPacket>) => { p.records[0].pages[0].extractionStatus = 'failed'; },
      (p: ReturnType<typeof quizPacket>) => { p.records[0].pages[0].extractionStatus = 'empty'; },
      (p: ReturnType<typeof quizPacket>) => { p.lectures[0].currentFileId = 'new-file'; },
      (p: ReturnType<typeof quizPacket>) => { p.records[0].status = 'failed'; },
      (p: ReturnType<typeof quizPacket>) => { p.lectures[0].isDemo = true; },
      (p: ReturnType<typeof quizPacket>) => { p.records[0].pages[0].normalizedText = 'short'; },
    ]) { const packet = quizPacket(); change(packet); expect(eligibleSources(packet)).toEqual([]); }
  });
  it('excludes name-only chunks even if the page has many topic names', () => {
    const packet = quizPacket();
    const names = 'Amber device\nViolet device\nSilver device\nMore named devices\nAdditional topic names';
    packet.records[0].pages[0].normalizedText = names;
    packet.records[0].chunks[0].text = names; packet.records[0].chunks[0].endOffset = names.length;
    expect(factualStatements(names)).toEqual([]);
    expect(eligibleSources(packet)).toEqual([]);
  });
  it('validates page/file identity, exact source text and offsets rather than trusting chunk IDs alone', () => {
    const packet = quizPacket(); packet.records[0].chunks[0].text += ' Invented facts';
    expect(eligibleSources(packet)).toEqual([]);
    const other = quizPacket(); other.records[0].chunks[0].source.pageIds = ['missing'];
    expect(eligibleSources(other)).toEqual([]);
  });
});


it('tracks only accepted source-linked objectives without using objective text as evidence', () => {
  const data=quizLibrary();
  data.objectives.push({ id:'objective', lectureId:'lecture-26', text:'This text is not generation evidence', reviewed:false, source:{kind:'pdf',documentId:'file-26',page:1} });
  const packet=buildEvidencePacket(data,['lecture-26']);
  expect(eligibleSources(packet)[0].learningObjectiveIds).toEqual(['objective']);
  expect(JSON.stringify(packet)).not.toContain('This text is not generation evidence');
});
