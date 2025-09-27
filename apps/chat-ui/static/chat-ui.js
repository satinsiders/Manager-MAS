// Helper for text decoding in streaming responses
const supportsTextDecoder = typeof TextDecoder !== 'undefined';
const decoder = supportsTextDecoder ? new TextDecoder() : null;

/** @type {{ role: 'user' | 'assistant'; content: string; }[]} */
let dialogue = [];
let busy = false;

/** @type {Map<number, { bubble: HTMLElement; body: HTMLElement; text: string; }>} */
const assistantStreams = new Map();
/** @type {{ bubble: HTMLElement; body: HTMLElement; text: string; } | null} */
let assistantPlaceholder = null;
/** @type {Map<string, { bubble: HTMLElement; body: HTMLElement; operation: string; }>} */
const toolBubbles = new Map();

// DOM elements
const transcript = document.getElementById('transcript');
const form = document.getElementById('composer');
const textarea = document.getElementById('input');
const sendButton = document.getElementById('send');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const resetButton = document.getElementById('reset-chat');
const authPanel = document.getElementById('auth-panel');
const chatPanel = document.getElementById('chat-panel');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmit = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');
const loginMessage = document.getElementById('login-message');
const logoutButton = document.getElementById('logout');
const sessionEmail = document.getElementById('session-email');

const defaultLoginMessage = loginMessage ? loginMessage.textContent : '';

const defaultSessionState = { loggedIn: false, mode: 'interactive', email: null };
let sessionState = { ...defaultSessionState };
let previousSessionLoggedIn = false;

function scrollToBottom() {
  transcript.scrollTop = transcript.scrollHeight;
}

function setBusy(isBusy) {
  busy = isBusy;
  statusText.textContent = isBusy ? 'Consulting GPT-5 and live APIs...' : 'Ready';
  statusDot.classList.toggle('busy', isBusy);
  updateSendState();
}

function updateSendState() {
  const hasContent = textarea.value.trim().length > 0;
  sendButton.disabled = busy || !sessionState.loggedIn || !hasContent || textarea.disabled;
}

function setChatAvailability(enabled) {
  textarea.disabled = !enabled;
  if (!enabled) {
    textarea.value = '';
  }
  textarea.placeholder = enabled
    ? 'Ask about a student, curriculum, or dispatch plan…'
    : 'Sign in to start chatting with the MAS assistant.';
  updateSendState();
}

function clearLoginError() {
  if (loginError) {
    loginError.textContent = '';
  }
}

function showLoginError(message) {
  if (loginError) {
    loginError.textContent = message ?? '';
  }
}

function showAuthPanel() {
  authPanel?.classList.remove('hidden');
  chatPanel?.classList.add('hidden');
  setChatAvailability(false);
  setBusy(false);
  if (typeof stopButton !== 'undefined' && stopButton) {
    stopButton.style.display = 'none';
  }
  if (loginEmail) {
    window.requestAnimationFrame(() => loginEmail.focus());
  }
}

function showChatPanel() {
  authPanel?.classList.add('hidden');
  chatPanel?.classList.remove('hidden');
  setChatAvailability(true);
}

function updateSessionUI() {
  if (sessionState.loggedIn) {
    sessionEmail.textContent = sessionState.email ?? 'Teacher';
    showChatPanel();
    clearLoginError();
    if (loginPassword) loginPassword.value = '';
    if (!busy) {
      statusText.textContent = 'Ready';
      statusDot.classList.remove('busy');
    }
    if (logoutButton) {
      logoutButton.style.display = sessionState.mode === 'static' ? 'none' : 'inline-flex';
    }
  } else {
    sessionEmail.textContent = '';
    showAuthPanel();
    statusText.textContent = 'Sign in required';
    statusDot.classList.remove('busy');
    if (logoutButton) {
      logoutButton.style.display = 'none';
    }
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
  if (loginMessage) {
    loginMessage.textContent =
      resolved.mode === 'static'
        ? 'This deployment uses a static platform token. Chat access is always available.'
        : defaultLoginMessage;
  }

  const wasLoggedIn = previousSessionLoggedIn;
  const unchanged =
    sessionState.loggedIn === resolved.loggedIn &&
    sessionState.mode === resolved.mode &&
    sessionState.email === resolved.email;

  sessionState = resolved;
  updateSessionUI();

  if (!unchanged) {
    if (sessionState.loggedIn && !wasLoggedIn) {
      resetConversation();
    } else if (!sessionState.loggedIn && wasLoggedIn) {
      resetConversation();
      if (!options.silent) {
        showLoginError(options.message || 'Session ended. Please sign in again.');
      }
    }
  }

  if (!sessionState.loggedIn && options.message && !options.silent) {
    showLoginError(options.message);
  }

  previousSessionLoggedIn = sessionState.loggedIn;
}

async function refreshSession(options = {}) {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) {
      throw new Error('Session check failed');
    }
    const data = await response.json();
    applySessionState(
      {
        loggedIn: Boolean(data.loggedIn),
        email: data.email ?? null,
        mode: data.mode ?? 'interactive',
      },
      { silent: options.silent },
    );
  } catch (err) {
    console.error('Failed to refresh session', err);
    applySessionState({ loggedIn: false, email: null, mode: 'interactive' }, { silent: true });
  }
}

