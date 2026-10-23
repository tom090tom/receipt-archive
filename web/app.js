import { DEFAULT_TEMPLATE, validateTemplate } from '/src/filename.js';
import { LIMITS } from '/src/limits.js';
import { planArchive } from '/src/plan.js';
import { createZip } from '/src/zip.js';
import { extractInvoice } from '/extract.js';

const STORAGE_KEY = 'receipt-archive.template.v1';
const DEMO = [
  ['/examples/stationery.pdf', 'stationery.pdf'],
  ['/examples/coffee.pdf', 'coffee.pdf'],
  ['/examples/notes.pdf', 'notes.pdf'],
  ['/examples/scan.pdf', 'scan.pdf'],
];

const statusNode = document.querySelector('#status');
const templateInput = document.querySelector('#template');
const ledgerNode = document.querySelector('#ledger');
const downloadButton = document.querySelector('#download');
const folderButton = document.querySelector('#save-folder');
const state = { files: [], busy: false };

function say(message) {
  statusNode.textContent = message;
}

function savedTemplate() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && validateTemplate(value).ok ? value : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

function currentTemplate() {
  return validateTemplate(templateInput.value);
}

function money(amount) {
  return `¥${amount}`;
}

function render() {
  const template = currentTemplate();
  const plan = template.ok ? planArchive(state.files, template.template) : { ok: false, error: template.error, files: [] };
  const named = new Map(plan.files.map(file => [file.id, file]));
  const ready = state.files.filter(file => named.get(file.id)?.filename);
  ledgerNode.replaceChildren();
  if (state.files.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '还没有文件。加载示例可以一次看到可归档、未识别和扫描件。';
    ledgerNode.append(empty);
  }
  for (const file of state.files) {
    const planned = named.get(file.id);
    const article = document.createElement('article');
    article.className = planned?.filename ? 'entry ready' : 'entry blocked';
    const head = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = file.sourceName;
    const pill = document.createElement('p');
    pill.className = 'pill';
    pill.textContent = planned?.filename ? (planned.adjusted ? '已避免重名' : '可归档') : '未归档';
    head.append(title, pill);
    const facts = document.createElement('dl');
    for (const [term, value] of [
      ['日期', file.invoice?.date ?? '—'],
      ['销售方', file.invoice?.seller ?? '—'],
      ['价税合计', file.invoice ? money(file.invoice.amount) : '—'],
      ['发票号码', file.invoice?.number ?? '—'],
    ]) {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      wrap.append(dt, dd);
      facts.append(wrap);
    }
    const outcome = document.createElement('p');
    outcome.className = 'outcome';
    if (planned?.filename) {
      outcome.textContent = planned.adjusted ? `${planned.filename}（同名时已加上发票号码）` : planned.filename;
    } else {
      outcome.textContent = planned?.error || file.error || plan.error || '无法命名。';
    }
    if (file.pageCount > 1 && file.invoice) {
      const note = document.createElement('p');
      note.className = 'page-note';
      note.textContent = '这份 PDF 有多页，只读取了第 1 页。';
      article.append(head, facts, outcome, note);
    } else article.append(head, facts, outcome);
    ledgerNode.append(article);
  }
  const preview = document.querySelector('#template-preview');
  preview.textContent = template.ok
    ? (ready[0]?.invoice ? `预览：${named.get(ready[0].id).filename}` : '规则有效。放入发票后会立即预览文件名。')
    : template.error;
  const recognized = state.files.filter(file => file.invoice).length;
  const blocked = state.files.length - recognized;
  document.querySelector('#source-count').textContent = state.files.length === 0
    ? '尚未选择文件'
    : `${state.files.length} 个文件`;
  document.querySelector('#ledger-summary').textContent = state.files.length === 0
    ? '识别完成后，在这里核对每一张。'
    : `${ready.length} 份可归档${blocked ? `，${blocked} 份未归档` : ''}。ZIP 里是原文件的副本。`;
  downloadButton.disabled = state.busy || ready.length === 0;
  downloadButton.textContent = ready.length ? `下载 ${ready.length} 份 ZIP` : '下载 ZIP';
  folderButton.disabled = state.busy || ready.length === 0;
  folderButton.hidden = typeof window.showDirectoryPicker !== 'function';
}

async function recognize(sourceName, bytes) {
  if (bytes.byteLength > LIMITS.maxFileBytes) return { sourceName, bytes, invoice: null, error: '单个 PDF 超过 8 MiB。' };
  const recognized = await extractInvoice(bytes);
  return {
    sourceName,
    bytes,
    invoice: recognized.ok ? recognized.invoice : null,
    error: recognized.ok ? null : recognized.error,
    pageCount: recognized.pageCount ?? null,
  };
}

