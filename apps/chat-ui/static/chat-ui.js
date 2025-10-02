import { initThemeControls, storeLoginAlert } from './theme.js';

initThemeControls();

const supportsTextDecoder = typeof TextDecoder !== 'undefined';
const decoder = supportsTextDecoder ? new TextDecoder() : null;

const LOGIN_REDIRECT_MESSAGE = 'Session ended. Please sign in again.';
const HIDDEN_CLASS = 'hidden';

/** @type {{ role: 'user' | 'assistant'; content: string; }[]} */
let dialogue = [];
let busy = false;

/** @type {Map<number, { bubble: HTMLElement; body: HTMLElement; text: string; }>} */
const assistantStreams = new Map();
/** @type {{ bubble: HTMLElement; body: HTMLElement; text: string; } | null} */
let assistantPlaceholder = null;
/** @type {Map<string, { bubble: HTMLElement; body: HTMLElement; operation: string; }>} */
const toolBubbles = new Map();

const transcript = document.getElementById('transcript');
const form = document.getElementById('composer');
const textarea = document.getElementById('input');
const sendButton = document.getElementById('send');
const stopButton = document.getElementById('stop');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const resetButton = document.getElementById('reset-chat');
const logoutButton = document.getElementById('logout');
const sessionEmail = document.getElementById('session-email');
const pageShell = document.body;

const sendDefaultText = sendButton ? sendButton.textContent || 'Send' : 'Send';

const defaultSessionState = { loggedIn: false, mode: 'interactive', email: null };
let sessionState = { ...defaultSessionState };
let previousSessionLoggedIn = false;

if (!transcript || !form || !textarea || !sendButton || !stopButton || !statusText || !statusDot || !resetButton) {
  throw new Error('Chat UI failed to initialise: missing required elements.');
}

function autoSizeTextarea() {
  textarea.style.height = 'auto';
  const maxHeight = 240;
  const minHeight = 64;
  const next = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = next + 'px';
}

function scrollToBottom() {
  window.requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function refreshStatusLabel() {
  if (busy) {
    statusText.textContent = 'Synthesizing insight...';
  } else {
    statusText.textContent = sessionState.loggedIn ? 'Ready for your next prompt' : 'Reconnecting...';
  }
}

function updateSendState() {
  const hasContent = textarea.value.trim().length > 0;
  sendButton.disabled = busy || !sessionState.loggedIn || !hasContent || textarea.disabled;
  if (pageShell) {
    pageShell.classList.toggle('composer-has-text', hasContent);
  }
}

function setBusy(isBusy) {
  busy = isBusy;
  if (pageShell) {
    pageShell.classList.toggle('is-busy', isBusy);
  }
  if (statusDot) {
    statusDot.classList.toggle('busy', isBusy);
  }
  sendButton.textContent = isBusy ? 'Sending...' : sendDefaultText;
  refreshStatusLabel();
  updateSendState();
}

function setChatAvailability(enabled) {
  textarea.disabled = !enabled;
  if (!enabled) {
    textarea.value = '';
    if (pageShell) {
      pageShell.classList.remove('composer-has-text');
    }
  }
  textarea.placeholder = enabled
    ? "Plan tomorrow's lesson, request resources, or prep a student briefing..."
    : 'Reconnecting to MAS...';
  autoSizeTextarea();
  refreshStatusLabel();
  updateSendState();
}

function clearLoginRedirect(message) {
  storeLoginAlert(message || LOGIN_REDIRECT_MESSAGE);
  window.location.replace('/');
}

function clearAssistantPlaceholder() {
  if (assistantPlaceholder) {
    assistantPlaceholder.bubble.remove();
    assistantPlaceholder = null;
  }
}

function formatOperationName(operation) {
  return operation
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1).replace(/\.0$/, '') + 's';
}

