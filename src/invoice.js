const SUPPORTED_TITLES = [
  ['电子发票（普通发票）', '电子发票(普通发票)'],
  ['电子发票（增值税专用发票）', '电子发票(增值税专用发票)'],
];

function compact(value) {
  return String(value ?? '').replace(/\s+/gu, '');
}

export function collapseCjkSpaces(value) {
  return String(value ?? '')
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/gu, '$1')
    .replace(/[ \t]+/gu, ' ')
    .trim();
}

function fail(error) {
  return { ok: false, error };
}

function linesOf(items) {
  const sorted = items
    .filter(item => item && typeof item.str === 'string' && item.str.trim())
    .map(item => ({ str: item.str, x: Number(item.x) || 0, y: Number(item.y) || 0 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.find(entry => Math.abs(entry.y - item.y) <= 2.5);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

function lineText(line, minX = -Infinity, maxX = Infinity) {
  return line.items.filter(item => item.x >= minX && item.x < maxX).map(item => item.str).join('');
}

function findAnchor(lines, label) {
  for (const line of lines) {
    const hit = line.items.find(item => compact(item.str).includes(label));
    if (hit) return hit.x;
  }
  return null;
}

function columnBounds(anchorX, otherX) {
  if (otherX == null) return { minX: anchorX - 30, maxX: anchorX + 320 };
  const middle = (anchorX + otherX) / 2;
  return anchorX >= otherX ? { minX: middle, maxX: Infinity } : { minX: -Infinity, maxX: middle };
}

function sellerName(lines, sellerX, buyerX) {
  const { minX, maxX } = columnBounds(sellerX, buyerX);
  const candidates = [];
  for (const line of lines) {
    const text = lineText(line, minX, maxX);
    const match = text.match(/名称\s*[：:]\s*(.+)$/u);
    if (!match) continue;
    const value = collapseCjkSpaces(match[1].split(/统一社会信用代码|纳税人识别号/u)[0]);
    const label = line.items.find(item => item.x >= minX && item.x < maxX && compact(item.str).includes('名称'));
    if (value) candidates.push({ x: label?.x ?? sellerX, value });
  }
  candidates.sort((a, b) => Math.abs(a.x - sellerX) - Math.abs(b.x - sellerX));
  return candidates[0]?.value ?? '';
}

function labeledText(lines, label) {
  for (let index = 0; index < lines.length; index += 1) {
    const current = lineText(lines[index]);
    if (!compact(current).includes(label)) continue;
    const next = lines[index + 1] && lines[index].y - lines[index + 1].y <= 18 ? lineText(lines[index + 1]) : '';
    return `${current}${next}`;
  }
  return '';
}

function parseAmount(text) {
  const marked = text.includes('小写');
  const source = marked ? text.slice(text.lastIndexOf('小写')) : text;
  const pattern = marked
    ? /(?:[¥￥]\s*)?((?:\d{1,3}(?:,\d{3})+|\d{1,10}))\.(\d{2})/gu
    : /[¥￥]\s*((?:\d{1,3}(?:,\d{3})+|\d{1,10}))\.(\d{2})/gu;
  const matches = [...source.matchAll(pattern)];
  const cents = matches.map(match => {
    const whole = match[1].replace(/,/gu, '');
    if (!/^\d{1,10}$/u.test(whole)) return null;
    return Number(whole) * 100 + Number(match[2]);
  }).filter(value => value != null);
  return [...new Set(cents)];
}

function parseDate(text) {
  const match = text.match(/开票日期[：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2099 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { invalid: true };
  return { invalid: false, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, year };
}

function supportedTitle(flat) {
  for (const aliases of SUPPORTED_TITLES) {
    const found = aliases.find(title => flat.includes(compact(title)));
    if (found) return aliases[0];
  }
  return '';
}

export function parseInvoice(items) {
  const usable = Array.isArray(items) ? items.filter(item => item && String(item.str ?? '').trim()) : [];
  if (usable.length === 0) return fail('这份 PDF 没有可提取的文字，可能是扫描件。首版不识别图片。');
  const lines = linesOf(usable);
  const flat = compact(usable.map(item => item.str).join(''));
  const title = supportedTitle(flat);
  if (!title) return fail('不是首版支持的电子发票（普通发票）或电子发票（增值税专用发票）。');

  const numberText = labeledText(lines, '发票号码');
  const numberMatch = numberText.match(/发票号码[：:\s]*(\d+)/u);
  if (!numberMatch) return fail('没有找到发票号码。');
  if (!/^\d{20}$/u.test(numberMatch[1])) return fail('首版只接受 20 位数电发票号码。');

  const parsedDate = parseDate(labeledText(lines, '开票日期'));
  if (!parsedDate) return fail('没有找到开票日期。');
  if (parsedDate.invalid) return fail('开票日期无效。');
  if (numberMatch[1].slice(0, 2) !== String(parsedDate.year).slice(2)) return fail('发票号码前两位与开票日期的年份不一致。');

  const sellerX = findAnchor(lines, '销售方');
  if (sellerX == null) return fail('没有找到销售方信息，无法确定商户。');
  const seller = sellerName(lines, sellerX, findAnchor(lines, '购买方'));
  if ([...seller].length < 2) return fail('没有在销售方信息旁找到商户名称。');

  const amountText = labeledText(lines, '价税合计');
  if (!amountText) return fail('没有找到价税合计。');
  const amounts = parseAmount(amountText);
  if (amounts.length === 0) return fail('没有找到价税合计的小写金额。');
  if (amounts.length > 1) return fail('价税合计附近有多个不同金额，已停止命名。');

  const amountCents = amounts[0];
  return {
    ok: true,
    invoice: {
      number: numberMatch[1],
      date: parsedDate.iso,
      seller,
      amount: `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`,
      amountCents,
      title,
    },
  };
}
