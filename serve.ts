// Tiny static server for local playtesting: serves game/ on localhost.
// Usage: node serve.ts [--port 8080]  (default port 8080)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const flagIdx = process.argv.indexOf('--port');
const port = (flagIdx >= 0 && process.argv[flagIdx + 1]
  ? Number(process.argv[flagIdx + 1])
  : Number(process.env.PORT || 8080));
const root = join(process.cwd(), 'game');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(req.url?.split('?')[0] || '/'));
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, () => console.log(`CROSSYARD dev server: http://localhost:${port}/`));
