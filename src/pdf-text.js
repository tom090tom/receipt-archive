import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { parseInvoice } from './invoice.js';
import { copyBytes, isPdf } from './pdf-bytes.js';

const pdfjsRoot = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url));
let pdfjsPromise;

function loadPdfjs() {
  // PDF.js warns at import when the optional render canvas is absent. Text extraction does not need it.
  pdfjsPromise ??= (async () => {
    const original = console.warn;
    console.warn = (...args) => {
      const text = args.map(String).join(' ');
      if (text.includes('@napi-rs/canvas') || text.includes('DOMMatrix') || text.includes('Path2D')) return;
      original(...args);
    };
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(join(pdfjsRoot, 'legacy/build/pdf.worker.mjs')).href;
      return pdfjs;
    } finally {
      console.warn = original;
    }
  })();
  return pdfjsPromise;
}

export async function readInvoicePdf(bytes) {
  const data = copyBytes(bytes);
  if (!isPdf(data)) return { ok: false, error: '这不是 PDF 文件。' };
  let pdfjs;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    return { ok: false, error: '无法加载 PDF 阅读组件。' };
  }
  let task;
  try {
    task = pdfjs.getDocument({
      data,
      cMapUrl: `${pathToFileURL(join(pdfjsRoot, 'cmaps')).href}/`,
      cMapPacked: true,
      standardFontDataUrl: `${pathToFileURL(join(pdfjsRoot, 'standard_fonts')).href}/`,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter(item => item?.str).map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }));
    const parsed = parseInvoice(items);
    if (!parsed.ok) return parsed;
    return { ok: true, invoice: parsed.invoice, pageCount: doc.numPages };
  } catch (error) {
    if (error?.name === 'PasswordException') return { ok: false, error: '这份 PDF 有打开密码，首版不能读取。' };
    return { ok: false, error: '无法读取这份 PDF。' };
  } finally {
    await task?.destroy?.();
  }
}
