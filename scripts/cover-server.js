const http = require('http');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'lib', 'documents', 'cover.html');

const server = http.createServer((req, res) => {
  fs.readFile(FILE, (err, data) => {
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
