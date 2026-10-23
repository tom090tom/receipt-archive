import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import { createAppServer } from '../bin/server.js';

function send(port, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the local app and PDF.js assets, and refuses other requests', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const page = await send(port, '/');
    assert.equal(page.status, 200);
    assert.match(page.body.toString('utf8'), /哪天、付给谁、多少钱/);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);

    const worker = await send(port, '/vendor/pdfjs/build/pdf.worker.mjs');
    assert.equal(worker.status, 200);
    assert.match(worker.headers['content-type'], /javascript/);

    const sample = await send(port, '/examples/stationery.pdf');
    assert.equal(sample.status, 200);
    assert.equal(sample.body.subarray(0, 5).toString(), '%PDF-');

    assert.equal((await send(port, '/vendor/pdfjs/../../package.json')).status, 404);
    assert.equal((await send(port, '/vendor/pdfjs/package.json')).status, 404);
    assert.equal((await send(port, '/secret')).status, 404);
    assert.equal((await send(port, '/', { method: 'POST' })).status, 405);
    assert.equal((await send(port, '/', { headers: { host: 'evil.test' } })).status, 403);
    assert.equal((await send(port, '/', { headers: { host: `127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site' } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