function handleUnauthenticated(message) {
  applySessionState({ loggedIn: false, email: null, mode: 'interactive' }, { message, silent: false });
  refreshSession({ silent: true });
}

const loginSubmitDefaultText = loginSubmit ? loginSubmit.textContent : 'Sign In';

async function handleLogin(event) {
  event.preventDefault();
  if (!loginEmail || !loginPassword) return;
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    showLoginError('Enter both email and password.');
    return;
  }

  clearLoginError();
  if (loginSubmit) {
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing In…';
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data?.message || 'Login failed. Check your credentials and try again.';
      showLoginError(message);
      return;
    }
    await refreshSession({ silent: true });
  } catch (err) {
    console.error('Login request failed', err);
    showLoginError('Login failed. Please try again.');
  } finally {
    if (loginSubmit) {
      loginSubmit.disabled = false;
      loginSubmit.textContent = loginSubmitDefaultText;
    }
  }
}

async function handleLogout(event) {
  event.preventDefault();
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout request failed', err);
  } finally {
    applySessionState({ loggedIn: false, email: null, mode: 'interactive' }, { message: 'You have signed out.', silent: false });
    await refreshSession({ silent: true });
  }
}

function createChatBubble(role, options) {
  const bubble = document.createElement('article');
  bubble.className = 'bubble bubble-' + role;
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
      role === 'user'
        ? 'You'
        : role === 'assistant'
        ? 'MAS Assistant'
        : 'Tool Progress';
  }
  bubble.appendChild(header);

  const body = document.createElement('p');
  body.className = 'bubble-text';
  body.textContent = options?.initialText ?? '';
  bubble.appendChild(body);

  transcript.appendChild(bubble);
  scrollToBottom();
  return { bubble, body };
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

function clearAssistantPlaceholder() {
  if (assistantPlaceholder) {
    assistantPlaceholder.bubble.remove();
    assistantPlaceholder = null;
  }
}

function updateToolStatus(bubble, body, status, details = '') {
  const statusLine = bubble.querySelector('.status-line') || document.createElement('div');
  statusLine.className = 'status-line';
  
  let statusText = '';
  switch (status) {
    case 'initializing':
      statusText = 'Initializing API connection...';
      break;
    case 'connecting':
      statusText = 'Connecting to service...';
      break;
    case 'fetching':
      statusText = 'Fetching data...';
      break;
    case 'processing':
      statusText = 'Processing response...';
      break;
    case 'success':
      statusText = 'Operation complete';
      break;
    case 'error':
      statusText = 'Operation failed';
      break;
    default:
      statusText = status;
  }

  if (details) {
    statusText += ` • ${details}`;
  }
  statusLine.textContent = statusText;

  if (!bubble.querySelector('.status-line')) {
    bubble.appendChild(statusLine);
  }
}