function createChatBubble(role, options) {
  const bubble = document.createElement('article');
  bubble.className = 'bubble bubble-' + role;
  bubble.dataset.role = role;
  if (role === 'tool') {
    bubble.classList.add('bubble-tool');
  }
  if (options?.pending) {
    bubble.classList.add('bubble-pending');
  }
  if (Array.isArray(options?.classes)) {
    for (const klass of options.classes) {
      bubble.classList.add(klass);
    }
  }

  const header = document.createElement('p');
  header.className = 'bubble-meta';
  if (options?.label) {
    header.textContent = options.label;
  } else {
    header.textContent =
      role === 'user' ? 'You' : role === 'assistant' ? 'MAS Assistant' : 'Automation';
  }
  bubble.appendChild(header);

  const body = document.createElement('p');
  body.className = 'bubble-text';
  body.textContent = options?.initialText ?? '';
  bubble.appendChild(body);

  if (role === 'tool') {
    const statusLine = document.createElement('div');
    statusLine.className = 'status-line';
    bubble.appendChild(statusLine);
  }

  transcript.appendChild(bubble);
  bubble.classList.add('bubble-enter');
  window.requestAnimationFrame(() => {
    bubble.classList.add('bubble-enter-active');
    bubble.classList.remove('bubble-enter');
  });
  if (pageShell && (role !== 'assistant' || dialogue.length > 0)) {
    pageShell.classList.add('has-history');
  }
  scrollToBottom();
  return { bubble, body };
}

function createAssistantStream(initialText, pending) {
  const { bubble, body } = createChatBubble('assistant', {
    initialText: initialText ?? '',
    pending: pending !== false,
  });
  return { bubble, body, text: initialText ?? '' };
}

function getAssistantStream(outputIndex) {
  const index = typeof outputIndex === 'number' ? outputIndex : 0;
  let stream = assistantStreams.get(index);
  if (stream) {
    return stream;
  }
  if (assistantPlaceholder) {
    stream = assistantPlaceholder;
    assistantPlaceholder = null;
    stream.text = '';
    stream.body.textContent = '';
  } else {
    stream = createAssistantStream('', true);
  }
  if (!stream.bubble.classList.contains('bubble-pending')) {
    stream.bubble.classList.add('bubble-pending');
  }
  assistantStreams.set(index, stream);
  return stream;
}

function getToolBubble(callId, operation) {
  let entry = toolBubbles.get(callId);
  if (entry) return entry;
  const label = 'Tool - ' + formatOperationName(operation);
  const { bubble, body } = createChatBubble('tool', {
    label,
    initialText: formatOperationName(operation),
    pending: true,
    classes: ['bubble-tool-pending'],
  });
  entry = { bubble, body, operation };
  toolBubbles.set(callId, entry);
  updateToolStatus(bubble, body, 'initializing');
  return entry;
}

function updateToolStatus(bubble, body, status, details = '') {
  const statusLine = bubble.querySelector('.status-line');
  if (!statusLine) return;

  let statusTextValue = '';
  switch (status) {
    case 'initializing':
      statusTextValue = 'Preparing secure tunnel...';
      break;
    case 'connecting':
      statusTextValue = 'Linking data streams...';
      break;
    case 'fetching':
      statusTextValue = 'Retrieving live records...';
      break;
    case 'processing':
      statusTextValue = 'Shaping the response...';
      break;
    case 'success':
      statusTextValue = 'Automation complete';
      break;
    case 'error':
      statusTextValue = 'Automation failed';
      break;
    default:
      statusTextValue = status;
  }

  if (details) {
    statusTextValue += ` - ${details}`;
  }

  statusLine.textContent = statusTextValue;
  if (body && details && status === 'success') {
    body.dataset.duration = details;
  }
}

function handleAssistantDelta(event) {
  const stream = getAssistantStream(event.outputIndex);
  if (!event.delta) return;
  stream.text += event.delta;
  stream.body.textContent += event.delta;
}

function handleAssistantMessage(event) {
  const stream = getAssistantStream(event.outputIndex);
  stream.text = event.content ?? '';
  stream.body.textContent = stream.text;
  stream.bubble.classList.remove('bubble-pending');
  assistantStreams.delete(typeof event.outputIndex === 'number' ? event.outputIndex : 0);
  clearAssistantPlaceholder();
  if (stream.text.trim()) {
    dialogue.push({ role: 'assistant', content: stream.text });
  }
}

