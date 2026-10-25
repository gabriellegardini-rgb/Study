import { createStudyServer } from './http';
import { OpenAIProvider } from './provider';
import { QuizService } from './quiz-service';

// This module is only imported by the Node entry point, never by client code.
const key = process.env.OPENAI_API_KEY;
const provider = new OpenAIProvider(key, process.env.STUDY_MODEL || 'gpt-4.1-mini');
const server = createStudyServer(new QuizService(provider), Boolean(key));
server.on('error', () => { console.error('[study] Cannot start local API on port 3001. Check for another running instance.'); process.exitCode = 1; });
server.listen(3001, '127.0.0.1', () => {
  console.log(`[study] Local API listening on port 3001. Model credentials ${key ? 'configured' : 'not configured'}.`);
});
