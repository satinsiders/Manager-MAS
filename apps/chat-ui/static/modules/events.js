import { refs } from './dom.js';
import { state } from './state.js';
import { autoSizeTextarea } from './utils.js';
import { sendMessage, abortCurrentStream, resetConversation, updateSendState } from './chat.js';
import {
  handlePlanSaveDraft,
  handlePlanPublish,
  loadStudentPlan,
  renderPlanSummary,
} from './plan.js';
import { triggerPlatformRefresh } from './refresh.js';
import { redirectToLogin } from './auth.js';

const {
  form,
  textarea,
  resetButton,
  stopButton,
  logoutButton,
  studentSelector,
  planSaveDraftButton,
  planPublishButton,
  refreshButton,
  studentListToggle,
  studentListSection,
  pageShell,
} = refs;

export function registerEventListeners() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void sendMessage(textarea.value);
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  textarea.addEventListener('input', () => {
    updateSendState();
    autoSizeTextarea(textarea);
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
    abortCurrentStream();
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

  studentSelector?.addEventListener('change', (event) => {
    const value = event.target.value || '';
    state.currentStudentId = value || null;
    state.currentPlanSnapshot = null;
    state.currentPlanStudentId = null;
    state.currentDraftVersion = null;
    state.planDraftData.clear();
    if (!value) {
      renderPlanSummary(null);
      return;
    }
    loadStudentPlan(value);
  });

  planSaveDraftButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void handlePlanSaveDraft();
  });

  planPublishButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void handlePlanPublish();
  });

  refreshButton?.addEventListener('click', (event) => {
    event.preventDefault();
    void triggerPlatformRefresh();
  });

  studentListToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    state.studentListCollapsed = !state.studentListCollapsed;
    if (studentListSection) {
      studentListSection.classList.toggle('collapsed', state.studentListCollapsed);
    }
    studentListToggle.setAttribute('aria-expanded', String(!state.studentListCollapsed));
    const icon = studentListToggle.querySelector('.hub-chip-icon');
    if (icon) {
      icon.textContent = state.studentListCollapsed ? '▸' : '▾';
    }
    const label = studentListToggle.querySelector('.hub-chip-label');
    if (label) {
      label.textContent = state.studentListCollapsed ? 'Expand' : 'Collapse';
    }
  });
}
