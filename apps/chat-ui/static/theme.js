const STORAGE_KEY = 'mas-theme-preference';
const LOGIN_ALERT_KEY = 'mas-login-alert';

function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (err) {
    return null;
  }
}

function setStoredTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (err) {
    // Ignore write failures (private mode, etc.)
  }
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('theme-dark', theme === 'dark');
  root.classList.toggle('theme-light', theme === 'light');
}

function updateToggle(button, theme) {
  if (!button) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  button.setAttribute('data-theme', theme);
  button.setAttribute('aria-label', `Switch to ${next} mode`);
  button.setAttribute('title', `Switch to ${next} mode`);
  const textEl = button.querySelector('.theme-toggle-text');
  if (textEl) {
    textEl.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  }
}

export function initThemeControls() {
  const storedPreference = getStoredTheme();
  let activeTheme = storedPreference ?? (systemPrefersDark() ? 'dark' : 'light');
  applyTheme(activeTheme);

  const toggles = Array.from(document.querySelectorAll('[data-theme-toggle], #theme-toggle'));
  toggles.forEach((btn) => updateToggle(btn, activeTheme));

  const syncAll = (theme) => {
    activeTheme = theme;
    applyTheme(theme);
    toggles.forEach((btn) => updateToggle(btn, theme));
  };

  toggles.forEach((button) => {
    if (!button) return;
    button.addEventListener('click', () => {
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      setStoredTheme(nextTheme);
      syncAll(nextTheme);
    });
  });

  if (window.matchMedia) {
    const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => {
      const stored = getStoredTheme();
      if (stored) {
        return;
      }
      syncAll(event.matches ? 'dark' : 'light');
    };
    if (typeof darkMedia.addEventListener === 'function') {
      darkMedia.addEventListener('change', handler);
    } else if (typeof darkMedia.addListener === 'function') {
      darkMedia.addListener(handler);
    }
  }
}

export function storeLoginAlert(message) {
  try {
    if (message) {
      window.sessionStorage.setItem(LOGIN_ALERT_KEY, message);
    } else {
      window.sessionStorage.removeItem(LOGIN_ALERT_KEY);
    }
  } catch (err) {
    // ignore storage errors
  }
}

export function consumeLoginAlert() {
  try {
    const message = window.sessionStorage.getItem(LOGIN_ALERT_KEY);
    if (message) {
      window.sessionStorage.removeItem(LOGIN_ALERT_KEY);
    }
    return message || '';
  } catch (err) {
    return '';
  }
}
