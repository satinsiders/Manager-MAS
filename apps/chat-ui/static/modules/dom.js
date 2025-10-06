export const refs = {
  transcript: document.getElementById('transcript'),
  form: document.getElementById('composer'),
  textarea: document.getElementById('input'),
  sendButton: document.getElementById('send'),
  stopButton: document.getElementById('stop'),
  statusText: document.getElementById('status-text'),
  statusDot: document.getElementById('status-dot'),
  resetButton: document.getElementById('reset-chat'),
  logoutButton: document.getElementById('logout'),
  sessionEmail: document.getElementById('session-email'),
  pageShell: document.body,
  contextPanel: document.querySelector('.mission-hub'),
  contextTimestamp: document.getElementById('hub-updated'),
  contextError: document.getElementById('hub-error'),
  alertsList: document.getElementById('signal-list'),
  draftsList: document.getElementById('drafts-list'),
  activityList: document.getElementById('activity-list'),
  metricActiveStudents: document.getElementById('metric-active-students'),
  metricFlaggedStudents: document.getElementById('metric-flagged-students'),
  metricIdleStudents: document.getElementById('metric-idle-students'),
  metricOpenDrafts: document.getElementById('metric-open-drafts'),
  studentSelector: document.getElementById('student-selector'),
  planSummary: document.getElementById('plan-summary'),
  planEditor: document.getElementById('plan-editor'),
  planSaveDraftButton: document.getElementById('plan-save-draft'),
  planPublishButton: document.getElementById('plan-publish-draft'),
  planStatus: document.getElementById('plan-status'),
  refreshButton: document.getElementById('sync-insights'),
  refreshStatus: document.getElementById('sync-status'),
  refreshProgressList: document.getElementById('sync-progress'),
  studentListSection: document.querySelector('.hub-roster'),
  studentListToggle: document.getElementById('roster-toggle'),
  studentListElement: document.getElementById('roster-list'),
  studentListCount: document.getElementById('roster-count'),
};

export function ensureDomReady() {
  const required = [
    'transcript',
    'form',
    'textarea',
    'sendButton',
    'stopButton',
    'statusText',
    'statusDot',
    'resetButton',
  ];
  for (const key of required) {
    if (!refs[key]) {
      throw new Error('Chat UI failed to initialise: missing required elements.');
    }
  }
}

export const sendDefaultText = refs.sendButton ? refs.sendButton.textContent || 'Send' : 'Send';
