import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises';
import { basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { constants } from 'node:fs';
import { DEFAULT_TEMPLATE } from '../src/filename.js';
import { LIMITS } from '../src/limits.js';
import { readInvoicePdf } from '../src/pdf-text.js';
import { planArchive } from '../src/plan.js';

function help() {
  console.log(`用法：node bin/receipt-archive.js <发票.pdf...> [--template 规则] [--out 目录] [--json]

按日期、销售方和价税合计给可复制文字的数电发票命名。
默认规则：${DEFAULT_TEMPLATE}
加上 --out 时复制原文件，不覆盖已有文件，也不修改原件。`);
}

function inside(directory, filename) {
  const root = resolve(directory);
  const destination = resolve(root, filename);
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return destination.startsWith(prefix) ? destination : '';
}

export async function archiveFiles(paths, { template = DEFAULT_TEMPLATE, out = '' } = {}) {
  if (paths.length < 1 || paths.length > LIMITS.maxFiles) return { exitCode: 2, error: `一次处理 1–${LIMITS.maxFiles} 个文件。` };
  const loaded = [];
  let total = 0;
  for (const [index, file] of paths.entries()) {
    let info;
    try {
      info = await lstat(file);
    } catch {
      loaded.push({ id: String(index), source: file, invoice: null, error: '找不到文件。', bytes: null });
      continue;
    }
    if (info.isSymbolicLink() || !info.isFile()) {
      loaded.push({ id: String(index), source: file, invoice: null, error: '只接受普通文件。', bytes: null });
      continue;
    }
    if (info.size > LIMITS.maxFileBytes) {
      loaded.push({ id: String(index), source: file, invoice: null, error: '单个 PDF 超过 8 MiB。', bytes: null });
      continue;
    }
    total += info.size;
    if (total > LIMITS.maxTotalBytes) return { exitCode: 2, error: '这批 PDF 合计超过 40 MiB。' };
    const bytes = new Uint8Array(await readFile(file));
    const recognized = await readInvoicePdf(bytes);
    loaded.push({
      id: String(index),
      source: file,
      invoice: recognized.ok ? recognized.invoice : null,
      error: recognized.ok ? null : recognized.error,
      pageCount: recognized.pageCount ?? null,
      bytes,
    });
  }
  const plan = planArchive(loaded, template);
  if (!plan.ok) return { exitCode: 2, error: plan.error };
  const files = [];
  for (const item of loaded) {
    const named = plan.files.find(entry => entry.id === item.id);
    const record = {
      source: basename(item.source),
      ok: Boolean(named?.filename),
      filename: named?.filename ?? null,
      adjusted: named?.adjusted ?? false,
      error: named?.error ?? null,
      invoice: item.invoice,
      pageCount: item.pageCount,
    };
    if (out && named?.filename) {
      const destination = inside(out, named.filename);
      if (!destination) record.error = '归档路径无效。';
      else {
        try {
          await mkdir(out, { recursive: true });
          await copyFile(item.source, destination, constants.COPYFILE_EXCL);
          record.copiedTo = destination;
        } catch (error) {
          record.ok = false;
          record.error = error?.code === 'EEXIST' ? '目标目录里已有同名文件，未覆盖。' : '无法复制到目标目录。';
        }
      }
      if (record.error) record.ok = false;
    }
    files.push(record);
  }
  const failed = files.some(file => !file.ok);
  return { exitCode: failed ? 1 : 0, template, files };
}

function printHuman(result) {
  if (result.error) {
    console.error(result.error);
    return;
  }
  for (const file of result.files) {
    console.log(file.source);
    if (file.invoice) {
      const page = file.pageCount > 1 ? '（只读取第 1 页）' : '';
      console.log(`  ${file.invoice.date}  ${file.invoice.seller}  ${file.invoice.amount}${page}`);
    }
    console.log(file.ok ? `  -> ${file.filename}${file.adjusted ? '（已加发票号码以避免重名）' : ''}` : `  ${file.error}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        template: { type: 'string', default: DEFAULT_TEMPLATE },
        out: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
    if (values.help) {
      help();
    } else {
      const result = await archiveFiles(positionals, values);
      if (values.json) {
        if (result.error) console.error(result.error);
        else console.log(JSON.stringify({ template: result.template, files: result.files.map(({ copiedTo, ...file }) => file) }, null, 2));
      } else printHuman(result);
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    console.error(error?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? '不能识别的参数。' : '参数无效。');
    process.exitCode = 2;
  }
}
