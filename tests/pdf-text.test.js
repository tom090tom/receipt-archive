import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isPdf } from '../src/pdf-bytes.js';
import { readInvoicePdf } from '../src/pdf-text.js';

async function example(name) {
  return new Uint8Array(await readFile(new URL(`../examples/${name}`, import.meta.url)));
}

test('recognizes only a PDF header', () => {
  assert.equal(isPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
  assert.equal(isPdf(new TextEncoder().encode('hello')), false);
});

test('reads the synthetic ordinary invoice from its text layer', async () => {
  const result = await readInvoicePdf(await example('stationery.pdf'));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invoice.seller, '星河文具有限公司');
  assert.equal(result.invoice.date, '2026-03-18');
  assert.equal(result.invoice.amount, '128.50');
  assert.equal(result.invoice.number, '26260000000000001234');
  assert.equal(result.invoice.title, '电子发票（普通发票）');
});

test('reads the synthetic special invoice and ignores the buyer', async () => {
  const result = await readInvoicePdf(await example('coffee.pdf'));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.invoice.seller, '南窗咖啡');
  assert.equal(result.invoice.amount, '36.00');
  assert.equal(result.invoice.title, '电子发票（增值税专用发票）');
});

test('rejects a note and a page without text', async () => {
  const note = await readInvoicePdf(await example('notes.pdf'));
  const scan = await readInvoicePdf(await example('scan.pdf'));
  assert.equal(note.ok, false);
  assert.match(note.error, /普通发票|增值税专用发票/);
  assert.match(scan.error, /扫描件/);
  assert.equal(JSON.stringify(note).includes('UNIQUE-NOTE-TOKEN'), false);
});
