import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(process.env.GIQ_APP_ROOT || resolve(TOOLS_DIR, '..', 'dist'));
export const APP_ENTRY_PATH = resolve(APP_ROOT, 'index.html');

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function serveApp() {
  if (!existsSync(APP_ENTRY_PATH)) {
    throw new Error(`Vite app entry is missing: ${APP_ENTRY_PATH}. Run npm run build first.`);
  }

  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(APP_ROOT, relative);
      const insideRoot = file === APP_ROOT || file.startsWith(`${APP_ROOT}${sep}`);
      if (!insideRoot || !existsSync(file) || !statSync(file).isFile()) {
        if (process.env.GIQ_APP_SERVER_DEBUG) console.error(`[app-entry] 404 ${requestUrl.pathname}`);
        response.writeHead(404).end('Not found');
        return;
      }

      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] || 'application/octet-stream');
      if (request.method === 'HEAD') {
        response.writeHead(200).end();
        return;
      }
      createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });

  return new Promise((resolveUrl, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      const address = server.address();
      resolveUrl(`http://127.0.0.1:${address.port}/index.html`);
    });
  });
}

export const APP_URL = process.env.GIQ_APP_URL || process.env.FFA_STUDY_URL || await serveApp();
