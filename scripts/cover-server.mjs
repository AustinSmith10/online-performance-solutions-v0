import { createServer } from 'http';
import { readFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'lib', 'documents', 'cover.html');

const server = createServer((req, res) => {
  readFile(FILE, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(7788, () => {
  console.log('Cover preview server running on http://localhost:7788');
});
