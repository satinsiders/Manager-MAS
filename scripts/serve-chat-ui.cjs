const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3456;
const APP_ROOT = path.join(__dirname, '..', 'apps', 'chat-ui');
const SRC = path.join(APP_ROOT, 'index.ts');

// Extract HTML template from index.ts
function extractHtml(src) {
  const m = src.match(/const html = `([\s\S]*?)`;/);
  return m ? m[1] : null;
}

// Read and extract HTML template
const src = fs.readFileSync(SRC, 'utf8');
const html = extractHtml(src) || '<html><body><h1>chat-ui html not found</h1></body></html>';

// Serve static files from chat-ui/static
async function serveStaticFile(filePath, mimeType, res) {
  try {
    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }
}

const server = http.createServer(async (req, res) => {
  // Serve index
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Serve static files
  if (req.method === 'GET' && req.url?.startsWith('/static/')) {
    const filePath = path.join(APP_ROOT, req.url);
    const ext = path.extname(filePath);
    const mimeType = {
      '.css': 'text/css',
      '.js': 'application/javascript',
    }[ext] || 'application/octet-stream';
    await serveStaticFile(filePath, mimeType, res);
    return;
  }

  // Mock API endpoint
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      });

      // Send test responses with streaming simulation
      res.write(JSON.stringify({ type: 'assistant_delta', outputIndex: 0, delta: 'Hello! ' }) + '\n');
      setTimeout(() => {
        res.write(JSON.stringify({ type: 'assistant_delta', outputIndex: 0, delta: 'I am the ' }) + '\n');
      }, 120);
      setTimeout(() => {
        res.write(JSON.stringify({ type: 'assistant_delta', outputIndex: 0, delta: 'MAS assistant. ' }) + '\n');
      }, 240);
      setTimeout(() => {
        res.write(JSON.stringify({ type: 'assistant_message', outputIndex: 0, content: 'Hello! I am the MAS assistant. How can I help you?' }) + '\n');
      }, 360);
      setTimeout(() => {
        res.write(JSON.stringify({ type: 'done' }) + '\n');
        res.end();
      }, 400);
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

// Start server with graceful shutdown
server.listen(PORT, () => {
  console.log(`Chat UI development server running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