function getToolBubble(callId, operation) {
  let entry = toolBubbles.get(callId);
  if (entry) return entry;
  const label = 'Tool • ' + formatOperationName(operation);
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

// For smooth token animation
const TOKEN_INTERVAL = 10; // ms between tokens
let currentStreamController = null;

function handleAssistantDelta(event) {
  const stream = getAssistantStream(event.outputIndex);
  if (event.delta) {
    stream.text += event.delta;
    // Split the text into tokens for smooth animation
    const tokens = event.delta.split(/(\s+)/);
    let i = 0;
    const animateTokens = () => {
      if (!currentStreamController?.active) return;
      if (i < tokens.length) {
        stream.body.textContent += tokens[i];
        i++;
        setTimeout(animateTokens, TOKEN_INTERVAL);
      }
    };
    animateTokens();
  }
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
  const { bubble, body, operation } = entry;
  
  bubble.classList.remove('bubble-tool-pending', 'bubble-tool-success', 'bubble-tool-error');
  
  switch (event.status) {
    case 'started':
      bubble.classList.add('bubble-tool-pending');
      updateToolStatus(bubble, body, 'connecting');
      
      // Simulate the tool execution stages
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
      
      // For operations that fetch data
      if (event.message?.toLowerCase().includes('fetch') || 
          event.message?.toLowerCase().includes('search') ||
          event.message?.toLowerCase().includes('read')) {
        body.textContent = event.message;
        updateToolStatus(bubble, body, 'success', duration);
      } 
      // For operations that process data
      else if (event.message?.toLowerCase().includes('process') || 
               event.message?.toLowerCase().includes('analyze')) {
        body.textContent = event.message;
        updateToolStatus(bubble, body, 'success', duration);
      }
      // For quick operations
      else {
        body.textContent = event.message || 'Operation completed';
        updateToolStatus(bubble, body, 'success', duration);
      }
      break;
      
    case 'failed':
      bubble.classList.add('bubble-tool-error');
      // Log full failed event for debugging
      console.error('Tool failed', event);
      body.textContent = event.message || 'Operation failed';
      updateToolStatus(bubble, body, 'error');
      break;
  }
  
  scrollToBottom();
}

function handleStreamError(messageOrEvent) {
  // Accept either a string or a structured event: { error: { message, stack, details } } or { message }
  let text = 'Something went wrong. Please try again.';
  try {
    if (!messageOrEvent) {
      text = 'Something went wrong. Please try again.';
    } else if (typeof messageOrEvent === 'string') {
      text = messageOrEvent;
    } else if (typeof messageOrEvent === 'object') {
      // Log full payload for inspection
      console.error('Stream error payload', messageOrEvent);
      // Prefer structured error payload
      const errObj = messageOrEvent.error ?? messageOrEvent;
      if (typeof errObj === 'string') {
        text = errObj;
      } else if (errObj && typeof errObj === 'object') {
        text = errObj.message || errObj.error?.message || JSON.stringify(errObj.details ?? errObj).slice(0, 500);
        // Append stack or details summary when available (shortened)
        if (errObj.stack) {
          text += '\n' + String(errObj.stack).split('\n')[0];
        }
      }
    }
  } catch (e) {
    console.error('Error while formatting stream error', e, messageOrEvent);
    text = 'Something went wrong. (error formatting failed)';
  }
  if (assistantStreams.size === 0 && assistantPlaceholder) {
    assistantPlaceholder.body.textContent = text;
    assistantPlaceholder.bubble.classList.remove('bubble-pending');
    assistantPlaceholder.bubble.classList.add('bubble-error');
    assistantPlaceholder = null;
  } else if (assistantStreams.size > 0) {
    assistantStreams.forEach((stream) => {
      stream.body.textContent = text;
      stream.bubble.classList.remove('bubble-pending');
      stream.bubble.classList.add('bubble-error');
    });
    assistantStreams.clear();
  } else {
    const { bubble, body } = createChatBubble('assistant', { initialText: text });
    bubble.classList.add('bubble-error');
    body.textContent = text;
  }
  // Final error: no longer busy and hide stop control
  setBusy(false);
  stopButton.style.display = 'none';
}

function handleDone() {
  assistantStreams.clear();
  clearAssistantPlaceholder();
  // Stream finished successfully
  setBusy(false);
  stopButton.style.display = 'none';
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
      // Log full error event for debugging in browser console
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
  } catch {
    // ignore malformed line
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

function processBufferedText(bufferText) {
  if (!bufferText) return;
  const lines = bufferText.split(String.fromCharCode(10));
  for (const line of lines) {
    handleLine(line.trim());
  }
}

const stopButton = document.getElementById('stop');

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

async function sendMessage(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  if (!sessionState.loggedIn) {
    showLoginError('Sign in to send messages.');
    return;
  }

  const userMessage = { role: 'user', content: text };
  dialogue.push(userMessage);
  createChatBubble('user', { initialText: text });

  textarea.value = '';
  updateSendState();
  setBusy(true);
  stopButton.style.display = 'flex';

  // Create new stream controller
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
      // Try to read response body for richer debugging info
      let respText = '';
      try {
        respText = await response.text();
      } catch (e) {
        respText = '<unreadable response body>';
      }
      const err = new Error('HTTP ' + response.status + ' - ' + response.statusText);
      // attach details for console inspection
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
    // Log full error object for debugging in browser console
    console.error('sendMessage error', err);
    // If it's an HTTP error with response body, log that too
    if (err && err.response) {
      if (err.response.status === 401) {
        handleUnauthenticated('Session expired. Please sign in again.');
        return;
      }
      console.error('HTTP response details:', err.response);
    }
    // Only report failure to UI if not manually stopped
    if (currentStreamController.active) {
      const message = err instanceof Error ? err.message : String(err);
      reportStreamFailure(message);
    }
  } finally {
    setBusy(false);
    stopButton.style.display = 'none';
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

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
}

if (logoutButton) {
  logoutButton.addEventListener('click', handleLogout);
}

textarea.addEventListener('input', updateSendState);

resetButton.addEventListener('click', (event) => {
  event.preventDefault();
  resetConversation();
});

stopButton.addEventListener('click', (event) => {
  event.preventDefault();
  if (currentStreamController) {
    currentStreamController.abort();
  }
});

function resetConversation() {
  dialogue = [];
  assistantStreams.clear();
  toolBubbles.clear();
  clearAssistantPlaceholder();
  transcript.innerHTML = '';
  const initialText = sessionState.loggedIn
    ? "Hi, I'm the MAS operations assistant. Ask about students, curricula, or dispatch decisions and I'll pull the latest data for you."
    : 'Sign in to start chatting with the MAS assistant.';
  createChatBubble('assistant', { initialText });
  textarea.value = '';
  setBusy(false);
  setChatAvailability(sessionState.loggedIn);
  if (sessionState.loggedIn) {
    textarea.focus();
  } else {
    statusText.textContent = 'Sign in required';
    statusDot.classList.remove('busy');
  }
}

showAuthPanel();
resetConversation();
refreshSession({ silent: true });
