import { afterEach, describe, expect, it, vi } from 'vitest';
import { studyApi } from './api';
import { quizPacket } from './fixtures';
afterEach(()=>vi.unstubAllGlobals());
describe('Browser study API validation',()=>{
  it('rejects a pre-submission response containing answer fields',async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({roundId:'x',expiresAt:'date',questions:[0,1,2].map(i=>({id:String(i),stem:'Question',choices:['A','B','C'].map(label=>({label,text:label})),correctAnswer:'A'}))}),{status:200}));
    vi.stubGlobal('fetch',request);
    await expect(studyApi.start(quizPacket())).rejects.toThrow('invalid questions');
  });
  it('uses only relative API paths and shows recoverable network and HTTP errors',async()=>{
    const request=vi.fn().mockRejectedValue(new Error('network'));
    vi.stubGlobal('fetch',request);
    await expect(studyApi.start(quizPacket())).rejects.toThrow('could not be reached');
    expect(request.mock.calls[0][0]).toBe('/api/study/round');
    expect(request.mock.calls[0][1].headers).toEqual({'Content-Type':'application/json'});
    request.mockResolvedValue(new Response(JSON.stringify({error:'Not enough sources'}),{status:422}));
    await expect(studyApi.start(quizPacket())).rejects.toThrow('Not enough sources');
  });
});
