import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const folder of ['src', 'web', 'bin', 'tests', 'scripts']) {
  for (const file of await readdir(new URL(`../${folder}/`, import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../${folder}/${file}`, import.meta.url))], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('JavaScript syntax checks passed');
