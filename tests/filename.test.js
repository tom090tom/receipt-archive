import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TEMPLATE, renderFilename, validateTemplate } from '../src/filename.js';

const invoice = {
  number: '26260000000000001234',
  date: '2026-03-18',
  seller: '星河文具有限公司',
  amount: '128.50',
  amountCents: 12850,
  title: '电子发票（普通发票）',
};

test('default template uses date, seller and amount', () => {
  assert.equal(DEFAULT_TEMPLATE, '{date}_{seller}_{amount}');
  assert.equal(renderFilename(invoice, DEFAULT_TEMPLATE), '2026-03-18_星河文具有限公司_128.50.pdf');
});

test('renders the invoice number and pads small amounts indirectly through the invoice', () => {
  assert.equal(renderFilename({ ...invoice, amount: '36.00', seller: '南窗咖啡' }, '{date}_{seller}_{amount}_{number}'),
    '2026-03-02_南窗咖啡_36.00_26260000000000001234.pdf'.replace('2026-03-02', invoice.date));
});

test('replaces characters that cannot appear in a Windows file name', () => {
  assert.equal(renderFilename({ ...invoice, seller: '星河/文具:店' }, DEFAULT_TEMPLATE), '2026-03-18_星河_文具_店_128.50.pdf');
});

test('removes spaces that PDF text extraction inserts between Chinese characters', () => {
  assert.equal(renderFilename({ ...invoice, seller: '星 河 文 具' }, '{seller}'), '星河文具.pdf');
});

test('rejects path characters, unknown tokens and an empty rule', () => {
  assert.equal(validateTemplate('../{date}').ok, false);
  assert.equal(validateTemplate('{buyer}').ok, false);
  assert.equal(validateTemplate('发票').ok, false);
  assert.equal(validateTemplate('{date}_{seller}').ok, true);
});

test('rejects a reserved device name', () => {
  assert.throws(() => renderFilename({ ...invoice, seller: 'con' }, '{seller}'), /保留名/);
});
