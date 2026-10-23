import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const fontPath = 'C:\\Windows\\Fonts\\simhei.ttf';
const outDir = new URL('../examples/', import.meta.url);

const invoices = [
  {
    file: 'stationery.pdf',
    title: '电子发票（普通发票）',
    number: '26260000000000001234',
    date: '2026年03月18日',
    buyer: '示例科技有限公司',
    seller: '星河文具有限公司',
    item: '笔记本',
    unit: '10.00',
    words: '壹佰贰拾捌圆伍角整',
    amount: '128.50',
  },
  {
    file: 'coffee.pdf',
    title: '电子发票（增值税专用发票）',
    number: '26010000000000000088',
    date: '2026年03月02日',
    buyer: '示例科技有限公司',
    seller: '南窗咖啡',
    item: '咖啡',
    unit: '36.00',
    words: '叁拾陆圆整',
    amount: '36.00',
  },
];

async function drawInvoice(font, spec) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embedded = await pdf.embedFont(font, { subset: true });
  const page = pdf.addPage([595.28, 841.89]);
  const ink = rgb(0.12, 0.1, 0.08);
  const draw = (text, x, y, size = 11) => page.drawText(text, { x, y, size, font: embedded, color: ink });
  draw(spec.title, 168, 786, 18);
  draw('发票号码：', 330, 748);
  draw(spec.number, 400, 748);
  draw('开票日期：', 330, 726);
  draw(spec.date, 400, 726);
  draw('购买方信息', 48, 680, 12);
  draw('销售方信息', 318, 680, 12);
  draw(`名称：${spec.buyer}`, 48, 652);
  draw(`名称：${spec.seller}`, 318, 652);
  draw('项目名称', 48, 560, 10);
  draw(spec.item, 48, 534);
  draw(`单价 ￥${spec.unit}`, 300, 534);
  draw(`价税合计（大写）${spec.words} （小写）￥${spec.amount}`, 48, 168);
  draw('合成示例，不能用于报销或查验。', 48, 72, 9);
  return pdf.save();
}

const font = await readFile(fontPath);
await mkdir(outDir, { recursive: true });
for (const spec of invoices) {
  await writeFile(new URL(spec.file, outDir), await drawInvoice(font, spec));
}

const note = await PDFDocument.create();
note.registerFontkit(fontkit);
const noteFont = await note.embedFont(font, { subset: true });
const notePage = note.addPage([595.28, 841.89]);
notePage.drawText('会议纪要', { x: 48, y: 760, size: 18, font: noteFont, color: rgb(0.12, 0.1, 0.08) });
notePage.drawText('这不是发票。UNIQUE-NOTE-TOKEN', { x: 48, y: 720, size: 12, font: noteFont, color: rgb(0.12, 0.1, 0.08) });
await writeFile(new URL('notes.pdf', outDir), await note.save());

const scan = await PDFDocument.create();
const scanPage = scan.addPage([595.28, 841.89]);
scanPage.drawRectangle({ x: 48, y: 700, width: 180, height: 80, color: rgb(0.85, 0.82, 0.76) });
await writeFile(new URL('scan.pdf', outDir), await scan.save());
console.log('Wrote synthetic examples to examples/');
