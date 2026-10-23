import { collapseCjkSpaces } from './invoice.js';

export const DEFAULT_TEMPLATE = '{date}_{seller}_{amount}';
const TOKEN = /\{(date|seller|amount|number)\}/gu;

export function sanitizeSeller(value) {
  return collapseCjkSpaces(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^[. ]+|[. ]+$/gu, '')
    .trim();
}

export function validateTemplate(template) {
  if (typeof template !== 'string' || template.trim() !== template || template.length < 1 || template.length > 80) {
    return { ok: false, error: '命名规则长度需为 1–80，且不能有首尾空格。' };
  }
  if (/[<>:"/\\|?*\u0000-\u001f]/u.test(template)) return { ok: false, error: '命名规则含有不能用于文件名的字符。' };
  const remainder = template.replace(/\{(date|seller|amount|number)\}/gu, '');
  if (/[{}]/u.test(remainder)) return { ok: false, error: '命名规则只支持 {date}、{seller}、{amount}、{number}。' };
  if (!/\{(date|seller|amount|number)\}/u.test(template)) return { ok: false, error: '命名规则至少包含一个字段。' };
  return { ok: true, template };
}

export function renderFilename(invoice, template) {
  const check = validateTemplate(template);
  if (!check.ok) throw new Error(check.error);
  const seller = sanitizeSeller(invoice.seller);
  if ([...seller].length < 1 && template.includes('{seller}')) throw new Error('商户名称不能用作文件名。');
  const limitedSeller = [...seller].slice(0, 40).join('').replace(/[. ]+$/gu, '');
  const body = template.replace(TOKEN, (_, key) => {
    if (key === 'date') return invoice.date;
    if (key === 'seller') return limitedSeller;
    if (key === 'amount') return invoice.amount;
    return invoice.number;
  }).replace(/^[. ]+|[. ]+$/gu, '');
  if (!body) throw new Error('文件名为空。');
  const filename = `${body}.pdf`;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.pdf$/iu.test(filename)) throw new Error('文件名是系统保留名。');
  if (new TextEncoder().encode(filename).length > 180) throw new Error('文件名过长。');
  return filename;
}