async function setFiles(entries) {
  if (state.busy) return;
  if (entries.length > LIMITS.maxFiles) {
    say(`一次最多 ${LIMITS.maxFiles} 个 PDF。`);
    return;
  }
  const total = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  if (total > LIMITS.maxTotalBytes) {
    say('这批 PDF 合计超过 40 MiB。');
    return;
  }
  state.busy = true;
  state.files = [];
  render();
  const files = [];
  for (const [index, entry] of entries.entries()) {
    say(`正在读取 ${index + 1} / ${entries.length}：${entry.sourceName}`);
    const file = await recognize(entry.sourceName, entry.bytes);
    file.id = String(index);
    files.push(file);
    state.files = [...files];
    render();
  }
  state.busy = false;
  const ready = files.filter(file => file.invoice).length;
  say(files.length === 0 ? '没有读到文件。' : `读完 ${files.length} 个文件，${ready} 个可以归档。请核对后再下载。`);
  render();
}

async function loadDemo() {
  say('正在读取内置示例。');
  const entries = [];
  for (const [url, sourceName] of DEMO) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('示例加载失败');
    entries.push({ sourceName, bytes: new Uint8Array(await response.arrayBuffer()) });
  }
  await setFiles(entries);
}

document.querySelector('#demo').addEventListener('click', () => {
  loadDemo().catch(() => say('示例没有加载成功。请确认用 npm start 打开本页。'));
});

document.querySelector('#files').addEventListener('change', async event => {
  const selected = [...event.target.files];
  event.target.value = '';
  if (selected.length === 0) return;
  say('正在读取选择的 PDF。');
  const entries = [];
  for (const file of selected) entries.push({ sourceName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  await setFiles(entries);
});

document.querySelector('#clear').addEventListener('click', () => {
  state.files = [];
  say('已清空。文件没有被上传，也不会留在页面之外。');
  render();
});

templateInput.addEventListener('input', render);
document.querySelectorAll('[data-token]').forEach(button => {
  button.addEventListener('click', () => {
    const token = button.dataset.token;
    const start = templateInput.selectionStart ?? templateInput.value.length;
    const end = templateInput.selectionEnd ?? start;
    const next = `${templateInput.value.slice(0, start)}${token}${templateInput.value.slice(end)}`;
    if (next.length > 80) {
      say('命名规则最多 80 个字符。');
      return;
    }
    templateInput.value = next;
    templateInput.focus();
    render();
  });
});

document.querySelector('#save-rule').addEventListener('click', () => {
  const template = currentTemplate();
  if (!template.ok) {
    say(template.error);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, template.template);
    document.querySelector('#saved-state').textContent = '已保存在这台浏览器';
  } catch {
    say('这台浏览器没有允许本地保存。');
  }
});

document.querySelector('#reset-rule').addEventListener('click', () => {
  templateInput.value = DEFAULT_TEMPLATE;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* 保留当前输入即可。 */ }
  document.querySelector('#saved-state').textContent = '已恢复默认规则';
  render();
});

downloadButton.addEventListener('click', () => {
  const template = currentTemplate();
  if (!template.ok) return;
  const plan = planArchive(state.files, template.template);
  const entries = state.files.flatMap(file => {
    const named = plan.files.find(entry => entry.id === file.id && entry.filename);
    return named ? [{ name: named.filename, data: file.bytes }] : [];
  });
  if (entries.length === 0) return;
  try {
    const blob = new Blob([createZip(entries)], { type: 'application/zip' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '报销归档.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    say(`已下载 ${entries.length} 份原文件副本。请打开 ZIP 再确认一遍。`);
  } catch {
    say('没能打包。请检查命名规则后再试。');
  }
});

folderButton.addEventListener('click', async () => {
  const template = currentTemplate();
  if (!template.ok || !window.showDirectoryPicker) return;
  let directory;
  try {
    directory = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (error) {
    if (error?.name !== 'AbortError') say('没有获得文件夹写入权限。');
    return;
  }
  const plan = planArchive(state.files, template.template);
  let saved = 0;
  let skipped = 0;
  for (const file of state.files) {
    const named = plan.files.find(entry => entry.id === file.id && entry.filename);
    if (!named) continue;
    try {
      await directory.getFileHandle(named.filename);
      skipped += 1;
      continue;
    } catch { /* 不存在时再创建。 */ }
    try {
      const handle = await directory.getFileHandle(named.filename, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.bytes);
      await writable.close();
      saved += 1;
    } catch {
      skipped += 1;
    }
  }
  say(`已复制 ${saved} 份到所选文件夹${skipped ? `，${skipped} 份未写入` : ''}。已有同名文件不会被覆盖。`);
});

templateInput.value = savedTemplate();
if (templateInput.value !== DEFAULT_TEMPLATE) document.querySelector('#saved-state').textContent = '已使用上次保存的规则';
render();