function handleToolStatus(event) {
  const entry = getToolBubble(event.callId, event.operation);
  const { bubble, body } = entry;

  bubble.classList.remove('bubble-tool-pending', 'bubble-tool-success', 'bubble-tool-error');

  switch (event.status) {
    case 'started':
      bubble.classList.add('bubble-tool-pending');
      updateToolStatus(bubble, body, 'connecting');
      setTimeout(() => {
        if (bubble.classList.contains('bubble-tool-pending')) {
          updateToolStatus(bubble, body, 'fetching');
          setTimeout(() => {
            if (bubble.classList.contains('bubble-tool-pending')) {
              updateToolStatus(bubble, body, 'processing');
            }
          }, 800);
        }
      }, 600);
      break;

    case 'succeeded':
      bubble.classList.add('bubble-tool-success');
      const duration = formatDuration(event.durationMs);
      body.textContent = event.message || formatOperationName(entry.operation);
      updateToolStatus(bubble, body, 'success', duration);
      break;

    case 'failed':
      bubble.classList.add('bubble-tool-error');
      console.error('Tool failed', event);
      body.textContent = event.message || 'Operation failed';
      updateToolStatus(bubble, body, 'error');
      break;
  }

  scrollToBottom();
}

function handleStreamError(messageOrEvent) {
  let text = 'We hit turbulence. Try again in a moment.';
  try {
    if (!messageOrEvent) {
      text = 'We hit turbulence. Try again in a moment.';
    } else if (typeof messageOrEvent === 'string') {
      text = messageOrEvent;
    } else if (typeof messageOrEvent === 'object') {
      if (messageOrEvent.error && typeof messageOrEvent.error === 'object') {
        text = messageOrEvent.error.message || text;
      } else if (messageOrEvent.message) {
        text = messageOrEvent.message;
      }
    }
  } catch (err) {
    console.error('Failed to parse stream error', err);
  }

  const stream = createAssistantStream(text, false);
  stream.bubble.classList.add('bubble-error');
  stream.body.textContent = text;
  scrollToBottom();
}

function handleDone() {
  assistantStreams.clear();
  clearAssistantPlaceholder();
  setBusy(false);
  stopButton.classList.add(HIDDEN_CLASS);
}

function handleEvent(event) {
  if (!event || typeof event !== 'object') return;
  switch (event.type) {
    case 'assistant_delta':
      handleAssistantDelta(event);
      break;
    case 'assistant_message':
      handleAssistantMessage(event);
      break;
    case 'tool_status':
      handleToolStatus(event);
      break;
    case 'error':
      console.error('Stream error event', event);
      handleStreamError(event);
      break;
    case 'done':
      handleDone();
      break;
  }
}

function handleLine(line) {
  if (!line) return;
  try {
    const parsed = JSON.parse(line);
    handleEvent(parsed);
  } catch (err) {
    // ignore malformed line but log for debugging
    console.warn('Malformed stream line', line, err);
  }
}

function reportStreamFailure(message) {
  handleStreamError(message);
}

function decodeChunk(value, options) {
  if (decoder) {
    return decoder.decode(value, options);
  }
  if (!value) return '';
  let result = '';
  const length = value.length >>> 0;
  for (let i = 0; i < length; i += 1) {
    result += String.fromCharCode(value[i]);
  }
  return result;
}

class StreamController {
  constructor() {
    this.active = true;
    this.reader = null;
    this.abortController = new AbortController();
  }

  abort() {
    this.active = false;
    this.abortController.abort();
    if (this.reader) {
      this.reader.cancel();
    }
  }
}

let currentStreamController = null;

function redirectToLogin(message) {
  clearLoginRedirect(message || LOGIN_REDIRECT_MESSAGE);
}

function handleUnauthenticated(message) {
  redirectToLogin(message || LOGIN_REDIRECT_MESSAGE);
}

