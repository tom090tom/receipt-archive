import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInvoice } from '../src/invoice.js';

function item(str, x, y) {
  return { str, x, y };
}

function sample() {
  return [
    item('电子发票（普通发票）', 180, 780),
    item('发票号码：', 360, 740),
    item('26260000000000001234', 430, 740),
    item('开票日期：', 360, 720),
    item('2026年03月18日', 430, 720),
    item('购买方信息', 40, 680),
    item('销售方信息', 320, 680),
    item('名称：示例科技有限公司', 40, 650),
    item('名称：星河文具有限公司', 320, 650),
    item('单价', 80, 400),
    item('¥10.00', 140, 400),
    item('价税合计（大写）壹佰贰拾捌圆伍角整 （小写）¥128.50', 40, 120),
  ];
}

test('reads the seller column instead of the buyer or the unit price', () => {
  const result = parseInvoice(sample());
  assert.equal(result.ok, true);
  assert.deepEqual(result.invoice, {
    number: '26260000000000001234',
    date: '2026-03-18',
    seller: '星河文具有限公司',
    amount: '128.50',
    amountCents: 12850,
    title: '电子发票（普通发票）',
  });
});

test('joins a split seller name and removes spaces between Chinese characters', () => {
  const items = sample().filter(entry => !entry.str.startsWith('名称：星河'));
  items.push(item('名称：', 320, 650), item('星 河 文 具', 360, 650));
  const result = parseInvoice(items);
  assert.equal(result.ok, true);
  assert.equal(result.invoice.seller, '星河文具');
});

test('accepts a special invoice title and a grouped amount', () => {
  const items = sample().map(entry => entry.str === '电子发票（普通发票）'
    ? item('电子发票(增值税专用发票)', entry.x, entry.y)
    : entry);
  items.splice(items.findIndex(entry => entry.str.startsWith('价税合计')), 1, item('价税合计（小写）¥1,280.50', 40, 120));
  const result = parseInvoice(items);
  assert.equal(result.ok, true);
  assert.equal(result.invoice.title, '电子发票（增值税专用发票）');
  assert.equal(result.invoice.amount, '1280.50');
  assert.equal(result.invoice.amountCents, 128050);
});

test('stops the seller name before the tax id on the same line', () => {
  const items = sample().map(entry => entry.str.startsWith('名称：星河')
    ? item('名称：星河文具有限公司 统一社会信用代码/纳税人识别号：91310000MA0000000X', 320, 650)
    : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, true);
  assert.equal(result.invoice.seller, '星河文具有限公司');
});

test('rejects a scanned page with no text', () => {
  assert.match(parseInvoice([]).error, /扫描件/);
  assert.match(parseInvoice([item('  \n', 10, 10)]).error, /扫描件/);
});

test('rejects documents that are not the two supported invoice titles', () => {
  const items = [item('电子发票（航空运输电子客票行程单）', 40, 700), item('发票号码：26260000000000001234', 40, 680)];
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /普通发票|增值税专用发票/);
});

test('rejects an old 8-digit invoice number', () => {
  const items = sample().map(entry => entry.str === '26260000000000001234' ? item('12345678', 430, 740) : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /20 位/);
});

test('rejects an invoice number year that disagrees with the issue date', () => {
  const items = sample().map(entry => entry.str === '26260000000000001234' ? item('25260000000000001234', 430, 740) : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /年份/);
});

test('rejects an impossible issue date', () => {
  const items = sample().map(entry => entry.str === '2026年03月18日' ? item('2026年02月31日', 430, 720) : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /开票日期/);
});

test('accepts the small-case total when the currency symbol is not extractable', () => {
  const items = sample().map(entry => entry.str.startsWith('价税合计')
    ? item('价税合计（小写）128.50', 40, 120)
    : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, true);
  assert.equal(result.invoice.amount, '128.50');
});

test('rejects conflicting amounts next to the tax-inclusive total', () => {
  const items = sample().map(entry => entry.str.startsWith('价税合计')
    ? item('价税合计（小写）¥128.50 ¥99.00', 40, 120)
    : entry);
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /多个不同金额/);
});

test('rejects a missing seller column', () => {
  const items = sample().filter(entry => !entry.str.includes('销售方') && !entry.str.startsWith('名称：星河'));
  const result = parseInvoice(items);
  assert.equal(result.ok, false);
  assert.match(result.error, /销售方/);
});
