// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createStudyServer } from './http';
import { QuizService } from './quiz-service';
import { OpenAIProvider, ProviderError } from './provider';
import { passingAudit, quizCandidate, quizPacket } from '../src/quiz/fixtures';
const servers: ReturnType<typeof createStudyServer>[] = [];
afterEach(async () => { await Promise.all(servers.map(s => new Promise<void>(resolve => s.close(() => resolve())))); servers.length = 0; });
async function setup(configured = true) {
  const provider = { generate: vi.fn().mockResolvedValue(quizCandidate()), audit: vi.fn().mockResolvedValue(passingAudit()) };
  const server = createStudyServer(new QuizService(provider), configured); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, value: unknown, origin = 'http://localhost:5173') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(value) });
  return { provider, base, post };
}
describe('Local study HTTP boundary', () => {
  it('runs a complete round over HTTP without answers in the generation response', async () => {
    const { post } = await setup(); const packet = quizPacket();
    const response = await post('/api/study/round', { packet });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const round = await response.json();
    expect(round.questions).toHaveLength(3);
    expect(JSON.stringify(round)).not.toContain('correctAnswer');
    const incomplete = await post('/api/study/grade', { roundId: round.roundId, packet, answers: [] });
    expect(incomplete.status).toBe(400);
    const graded = await post('/api/study/grade', { roundId: round.roundId, packet, answers: round.questions.map((q: {id:string}) => ({ questionId:q.id, choice:'A' })) });
    expect(graded.status).toBe(200); const feedback = await graded.json();
    expect(feedback.correct).toBe(1); expect(feedback.questions[0].sources[0].pageNumbers).toEqual([1]);
  });
  it('rejects cross-origin, non-JSON, malformed and oversized requests', async () => {
    const { post, base } = await setup();
    expect((await post('/api/study/round', { packet: quizPacket() }, 'https://unrelated.example')).status).toBe(403);
    expect((await fetch(base+'/api/study/round', { method:'POST',body:'test' })).status).toBe(415);
    expect((await post('/api/study/round', {})).status).toBe(400);
    expect((await fetch(base+'/api/study/round', { method:'POST',headers:{'Content-Type':'application/json'},body:'{' })).status).toBe(400);
    expect((await post('/api/study/round', { large:'x'.repeat(4*1024*1024+1) })).status).toBe(413);
  });
  it('reports missing credentials without echoing provider data or secrets', async () => {
    const { post, base, provider } = await setup(false);
    expect(await (await fetch(base+'/api/health')).json()).toEqual({ configured:false });
    provider.generate.mockRejectedValue(new ProviderError('AI is not configured.'));
    const response = await post('/api/study/round', { packet:quizPacket() });
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ error:'AI is not configured.' });
  });
});

describe('Model-provider credential handling', () => {
  it('keeps the secret only in the authorization header and requests structured generation and review', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices:[{message:{content:JSON.stringify(quizCandidate())}}] }), {status:200}));
    const provider = new OpenAIProvider('synthetic-test-secret', 'test-model', request);
    await provider.generate({ sources:[],avoidConcepts:[] });
    const options = request.mock.calls[0][1]!;
    expect((options.headers as Record<string,string>).Authorization).toBe('Bearer synthetic-test-secret');
    expect(options.body).not.toContain('synthetic-test-secret');
    const payload = JSON.parse(String(options.body));
    expect(payload.response_format.json_schema.strict).toBe(true);
    expect(payload.messages[0].content).toContain('ONLY permitted source');
    expect(payload.messages[0].content).toContain('Do NOT use prior medical knowledge');
    expect(payload.messages[0].content).toContain('topic name');
  });
  it('does not call a provider without credentials and sanitizes network/HTTP/refusal errors', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(new OpenAIProvider(undefined, undefined, request).generate({sources:[],avoidConcepts:[]})).rejects.toThrow('not configured');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(new Response('private-secret-provider-diagnostics',{status:401}));
    await expect(new OpenAIProvider('secret',undefined,request).generate({sources:[],avoidConcepts:[]})).rejects.toThrow('rejected the server credentials');
    request.mockRejectedValue(new Error('sensitive request headers'));
    await expect(new OpenAIProvider('secret',undefined,request).generate({sources:[],avoidConcepts:[]})).rejects.toThrow('could not be reached');
    request.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{refusal:'no'}}]}),{status:200}));
    await expect(new OpenAIProvider('secret',undefined,request).generate({sources:[],avoidConcepts:[]})).rejects.toThrow('could not provide');
  });
});
