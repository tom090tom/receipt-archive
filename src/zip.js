import { LIMITS } from './limits.js';

const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function unsafe(name) {
  return typeof name !== 'string' || !name || name !== name.normalize('NFC')
    || /[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(name)
    || name.startsWith('.') || /[. ]$/u.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name);
}

export function createZip(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > LIMITS.maxFiles) throw new Error('ZIP 需包含 1–20 个文件。');
  const names = new Set();
  let payload = 0;
  const records = entries.map(({ name, data }) => {
    if (unsafe(name)) throw new Error('ZIP 文件名不安全。');
    const key = name.toLocaleLowerCase('en-US');
    if (names.has(key)) throw new Error('ZIP 文件名重复。');
    names.add(key);
    if (!(data instanceof Uint8Array)) throw new Error('ZIP 只接受字节数据。');
    payload += data.byteLength;
    if (data.byteLength > LIMITS.maxFileBytes || payload > LIMITS.maxTotalBytes) throw new Error('导出文件超过大小限制。');
    const encoded = encoder.encode(name);
    if (encoded.length > 180) throw new Error('ZIP 文件名过长。');
    return { data, name: encoded, crc: crc32(data) };
  });
  const localSize = records.reduce((size, record) => size + 30 + record.name.length + record.data.length, 0);
  const centralSize = records.reduce((size, record) => size + 46 + record.name.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const record of records) {
    record.offset = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x800, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint32(offset + 14, record.crc, true);
    view.setUint32(offset + 18, record.data.length, true);
    view.setUint32(offset + 22, record.data.length, true);
    view.setUint16(offset + 26, record.name.length, true);
    bytes.set(record.name, offset + 30);
    bytes.set(record.data, offset + 30 + record.name.length);
    offset += 30 + record.name.length + record.data.length;
  }
  const centralOffset = offset;
  for (const record of records) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x800, true);
    view.setUint32(offset + 16, record.crc, true);
    view.setUint32(offset + 20, record.data.length, true);
    view.setUint32(offset + 24, record.data.length, true);
    view.setUint16(offset + 28, record.name.length, true);
    view.setUint32(offset + 42, record.offset, true);
    bytes.set(record.name, offset + 46);
    offset += 46 + record.name.length;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, records.length, true);
  view.setUint16(offset + 10, records.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralOffset, true);
  return bytes;
}
