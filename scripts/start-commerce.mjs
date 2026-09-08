import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../commerce/.medusa/server/', import.meta.url));
const cli = fileURLToPath(new URL('../commerce/node_modules/@medusajs/cli/cli.js', import.meta.url));
if (!existsSync(`${directory}/public/admin/index.html`)) {
  throw new Error('Build commerce with DISABLE_ADMIN=false before starting owner staging.');
}
if (process.env.DISABLE_ADMIN === 'true') {
  throw new Error('Owner staging requires DISABLE_ADMIN=false.');
}
let child;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child?.kill(signal));
async function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [cli, ...args], {
      cwd: directory, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Commerce ${args[0]} exited (${signal ?? code}).`));
    });
  });
}
await run(['db:migrate']);
// Provisioning a catalogue is explicit; never overwrite owner edits on every wake-up.
await run(['start']);
