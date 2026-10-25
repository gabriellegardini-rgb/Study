import { createServer, type IncomingMessage } from 'node:http';
import { ZodError } from 'zod';
import { QuizService, StudyError } from './quiz-service';

const MAX_BODY = 4 * 1024 * 1024;
function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let length = 0;
    let rejected = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_BODY) { if (!rejected) reject(new StudyError(413, 'too_large', 'The selected source packet is too large. Select fewer lectures.')); rejected = true; return; }
      if (!rejected) chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new StudyError(400, 'invalid_json', 'The study request was not valid JSON.')); }
    });
    request.on('error', reject);
  });
}
export function createStudyServer(service: QuizService, configured: boolean) {
  let generating = 0;
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, payload: unknown) => { response.statusCode = status; response.end(JSON.stringify(payload)); };
    try {
      if (request.headers.origin && !['http://localhost:5173', 'http://127.0.0.1:5173'].includes(request.headers.origin)) throw new StudyError(403, 'origin', 'This local study API only accepts requests from the local Study app.');
      if (request.method === 'GET' && request.url === '/api/health') { send(200, { configured }); return; }
      if (request.method !== 'POST' || !['/api/study/round', '/api/study/grade'].includes(request.url ?? '')) { send(404, { error: 'Study endpoint not found.' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) throw new StudyError(415, 'content_type', 'Use a JSON study request.');
      const payload = await body(request);
      if (request.url === '/api/study/grade') { send(200, service.grade(payload)); return; }
      if (generating >= 2) throw new StudyError(429, 'busy', 'A study round is already being prepared. Please wait and retry.');
      generating++;
      try { send(200, await service.start(payload)); } finally { generating--; }
    } catch (error) {
      if (error instanceof StudyError) { send(error.status, { code: error.code, error: error.message }); return; }
      if (error instanceof ZodError) { send(400, { code: 'invalid_request', error: 'The study request is incomplete or invalid. Reopen Study and retry.' }); return; }
      console.warn('[study] request_failed');
      send(500, { code: 'internal', error: 'The local study service could not complete this request. Please retry.' });
    }
  });
}
