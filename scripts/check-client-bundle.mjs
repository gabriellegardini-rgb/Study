import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const forbidden = ['OPENAI_API_KEY', 'api.openai.com', 'study-build-secret-canary'];
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 8) forbidden.push(process.env.OPENAI_API_KEY);
function check(path) {
  for (const entry of readdirSync(path, { withFileTypes:true })) {
    const file = join(path,entry.name);
    if (entry.isDirectory()) { check(file); continue; }
    if (!/\.(js|mjs|html|css|map)$/.test(file)) continue;
    const text=readFileSync(file,'utf8');
    if (forbidden.some(value=>text.includes(value))) throw new Error('A server credential marker or provider endpoint was found in the client build.');
  }
}
check(fileURLToPath(new URL('../dist/',import.meta.url)));
console.log('Client bundle check passed: no server credential markers or provider endpoint.');
