import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const processes = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', '--import', 'tsx', 'server/index.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of processes) {
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
}
