import { refs, sendDefaultText } from './dom.js';
import { state } from './state.js';
import {
  autoSizeTextarea,
  scrollToBottom,
  formatOperationName,
  formatDuration,
} from './utils.js';
import { updatePlanControlsAvailability } from './plan.js';
import { handleUnauthenticated } from './auth.js';

const {
  transcript,
  sendButton,
  stopButton,
  statusText,
  statusDot,
  textarea,
  pageShell,
} = refs;

const HIDDEN_CLASS = 'hidden';
const supportsTextDecoder = typeof TextDecoder !== 'undefined';
const decoder = supportsTextDecoder ? new TextDecoder() : null;
let currentStreamController = null;

function refreshStatusLabel() {
  if (!statusText) return;
  if (state.busy) {
    statusText.textContent = 'Synthesizing insight...';
  } else {
    statusText.textContent = state.session.loggedIn ? 'Ready for your next prompt' : 'Reconnecting...';
  }
}

function updateSendState() {
  const hasContent = textarea.value.trim().length > 0;
  if (sendButton) {
    sendButton.disabled = state.busy || !state.session.loggedIn || !hasContent || textarea.disabled;
  }
  if (pageShell) {
    pageShell.classList.toggle('composer-has-text', hasContent);
  }
}

function setBusy(isBusy) {
  state.busy = isBusy;
  pageShell?.classList.toggle('is-busy', isBusy);
  statusDot?.classList.toggle('busy', isBusy);
  if (sendButton) {
    sendButton.textContent = isBusy ? 'Sending...' : sendDefaultText;
  }
  refreshStatusLabel();
  updateSendState();
  updatePlanControlsAvailability();
}

function setChatAvailability(enabled) {
  textarea.disabled = !enabled;
  if (!enabled) {
    textarea.value = '';
    pageShell?.classList.remove('composer-has-text');
  }
  textarea.placeholder = enabled
    ? "Plan tomorrow's lesson, request resources, or prep a student briefing..."
    : 'Reconnecting to MAS...';
  autoSizeTextarea(textarea);
  refreshStatusLabel();
  updateSendState();
}

function clearAssistantPlaceholder() {
  if (state.assistantPlaceholder) {
    state.assistantPlaceholder.bubble.remove();
    state.assistantPlaceholder = null;
  }
}

function createChatBubble(role, options = {}) {
  const bubble = document.createElement('article');
  bubble.className = 'bubble bubble-' + role;
  bubble.dataset.role = role;
  if (role === 'tool') {
    bubble.classList.add('bubble-tool');
  }
  if (options.pending) {
    bubble.classList.add('bubble-pending');
  }
  if (Array.isArray(options.classes)) {
    bubble.classList.add(...options.classes);
  }

  const header = document.createElement('header');
  header.className = 'bubble-header';
  const labelText = options.label || (role === 'assistant' ? 'MAS' : 'You');
  const label = document.createElement('span');
  label.className = 'bubble-label';
  label.textContent = labelText;
  header.appendChild(label);
  if (options.meta) {
    const meta = document.createElement('span');
    meta.className = 'bubble-meta';
    meta.textContent = options.meta;
    header.appendChild(meta);
  }
  bubble.appendChild(header);

  const body = document.createElement('p');
  body.className = 'bubble-text';
  body.textContent = options.initialText ?? '';
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
  if (pageShell && (role !== 'assistant' || state.dialogue.length > 0)) {
    pageShell.classList.add('has-history');
  }
  scrollToBottom(transcript);
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
  let stream = state.assistantStreams.get(index);
  if (stream) {
    return stream;
  }
  if (state.assistantPlaceholder) {
    stream = state.assistantPlaceholder;
    state.assistantPlaceholder = null;
    stream.text = '';
    stream.body.textContent = '';
  } else {
    stream = createAssistantStream('', true);
  }
  if (!stream.bubble.classList.contains('bubble-pending')) {
    stream.bubble.classList.add('bubble-pending');
  }
  state.assistantStreams.set(index, stream);
  return stream;
}

function getToolBubble(callId, operation) {
  let entry = state.toolBubbles.get(callId);
  if (entry) return entry;
  const label = 'Tool - ' + formatOperationName(operation);
  const { bubble, body } = createChatBubble('tool', {
    label,
    initialText: formatOperationName(operation),
    pending: true,
    classes: ['bubble-tool-pending'],
  });
  entry = { bubble, body, operation };
  state.toolBubbles.set(callId, entry);
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
  state.assistantStreams.delete(typeof event.outputIndex === 'number' ? event.outputIndex : 0);
  clearAssistantPlaceholder();
  if (stream.text.trim()) {
    state.dialogue.push({ role: 'assistant', content: stream.text });
  }
  scrollToBottom(transcript);
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

  scrollToBottom(transcript);
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
  scrollToBottom(transcript);
}

function handleDone() {
  state.assistantStreams.clear();
  clearAssistantPlaceholder();
  setBusy(false);
  stopButton?.classList.add(HIDDEN_CLASS);
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
    console.warn('Malformed stream line', line, err);
  }
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

function reportStreamFailure(message) {
  handleStreamError(message);
}

export async function sendMessage(raw) {
  const text = raw.trim();
  if (!text || state.busy) return;
  if (!state.session.loggedIn) {
    handleUnauthenticated('Sign in to send messages.');
    return;
  }

  const userMessage = { role: 'user', content: text };
  state.dialogue.push(userMessage);
  createChatBubble('user', { initialText: text });

  textarea.value = '';
  pageShell?.classList.remove('composer-has-text');
  autoSizeTextarea(textarea);
  updateSendState();
  setBusy(true);
  stopButton?.classList.remove(HIDDEN_CLASS);

  currentStreamController = new StreamController();
  state.assistantPlaceholder = createAssistantStream('', true);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.dialogue }),
      signal: currentStreamController.abortController.signal,
    });

    if (response.status === 401) {
      handleUnauthenticated('Session expired. Please sign in again.');
      return;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || 'Chat request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response stream unavailable');
    }
    currentStreamController.reader = reader;

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decodeChunk(value, { stream: true });
      buffer += chunkText;
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        if (line) handleLine(line);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
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
    stopButton?.classList.add(HIDDEN_CLASS);
    currentStreamController = null;
  }
}

export function abortCurrentStream() {
  if (currentStreamController) {
    currentStreamController.abort();
    setBusy(false);
    stopButton?.classList.add(HIDDEN_CLASS);
  }
}

export function resetConversation() {
  state.dialogue = [];
  state.assistantStreams.clear();
  state.toolBubbles.clear();
  clearAssistantPlaceholder();
  transcript.innerHTML = '';
  const initialText = state.session.loggedIn
    ? "Hello! I'm your MAS tutor assistant. Ask about students, pacing, or resources and I'll curate the most relevant guidance for you."
    : 'Sign in to start a tutoring session.';
  createChatBubble('assistant', { initialText });
  textarea.value = '';
  pageShell?.classList.remove('composer-has-text', 'has-history');
  autoSizeTextarea(textarea);
  setBusy(false);
  setChatAvailability(state.session.loggedIn);
  if (state.session.loggedIn) {
    textarea.focus();
  } else {
    statusDot?.classList.remove('busy');
  }
}

export function initializeComposer() {
  stopButton?.classList.add(HIDDEN_CLASS);
  autoSizeTextarea(textarea);
  updateSendState();
  refreshStatusLabel();
  updatePlanControlsAvailability();
}

export { refreshStatusLabel, updateSendState, setBusy, setChatAvailability };
