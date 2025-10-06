import { state, defaultSessionState } from './state.js';
import { refs } from './dom.js';
import { clearContextInsights } from './insights.js';
import { stopRefreshPolling } from './refresh.js';
import { loadWorkspaceInsights } from './workspace.js';
import { renderPlanSummary, loadStudentPlan } from './plan.js';
import { setChatAvailability, resetConversation, refreshStatusLabel } from './chat.js';
import { redirectToLogin } from './auth.js';

const { sessionEmail, pageShell } = refs;

function snapshotMatchesSelection(studentId) {
  return Boolean(state.currentPlanStudentId) && state.currentPlanStudentId === studentId;
}

export async function ensurePlanForSelection() {
  if (!state.session.loggedIn) {
    renderPlanSummary(null);
    return;
  }
  const studentId = state.currentStudentId;
  if (!studentId) {
    renderPlanSummary(null);
    return;
  }
  if (snapshotMatchesSelection(studentId)) {
    return;
  }
  await loadStudentPlan(studentId, { silent: true });
}

export function applySessionState(newState, options = {}) {
  const resolved = { ...defaultSessionState, ...newState };
  if (resolved.mode === 'static') {
    resolved.loggedIn = true;
    if (!resolved.email) {
      resolved.email = 'Static token';
    }
  }

  const wasLoggedIn = state.previousSessionLoggedIn;
  state.session = resolved;
  state.previousSessionLoggedIn = resolved.loggedIn;

  if (sessionEmail) {
    sessionEmail.textContent = resolved.email ?? 'Tutor';
  }
  pageShell?.classList.toggle('static-session', resolved.mode === 'static');

  if (!resolved.loggedIn) {
    setChatAvailability(false);
    if (state.contextRefreshTimer) {
      clearTimeout(state.contextRefreshTimer);
      state.contextRefreshTimer = null;
    }
    stopRefreshPolling('No refresh running.');
    clearContextInsights();
    if (!options.silent) {
      redirectToLogin(options.message);
    }
    return;
  }

  setChatAvailability(true);
  if (resolved.loggedIn && !wasLoggedIn) {
    resetConversation();
  }
  refreshStatusLabel();
  void loadWorkspaceInsights({ silent: true }).then(() => ensurePlanForSelection());
}

export async function refreshSession(options = {}) {
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
    if (!state.session.loggedIn) {
      setChatAvailability(false);
    }
  }
}
