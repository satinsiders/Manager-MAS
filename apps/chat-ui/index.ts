import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { readFile } from 'fs/promises';
import { join } from 'path';

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manager MAS – Conversational Console</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <div class="shell">
      <header class="masthead">
        <h1>Manager MAS - Conversational Console</h1>
        <p>
          Talk to the MAS mission assistant. Ask about students, curricula, dispatches, or schedule updates.
          Responses stream live from GPT-5 while platform API work stays behind the scenes.
        </p>
      </header>

      <section id="auth-panel" class="auth-panel hidden" aria-label="Teacher login">
        <div class="auth-card">
          <h2>Teacher Login</h2>
          <p id="login-message" class="auth-message">
            Sign in with your SuperfastSAT teacher credentials to unlock the assistant.
          </p>
          <form id="login-form" class="auth-form">
            <label for="login-email">Email</label>
            <input id="login-email" type="email" autocomplete="username" required />
            <label for="login-password">Password</label>
            <input id="login-password" type="password" autocomplete="current-password" required />
            <button type="submit" id="login-submit">Sign In</button>
          </form>
          <p id="login-error" class="auth-error" role="alert"></p>
        </div>
      </section>

      <section id="chat-panel" class="chat-panel hidden" aria-label="MAS assistant chat">
        <div class="session-strip">
          <div>
            <span class="session-label">Signed in as</span>
            <span id="session-email" class="session-email"></span>
          </div>
          <div class="session-actions">
            <button type="button" id="logout">Log Out</button>
          </div>
        </div>
        <div class="status-strip">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Ready</span>
        </div>
        <div class="reset-strip">
          <button type="button" id="reset-chat">Start New Chat</button>
        </div>
        <div id="transcript" class="transcript" aria-live="polite"></div>
        <form id="composer" class="composer">
          <textarea id="input" placeholder="Ask about a student, curriculum, or dispatch plan…" autocomplete="off"></textarea>
          <div class="button-group">
            <button id="stop" type="button" class="stop-button" style="display: none">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <rect x="3" y="3" width="10" height="10" />
              </svg>
              Stop
            </button>
            <button id="send" type="submit" disabled>Send</button>
          </div>
        </form>
      </section>
    </div>

    <script src="/static/chat-ui.js"></script>
  </body>
</html>`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  // Serve static files
  if (req.url?.startsWith('/static/')) {
    const staticPath = join(process.cwd(), 'apps/chat-ui/static');
    const filePath = join(staticPath, req.url.replace('/static/', ''));
    const mimeType = filePath.endsWith('.css') ? 'text/css' : 'application/javascript';
    try {
      const content = await readFile(filePath);
      res.setHeader('Content-Type', mimeType);
      res.statusCode = 200;
      res.end(content);
    } catch (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'file_not_found' }));
    }
    return;
  }

  // Serve main HTML
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}