async function sendMessage(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  if (!sessionState.loggedIn) {
    handleUnauthenticated('Sign in to send messages.');
    return;
  }

  const userMessage = { role: 'user', content: text };
  dialogue.push(userMessage);
  createChatBubble('user', { initialText: text });

  textarea.value = '';
  if (pageShell) {
    pageShell.classList.remove('composer-has-text');
  }
  autoSizeTextarea();
  updateSendState();
  setBusy(true);
  stopButton.classList.remove(HIDDEN_CLASS);

  currentStreamController = new StreamController();
  assistantPlaceholder = createAssistantStream('', true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: dialogue }),
      signal: currentStreamController.abortController.signal,
    });

    if (response.status === 401) {
      handleUnauthenticated('Session expired. Please sign in again.');
      return;
    }

    if (!response.ok) {
      let respText = '';
      try {
        respText = await response.text();
      } catch (e) {
        respText = '<unreadable response body>';
      }
      const err = new Error('HTTP ' + response.status + ' - ' + response.statusText);
      err.response = { status: response.status, statusText: response.statusText, body: respText };
      throw err;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    currentStreamController.reader = reader;

    let buffer = '';
    while (currentStreamController.active) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decodeChunk(value, { stream: true });
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf(String.fromCharCode(10))) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) handleLine(line);
      }
    }
    const tail = buffer.trim();
    if (tail) handleLine(tail);
  } catch (err) {
    console.error('sendMessage error', err);
    if (err && err.response) {
      if (err.response.status === 401) {
        handleUnauthenticated('Session expired. Please sign in again.');
        return;
      }
      console.error('HTTP response details:', err.response);
    }
    if (currentStreamController && currentStreamController.active) {
      const message = err instanceof Error ? err.message : String(err);
      reportStreamFailure(message);
    }
  } finally {
    setBusy(false);
    stopButton.classList.add(HIDDEN_CLASS);
    currentStreamController = null;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(textarea.value);
});

textarea.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

textarea.addEventListener('input', () => {
  updateSendState();
  autoSizeTextarea();
});

textarea.addEventListener('focus', () => {
  pageShell?.classList.add('composer-focused');
});

textarea.addEventListener('blur', () => {
  pageShell?.classList.remove('composer-focused');
});

resetButton.addEventListener('click', (event) => {
  event.preventDefault();
  resetConversation();
});

stopButton.addEventListener('click', (event) => {
  event.preventDefault();
  if (currentStreamController) {
    currentStreamController.abort();
    setBusy(false);
    stopButton.classList.add(HIDDEN_CLASS);
  }
});

logoutButton?.addEventListener('click', async (event) => {
  event.preventDefault();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout request failed', err);
  } finally {
    redirectToLogin('You have signed out.');
  }
});

function resetConversation() {
  dialogue = [];
  assistantStreams.clear();
  toolBubbles.clear();
  clearAssistantPlaceholder();
  transcript.innerHTML = '';
  const initialText = sessionState.loggedIn
    ? "Hello! I'm your MAS tutor assistant. Ask about students, pacing, or resources and I'll curate the most relevant guidance for you."
    : 'Sign in to start a tutoring session.';
  createChatBubble('assistant', { initialText });
  textarea.value = '';
  pageShell?.classList.remove('composer-has-text', 'has-history');
  autoSizeTextarea();
  setBusy(false);
  setChatAvailability(sessionState.loggedIn);
  if (sessionState.loggedIn) {
    textarea.focus();
  } else {
    statusDot.classList.remove('busy');
  }
}

function applySessionState(newState, options = {}) {
  const resolved = { ...defaultSessionState, ...newState };
  if (resolved.mode === 'static') {
    resolved.loggedIn = true;
    if (!resolved.email) {
      resolved.email = 'Static token';
    }
  }

  const wasLoggedIn = previousSessionLoggedIn;
  sessionState = resolved;
  previousSessionLoggedIn = resolved.loggedIn;

  if (sessionEmail) {
    sessionEmail.textContent = resolved.email ?? 'Tutor';
  }
  if (pageShell) {
    pageShell.classList.toggle('static-session', resolved.mode === 'static');
  }

  if (!resolved.loggedIn) {
    setChatAvailability(false);
    if (!options.silent) {
      redirectToLogin(options.message || LOGIN_REDIRECT_MESSAGE);
    }
    return;
  }

  setChatAvailability(true);
  if (resolved.loggedIn && !wasLoggedIn) {
    resetConversation();
  }
  refreshStatusLabel();
}

async function refreshSession(options = {}) {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) {
      if (response.status === 401) {
        applySessionState({ loggedIn: false }, options);
        return;
      }
      throw new Error('Session check failed');
    }
    const data = await response.json();
    applySessionState(
      {
        loggedIn: Boolean(data.loggedIn),
        email: data.email ?? null,
        mode: data.mode ?? 'interactive',
      },
      options,
    );
  } catch (err) {
    console.error('Failed to refresh session', err);
    if (!sessionState.loggedIn) {
      setChatAvailability(false);
    }
  }
}

refreshSession({ silent: true }).then(() => {
  if (sessionState.loggedIn) {
    resetConversation();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshSession({ silent: true });
  }
});

autoSizeTextarea();
updateSendState();
