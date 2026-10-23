import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = new URL('../', import.meta.url);
const pdfjsRoot = realpathSync(fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url)));
const staticAssets = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/extract.js', ['web/extract.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']],
  ['/src/invoice.js', ['src/invoice.js', 'text/javascript; charset=utf-8']],
  ['/src/filename.js', ['src/filename.js', 'text/javascript; charset=utf-8']],
  ['/src/plan.js', ['src/plan.js', 'text/javascript; charset=utf-8']],
  ['/src/zip.js', ['src/zip.js', 'text/javascript; charset=utf-8']],
  ['/src/limits.js', ['src/limits.js', 'text/javascript; charset=utf-8']],
  ['/src/pdf-bytes.js', ['src/pdf-bytes.js', 'text/javascript; charset=utf-8']],
  ['/examples/stationery.pdf', ['examples/stationery.pdf', 'application/pdf']],
  ['/examples/coffee.pdf', ['examples/coffee.pdf', 'application/pdf']],
  ['/examples/notes.pdf', ['examples/notes.pdf', 'application/pdf']],
  ['/examples/scan.pdf', ['examples/scan.pdf', 'application/pdf']],
  ['/SECURITY.md', ['SECURITY.md', 'text/plain; charset=utf-8']],
  ['/DISCLAIMER.md', ['DISCLAIMER.md', 'text/plain; charset=utf-8']],
]);
const vendorPrefixes = new Set(['build', 'cmaps', 'standard_fonts', 'wasm', 'iccs']);
const vendorTypes = new Map([
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.bcmap', 'application/octet-stream'],
  ['.pfb', 'application/octet-stream'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.wasm', 'application/wasm'],
  ['.icc', 'application/octet-stream'],
]);

export function vendorPath(pathname) {
  if (!pathname.startsWith('/vendor/pdfjs/')) return null;
  const relative = pathname.slice('/vendor/pdfjs/'.length);
  if (!relative || relative.includes('..') || relative.includes('\\') || relative.includes('\0')) return null;
  const [prefix] = relative.split('/');
  const type = vendorTypes.get(extname(relative).toLowerCase());
  if (!vendorPrefixes.has(prefix) || !type) return null;
  const full = resolve(pdfjsRoot, relative);
  if (full !== pdfjsRoot && !full.startsWith(`${pdfjsRoot}${sep}`)) return null;
  return { full, type };
}

export function createAppServer() {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self' blob:; img-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const port = server.address()?.port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (port === 80) {
      hosts.add('127.0.0.1');
      hosts.add('localhost');
    }
    const host = request.headers.host?.toLowerCase();
    const origin = request.headers.origin;
    if (!hosts.has(host)
      || (origin !== undefined && ![...hosts].some(entry => origin === `http://${entry}`))
      || request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403);
      response.end('Only local same-origin requests are allowed');
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }
    const asset = staticAssets.get(pathname);
    try {
      if (asset) {
        const data = await readFile(new URL(asset[0], root));
        response.writeHead(200, { 'Content-Type': asset[1] });
        response.end(request.method === 'HEAD' ? undefined : data);
        return;
      }
      const vendor = vendorPath(pathname);
      if (!vendor) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      const real = await realpath(vendor.full);
      if (real !== pdfjsRoot && !real.startsWith(`${pdfjsRoot}${sep}`)) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      const data = await readFile(real);
      response.writeHead(200, { 'Content-Type': vendor.type });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { values } = parseArgs({ options: { port: { type: 'string', default: '4176' } } });
    const port = Number(values.port);
    if (!/^\d+$/u.test(values.port) || port < 1 || port > 65535) throw new Error('端口需为 1–65535 的整数。');
    const server = createAppServer();
    server.on('error', error => {
      console.error(`启动失败：${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Receipt Archive: http://127.0.0.1:${port}\n发票只在本机浏览器里读取。按 Ctrl+C 停止。`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
