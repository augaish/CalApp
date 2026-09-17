import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/user/CalApp/dist';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2' };
http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(ROOT, url);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    const html = path.join(ROOT, url.replace(/\/$/, '') + '.html');
    f = fs.existsSync(html) ? html : path.join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8099, '127.0.0.1', () => console.log('serving on 8099'));
