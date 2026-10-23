import assert from 'node:assert/strict';
import test from 'node:test';
import { createZip } from '../src/zip.js';

function text(value) {
  return new TextEncoder().encode(value);
}

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const flags = view.getUint16(6, true);
  const method = view.getUint16(8, true);
  const compressed = view.getUint32(18, true);
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const name = new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
  const data = bytes.subarray(30 + nameLength + extraLength, 30 + nameLength + extraLength + compressed);
  return { flags, method, name, data };
}

test('stores the original bytes under a UTF-8 name', () => {
  const payload = text('original-pdf-bytes');
  const zip = createZip([{ name: '2026-03-18_星河文具_128.50.pdf', data: payload }]);
  const entry = readZip(zip);
  assert.equal(entry.method, 0);
  assert.equal(entry.flags & 0x800, 0x800);
  assert.equal(entry.name, '2026-03-18_星河文具_128.50.pdf');
  assert.deepEqual(entry.data, payload);
  assert.equal(new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(zip.length - 22, true), 0x06054b50);
});

test('rejects unsafe, empty and duplicate names', () => {
  assert.throws(() => createZip([{ name: '../secret.pdf', data: text('x') }]), /文件名/);
  assert.throws(() => createZip([{ name: 'CON.pdf', data: text('x') }]), /文件名/);
  assert.throws(() => createZip([
    { name: 'A.pdf', data: text('x') },
    { name: 'a.pdf', data: text('y') },
  ]), /重复/);
});
