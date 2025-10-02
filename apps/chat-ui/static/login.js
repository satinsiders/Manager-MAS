import { initThemeControls, consumeLoginAlert } from './theme.js';

initThemeControls();

const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmit = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');
const loginMessage = document.getElementById('login-message');

const defaultLoginCopy = loginMessage ? loginMessage.textContent || '' : '';
const submitDefaultText = loginSubmit ? loginSubmit.textContent || 'Enter workspace' : 'Enter workspace';

function showError(message) {
  if (!loginError) return;
  loginError.textContent = message || '';
  loginError.classList.toggle('visible', Boolean(message));
}

function resetLoading() {
  if (loginSubmit) {
    loginSubmit.disabled = false;
    loginSubmit.textContent = submitDefaultText;
  }
}

function setLoading() {
  if (loginSubmit) {
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in...';
  }
}

function redirectToChat() {
  window.location.replace('/chat');
}

async function inspectSession({ silent } = { silent: false }) {
  try {
    const response = await fetch('/api/auth/session');
    if (!response.ok) return;
    const data = await response.json();
    if (data.mode === 'static' && loginMessage) {
      loginMessage.textContent = 'This deployment uses a static platform token. Chat access is always available.';
    } else if (loginMessage) {
      loginMessage.textContent = defaultLoginCopy;
    }
    if (data.loggedIn || data.mode === 'static') {
      redirectToChat();
    }
  } catch (err) {
    if (!silent) {
      console.error('Session check failed', err);
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!loginEmail || !loginPassword) return;
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    showError('Enter both email and password.');
    return;
  }
  showError('');
  setLoading();
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message = data?.message || 'Login failed. Check your credentials and try again.';
      showError(message);
      return;
    }
    redirectToChat();
  } catch (err) {
    console.error('Login request failed', err);
    showError('Login failed. Please try again.');
  } finally {
    resetLoading();
  }
}

const alertMessage = consumeLoginAlert();
if (alertMessage) {
  showError(alertMessage);
}

if (loginForm) {
  loginForm.addEventListener('submit', handleSubmit);
}

inspectSession();

if (loginEmail instanceof HTMLElement && typeof loginEmail.focus === 'function') {
  window.requestAnimationFrame(() => {
    loginEmail.focus();
  });
}
