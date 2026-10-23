import assert from 'node:assert/strict';
import test from 'node:test';
import { planArchive } from '../src/plan.js';

function row(id, invoice, error = null) {
  return { id, invoice, error };
}

const first = {
  number: '26260000000000001234',
  date: '2026-03-18',
  seller: '星河文具有限公司',
  amount: '128.50',
  amountCents: 12850,
  title: '电子发票（普通发票）',
};
const second = { ...first, number: '26260000000000005678', amount: '36.00', amountCents: 3600, seller: '南窗咖啡' };

test('names recognized invoices and keeps recognition errors', () => {
  const plan = planArchive([
    row('a', first),
    row('b', null, '不是发票'),
  ], '{date}_{seller}_{amount}');
  assert.equal(plan.ok, true);
  assert.equal(plan.files[0].filename, '2026-03-18_星河文具有限公司_128.50.pdf');
  assert.equal(plan.files[0].adjusted, false);
  assert.equal(plan.files[1].filename, null);
  assert.equal(plan.files[1].error, '不是发票');
});

test('appends the invoice number when two different invoices would share a file name', () => {
  const plan = planArchive([
    row('a', first),
    row('b', { ...first, number: '26260000000000009999' }),
  ], '{date}_{seller}_{amount}');
  assert.equal(plan.files[1].adjusted, true);
  assert.equal(plan.files[1].filename, '2026-03-18_星河文具有限公司_128.50_26260000000000009999.pdf');
});

test('does not archive the same invoice number twice', () => {
  const plan = planArchive([row('a', second), row('b', second)], '{date}_{number}');
  assert.equal(plan.files[0].filename, '2026-03-18_26260000000000005678.pdf');
  assert.equal(plan.files[1].filename, null);
  assert.match(plan.files[1].error, /重复/);
});

test('returns the template error without naming files', () => {
  const plan = planArchive([row('a', first)], '{buyer}');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /命名规则/);
});
