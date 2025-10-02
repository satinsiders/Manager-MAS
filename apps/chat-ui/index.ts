import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { readFile } from 'fs/promises';
import { join } from 'path';

const loginHtml = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MAS Tutor Console - Sign In</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body class="page login-page" data-page="login">
    <div class="atmosphere" aria-hidden="true">
      <div class="atmosphere-orb orb-one"></div>
      <div class="atmosphere-orb orb-two"></div>
      <div class="grid"></div>
    </div>
    <header class="chrome">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true">MA</span>
        <div class="brand-copy">
          <p class="brand-title">MAS Tutor Console</p>
          <p class="brand-subtitle">Mission assistant for educators</p>
        </div>
      </div>
      <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">
        <span class="theme-toggle-icon" aria-hidden="true"></span>
        <span class="theme-toggle-text">Appearance</span>
      </button>
    </header>
    <main class="login-shell">
      <section class="login-hero">
        <p class="pill">Tutor Intelligence</p>
        <h1 class="hero-title">Craft sharper lessons with an assistant that knows your roster.</h1>
        <p class="hero-lede">
          MAS keeps cohorts, pacing, and interventions in one calm workspace so you can focus on teaching with confidence.
        </p>
        <ul class="hero-points">
          <li><strong>See impact instantly.</strong> Pull student signals, curriculum progress, and schedules without leaving the console.</li>
          <li><strong>Guide every action.</strong> Natural prompts trigger safe automations you can review before they ship.</li>
          <li><strong>Stay in sync.</strong> Session history, resources, and notes carry across your team in real time.</li>
        </ul>
      </section>
      <section class="login-card" aria-label="Sign in panel">
        <form id="login-form" class="form-card" novalidate>
          <div class="form-header">
            <h2>Welcome back, tutor</h2>
            <p id="login-message">Sign in with your platform credentials to open the assistant.</p>
          </div>
          <label class="form-label" for="login-email">Email</label>
          <input id="login-email" type="email" autocomplete="username" required />
          <label class="form-label" for="login-password">Password</label>
          <input id="login-password" type="password" autocomplete="current-password" required />
          <button id="login-submit" type="submit">Enter workspace</button>
          <p id="login-error" class="form-error" role="alert"></p>
        </form>
        <div class="form-meta">
          <p class="meta-title">Need access?</p>
          <p class="meta-body">Ask your admin to invite you to the MAS tutor program to enable secure login.</p>
        </div>
      </section>
    </main>
    <footer class="footer">
      <p>MAS keeps your data encrypted in-session and never stores transcripts without consent.</p>
    </footer>
    <script type="module" src="/static/login.js"></script>
  </body>
</html>`;

const chatHtml = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MAS Tutor Console - Session</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body class="page chat-page" data-page="chat">
    <div class="atmosphere" aria-hidden="true">
      <div class="atmosphere-orb orb-one"></div>
      <div class="atmosphere-orb orb-two"></div>
      <div class="grid"></div>
    </div>
    <header class="chrome chat-chrome">
      <div class="brand">
        <span class="brand-icon" aria-hidden="true">MA</span>
        <div class="brand-copy">
          <p class="brand-title">MAS Tutor Console</p>
          <p class="brand-subtitle">Lesson intelligence</p>
        </div>
      </div>
      <div class="chrome-actions">
        <button id="theme-toggle" class="theme-toggle" type="button" aria-label="Toggle theme">
          <span class="theme-toggle-icon" aria-hidden="true"></span>
          <span class="theme-toggle-text">Appearance</span>
        </button>
        <div class="user-controls">
          <span class="user-email" id="session-email">Tutor</span>
          <button id="logout" type="button" class="ghost-button">Sign out</button>
        </div>
      </div>
    </header>
    <main class="chat-shell">
      <aside class="context-panel" aria-label="Session insights">
        <h2>Session insights</h2>
        <p>Use the assistant to plan lessons, analyze student performance, or launch platform automations without leaving the console.</p>
        <ul class="insight-list">
          <li><strong>Curriculum pulse.</strong> Ask for pacing guidance, remediation steps, and course unlocks tailored to your roster.</li>
          <li><strong>Student snapshots.</strong> Surface strengths, flags, and recent activity to prep for upcoming meetings.</li>
          <li><strong>Actionable automations.</strong> Trigger schedule changes or resource drops with human-in-the-loop confirmations.</li>
        </ul>
        <div class="status-card">
          <div class="status-pill">Live session</div>
          <p class="status-heading">Connected to MAS Platform</p>
          <p class="status-copy">Conversations remain ephemeral and scoped to your current tutor account.</p>
        </div>
      </aside>
      <section class="conversation-panel" aria-label="Assistant conversation">
        <div class="panel-header">
          <div class="status-cluster">
            <span class="status-dot" id="status-dot" aria-hidden="true"></span>
            <div class="status-text">
              <p class="status-title">Mission Assistant</p>
              <p id="status-text" class="status-subtitle">Ready</p>
            </div>
          </div>
          <div class="panel-actions">
            <button id="reset-chat" type="button" class="ghost-button">Start new thread</button>
          </div>
        </div>
        <div id="transcript" class="transcript" aria-live="polite"></div>
        <form id="composer" class="composer" autocomplete="off">
          <label class="sr-only" for="input">Ask the assistant</label>
          <div class="composer-surface">
            <textarea
              id="input"
              placeholder="Plan tomorrow's lesson, request resources, or prepare a student briefing..."
              rows="1"
              required
            ></textarea>
            <div class="composer-toolbar">
              <button id="stop" type="button" class="ghost-button hidden">
                <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
                  <rect x="3" y="3" width="10" height="10" rx="2"></rect>
                </svg>
                Stop
              </button>
              <button id="send" type="submit" disabled>Send</button>
            </div>
          </div>
        </form>
      </section>
    </main>
    <footer class="footer">
      <p>Tutors stay in control: every automation surfaces status updates and can be rolled back instantly.</p>
    </footer>
    <script type="module" src="/static/chat-ui.js"></script>
  </body>
</html>`;

function resolvePath(url?: string | null): string {
  if (!url) return '/';
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.pathname || '/';
  } catch (err) {
    return '/';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  if (req.url?.startsWith('/static/')) {
    const staticPath = join(process.cwd(), 'apps/chat-ui/static');
    const filePath = join(staticPath, req.url.replace('/static/', ''));
    const mimeType = filePath.endsWith('.css')
      ? 'text/css'
      : filePath.endsWith('.js')
      ? 'application/javascript'
      : 'application/octet-stream';
    try {
      const content = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.end(content);
    } catch (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'file_not_found' }));
    }
    return;
  }

  const path = resolvePath(req.url);
  const pageHtml = path === '/chat' ? chatHtml : loginHtml;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(pageHtml);
}
