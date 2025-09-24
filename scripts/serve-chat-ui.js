import http from 'http';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps', 'chat-ui', 'index.ts');
const PORT = process.env.PORT || 3456;

function extractHtml(src) {
  const m = src.match(/const html = `([\s\S]*?)`;/);
  return m ? m[1] : null;
}

const src = fs.readFileSync(SRC, 'utf8');
const html = extractHtml(src) || '<html><body><h1>chat-ui html not found</h1></body></html>';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    // simple streaming emulation: send a few JSON lines
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    // send initial delta
    res.write(JSON.stringify({ type: 'assistant_delta', outputIndex: 0, delta: 'Hello ' }) + '\n');
    setTimeout(() => {
      res.write(JSON.stringify({ type: 'assistant_delta', outputIndex: 0, delta: 'world' }) + '\n');
    }, 120);
    setTimeout(() => {
      res.write(JSON.stringify({ type: 'assistant_message', outputIndex: 0, content: 'Hello world' }) + '\n');
    }, 240);
    setTimeout(() => {
      res.write(JSON.stringify({ type: 'done' }) + '\n');
      res.end();
    }, 320);

    return;
  }

  // fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, () => {
  console.log(`Chat UI dev server listening on http://localhost:${PORT}`);
});

// graceful shutdown
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
