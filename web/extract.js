import * as pdfjs from '/vendor/pdfjs/build/pdf.mjs';
import { parseInvoice } from '/src/invoice.js';
import { copyBytes, isPdf } from '/src/pdf-bytes.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('/vendor/pdfjs/build/pdf.worker.mjs', window.location.href).href;

export async function extractInvoice(bytes) {
  const data = copyBytes(bytes);
  if (!isPdf(data)) return { ok: false, error: '这不是 PDF 文件。' };
  let document;
  try {
    const task = pdfjs.getDocument({
      data,
      cMapUrl: new URL('/vendor/pdfjs/cmaps/', window.location.href).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('/vendor/pdfjs/standard_fonts/', window.location.href).href,
      isEvalSupported: false,
      verbosity: 0,
    });
    document = await task.promise;
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter(item => item?.str).map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
    }));
    const parsed = parseInvoice(items);
    if (!parsed.ok) return parsed;
    return { ok: true, invoice: parsed.invoice, pageCount: document.numPages };
  } catch (error) {
    if (error?.name === 'PasswordException') return { ok: false, error: '这份 PDF 有打开密码，首版不能读取。' };
    return { ok: false, error: '无法读取这份 PDF。' };
  } finally {
    await document?.loadingTask?.destroy?.();
  }
}
