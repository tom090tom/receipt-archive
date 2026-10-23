import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/receipt-archive.js', import.meta.url));
const stationery = fileURLToPath(new URL('../examples/stationery.pdf', import.meta.url));
const coffee = fileURLToPath(new URL('../examples/coffee.pdf', import.meta.url));
const notes = fileURLToPath(new URL('../examples/notes.pdf', import.meta.url));

function run(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('prints a JSON plan for two synthetic invoices', async () => {
  const result = await run([stationery, coffee, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.files[0].invoice.seller, '星河文具有限公司');
  assert.equal(plan.files[0].filename, '2026-03-18_星河文具有限公司_128.50.pdf');
  assert.equal(plan.files[1].invoice.seller, '南窗咖啡');
  assert.equal(result.stdout.includes('UNIQUE-NOTE-TOKEN'), false);
});

test('rejects a non-invoice without echoing its private text', async () => {
  const result = await run([notes, '--json']);
  assert.equal(result.status, 1);
  assert.equal(`${result.stdout}${result.stderr}`.includes('UNIQUE-NOTE-TOKEN'), false);
  assert.match(result.stdout, /普通发票|增值税专用发票/);
});

test('copies original bytes and refuses to overwrite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'receipt-archive-'));
  try {
    const first = await run([stationery, '--out', directory]);
    assert.equal(first.status, 0, first.stderr);
    const name = '2026-03-18_星河文具有限公司_128.50.pdf';
    const copied = await readFile(join(directory, name));
    const original = await readFile(stationery);
    assert.deepEqual(copied, original);
    const second = await run([stationery, '--out', directory]);
    assert.equal(second.status, 1);
    assert.match(second.stdout, /未覆盖/);
    assert.deepEqual(await readFile(join(directory, name)), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an unknown option and a non-PDF', async () => {
  assert.equal((await run(['--nope'])).status, 2);
  const directory = await mkdtemp(join(tmpdir(), 'receipt-archive-text-'));
  const fake = join(directory, 'note.pdf');
  try {
    await writeFile(fake, 'not a pdf UNIQUE-NOTE-TOKEN');
    const result = await run([fake]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /不是 PDF/);
    assert.equal(result.stdout.includes('UNIQUE-NOTE-TOKEN'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
