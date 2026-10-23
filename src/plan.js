import { renderFilename, validateTemplate } from './filename.js';

function nameKey(filename) {
  return filename.normalize('NFC').toLocaleLowerCase('en-US');
}

export function planArchive(rows, template) {
  const check = validateTemplate(template);
  if (!check.ok) return { ok: false, error: check.error, files: [] };
  const used = new Set();
  const numbers = new Set();
  const files = rows.map(row => {
    if (!row.invoice) return { id: row.id, filename: null, error: row.error || '无法识别。', adjusted: false };
    if (numbers.has(row.invoice.number)) return { id: row.id, filename: null, error: '同一发票号码重复，未重复归档。', adjusted: false };
    numbers.add(row.invoice.number);
    let filename;
    try {
      filename = renderFilename(row.invoice, template);
    } catch (error) {
      return { id: row.id, filename: null, error: error.message, adjusted: false };
    }
    let adjusted = false;
    if (used.has(nameKey(filename))) {
      const suffixed = filename.replace(/\.pdf$/iu, `_${row.invoice.number}.pdf`);
      if (template.includes('{number}') || used.has(nameKey(suffixed)) || new TextEncoder().encode(suffixed).length > 180) {
        return { id: row.id, filename: null, error: '归档文件名冲突。', adjusted: false };
      }
      filename = suffixed;
      adjusted = true;
    }
    used.add(nameKey(filename));
    return { id: row.id, filename, error: null, adjusted };
  });
  return { ok: true, files };
}
