import { state } from './state.js';
import { refs, sendDefaultText } from './dom.js';
import {
  setMetricValue,
  renderPlaceholder,
  formatRelativeTimestamp,
  formatDateLabel,
} from './utils.js';

const {
  metricActiveStudents,
  metricFlaggedStudents,
  metricIdleStudents,
  metricOpenDrafts,
  alertsList,
  draftsList,
  activityList,
  studentSelector,
  planSummary,
  planEditor,
  planSaveDraftButton,
  planPublishButton,
  planStatus,
  refreshButton,
  refreshStatus,
  refreshProgressList,
  studentListElement,
  studentListCount,
  studentListSection,
  studentListToggle,
  contextError,
  contextTimestamp,
} = refs;

export function renderRefreshProgress(students, statusLabel) {
  if (!refreshProgressList) return;
  refreshProgressList.innerHTML = '';
  state.refreshStudentStatuses.clear();
  if (!students || !students.length) {
    const li = document.createElement('li');
    li.className = 'hub-progress-placeholder';
    li.textContent = statusLabel ?? 'No sync running.';
    refreshProgressList.appendChild(li);
    renderStudentList(state.rosterCache);
    return;
  }
  students.forEach((student) => {
    const li = document.createElement('li');
    li.className = 'hub-progress-item';
    li.dataset.status = student.status || 'pending';
    state.refreshStudentStatuses.set(student.id, {
      status: student.status || 'pending',
      message: student.message,
    });
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hub-progress-name';
    nameSpan.textContent = student.name || student.platformStudentId || 'Student';
    const stateSpan = document.createElement('span');
    stateSpan.className = 'hub-progress-state hub-footnote';
    const labelMap = {
      pending: 'Queued',
      refreshing: 'Refreshing…',
      complete: 'Complete',
      error: 'Error',
    };
    stateSpan.textContent = labelMap[student.status] || 'Queued';
    if (student.message && student.status === 'error') {
      stateSpan.textContent += ` (${student.message})`;
    }
    li.appendChild(nameSpan);
    li.appendChild(stateSpan);
    refreshProgressList.appendChild(li);
  });
  renderStudentList(state.rosterCache);
}

export function renderStudentList(students) {
  if (!studentListElement) return;
  studentListElement.innerHTML = '';
  if (studentListCount) {
    studentListCount.textContent = students && students.length ? String(students.length) : '—';
  }
  if (!students || !students.length) {
    renderPlaceholder(studentListElement, 'No learners loaded.');
    if (studentListSection) {
      studentListSection.classList.toggle('collapsed', state.studentListCollapsed);
    }
    if (studentListToggle) {
      studentListToggle.setAttribute('aria-expanded', String(!state.studentListCollapsed));
      const icon = studentListToggle.querySelector('.hub-chip-icon');
      if (icon) icon.textContent = state.studentListCollapsed ? '▸' : '▾';
      const label = studentListToggle.querySelector('.hub-chip-label');
      if (label) label.textContent = state.studentListCollapsed ? 'Expand' : 'Collapse';
    }
    return;
  }
  students.forEach((student) => {
    const li = document.createElement('li');
    li.className = 'hub-roster-item';
    const statusKey = student.studentId ?? student.mas_student_id ?? student.id;
    const progress = state.refreshStudentStatuses.get(statusKey) || { status: 'idle' };
    li.dataset.refresh = progress.status || 'idle';
    if (progress.message && progress.status === 'error') {
      li.title = progress.message;
    }
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hub-roster-name';
    nameSpan.textContent = student.name || student.studentId || 'Student';
    const detail = document.createElement('span');
    detail.className = 'hub-roster-meta hub-footnote';
    const detailParts = [];
    if (student.currentPlanVersion != null) {
      detailParts.push(`Plan v${student.currentPlanVersion}`);
    }
    const lastActivity = student.recentPerformance?.lastActivity;
    if (lastActivity) {
      detailParts.push(lastActivity);
    }
    detail.textContent = detailParts.length ? detailParts.join(' • ') : '';
    li.appendChild(nameSpan);
    li.appendChild(detail);
    studentListElement.appendChild(li);
  });
  if (studentListSection) {
    studentListSection.classList.toggle('collapsed', state.studentListCollapsed);
  }
  if (studentListToggle) {
    studentListToggle.setAttribute('aria-expanded', String(!state.studentListCollapsed));
    const icon = studentListToggle.querySelector('.hub-chip-icon');
    if (icon) icon.textContent = state.studentListCollapsed ? '▸' : '▾';
    const label = studentListToggle.querySelector('.hub-chip-label');
    if (label) label.textContent = state.studentListCollapsed ? 'Expand' : 'Collapse';
  }
}

export function clearContextInsights() {
  setMetricValue(metricActiveStudents, '—');
  setMetricValue(metricFlaggedStudents, '—');
  setMetricValue(metricIdleStudents, '—');
  setMetricValue(metricOpenDrafts, '—');
  if (alertsList) {
    alertsList.innerHTML = '';
    renderPlaceholder(alertsList, 'No alerts detected.');
  }
  if (draftsList) {
    draftsList.innerHTML = '';
    renderPlaceholder(draftsList, 'All study plans are up to date.');
  }
  if (activityList) {
    activityList.innerHTML = '';
    renderPlaceholder(activityList, 'Recent actions will appear here.');
  }
  if (contextError) {
    contextError.classList.add('hidden');
    contextError.textContent = '';
  }
  if (contextTimestamp) {
    contextTimestamp.textContent = state.session.loggedIn
      ? 'Loading operations snapshot…'
      : 'Sign in to load operations snapshot.';
  }
  state.rosterCache = [];
  state.currentStudentId = null;
  state.currentPlanSnapshot = null;
  state.currentDraftVersion = null;
  state.currentPlanStudentId = null;
  state.planDraftData.clear();
  if (studentSelector) {
    studentSelector.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = state.session.loggedIn ? 'Loading learners…' : 'Sign in to load learners';
    studentSelector.appendChild(option);
    studentSelector.disabled = true;
  }
  if (planSummary) {
    planSummary.innerHTML = '';
    const paragraph = document.createElement('p');
    paragraph.className = 'hub-placeholder';
    paragraph.textContent = 'Select a learner to view their plan.';
    planSummary.appendChild(paragraph);
  }
  if (planEditor) {
    planEditor.value = '';
    planEditor.disabled = true;
  }
  if (planSaveDraftButton) {
    planSaveDraftButton.disabled = true;
  }
  if (planPublishButton) {
    planPublishButton.disabled = true;
  }
  if (planStatus) {
    planStatus.textContent = '';
  }
  if (refreshStatus) {
    refreshStatus.textContent = '';
  }
  if (refreshButton) {
    refreshButton.disabled = !state.session.loggedIn;
  }
  renderStudentList([]);
  renderRefreshProgress([], state.activeRefreshJobId ? 'No progress available.' : 'No sync running.');
}

export function renderAlerts(alerts) {
  const limited = (alerts ?? []).slice(0, 5);
  renderList(
    alertsList,
    limited,
    (alert) => {
      const li = document.createElement('li');
      if (alert.severity) li.dataset.severity = alert.severity;
      const title = document.createElement('strong');
      title.textContent = alert.studentName ?? 'Student';
      li.appendChild(title);
      const message = document.createElement('span');
      message.className = 'hub-footnote';
      message.textContent = alert.message ?? 'Alert triggered';
      li.appendChild(message);
      return li;
    },
    'No alerts detected.',
  );
}

export function renderDrafts(roster) {
  const draftItems = [];
  for (const student of roster ?? []) {
    if (!student || !Array.isArray(student.drafts)) continue;
    for (const draft of student.drafts) {
      draftItems.push({ student, draft });
    }
  }
  draftItems.sort((a, b) => {
    const aDate = a.draft?.createdAt ?? '';
    const bDate = b.draft?.createdAt ?? '';
    return aDate > bDate ? -1 : aDate < bDate ? 1 : 0;
  });
  renderList(
    draftsList,
    draftItems.slice(0, 5),
    (item) => {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      const studentName = item.student?.name ?? 'Student';
      title.textContent = `${studentName}`;
      li.appendChild(title);
      const version = item.draft?.version != null ? `Draft v${item.draft.version}` : 'Draft saved';
      const summary = document.createElement('span');
      summary.className = 'hub-footnote';
      summary.textContent = `${version} • ${formatDateLabel(item.draft?.createdAt ?? null)}`;
      li.appendChild(summary);
      if (Array.isArray(item.draft?.focus) && item.draft.focus.length) {
        const focus = document.createElement('span');
        focus.className = 'hub-footnote';
        focus.textContent = `Focus: ${item.draft.focus.join(', ')}`;
        li.appendChild(focus);
      }
      return li;
    },
    'All study plans are up to date.',
  );
}

function activityHeadline(type) {
  switch (type) {
    case 'decision':
      return 'Plan decision';
    case 'action':
      return 'Platform action';
    case 'study_plan_published':
      return 'Plan published';
    case 'study_plan_draft':
      return 'Draft saved';
    case 'dispatch':
      return 'Dispatch';
    default:
      return 'Activity';
  }
}

function activityMeta(event) {
  const parts = [];
  if (event.studentId) parts.push(`Student ${event.studentId.slice(0, 8)}…`);
  if (event.studyPlanVersion != null) parts.push(`Plan v${event.studyPlanVersion}`);
  parts.push(formatDateLabel(event.occurredAt));
  return parts.join(' • ');
}

export function renderActivity(events) {
  renderList(
    activityList,
    (events ?? []).slice(0, 8),
    (event) => {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = activityHeadline(event.type);
      li.appendChild(title);
      const summary = document.createElement('span');
      summary.className = 'hub-footnote';
      summary.textContent = event.summary ?? 'No summary available.';
      li.appendChild(summary);
      const meta = document.createElement('span');
      meta.className = 'hub-footnote';
      meta.textContent = activityMeta(event);
      li.appendChild(meta);
      return li;
    },
    'Recent actions will appear here.',
  );
}

export function renderList(listElement, items, renderItem, emptyMessage) {
  if (!listElement) return;
  listElement.innerHTML = '';
  if (!items || items.length === 0) {
    renderPlaceholder(listElement, emptyMessage);
    return;
  }
  for (const item of items) {
    const node = renderItem(item);
    if (node) listElement.appendChild(node);
  }
}

export function hydrateStudentSelector(roster) {
  if (!studentSelector) return;
  const students = Array.isArray(roster)
    ? roster.filter((item) => item && (item.studentId || item.platformStudentId))
    : [];
  studentSelector.innerHTML = '';
  if (students.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No active learners yet';
    studentSelector.appendChild(option);
    studentSelector.disabled = true;
    return;
  }
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a learner';
  studentSelector.appendChild(placeholder);

  for (const student of students) {
    const option = document.createElement('option');
    const id = student.studentId ?? student.platformStudentId ?? student.id;
    option.value = id;
    option.textContent = student.name ? student.name : String(id ?? '').slice(0, 8) + '…';
    option.dataset.platformId = student.platformStudentId ?? '';
    studentSelector.appendChild(option);
  }

  const existing = students.some((student) => student.studentId === state.currentStudentId)
    ? state.currentStudentId
    : students[0].studentId;
  state.currentStudentId = existing ?? null;
  if (existing) {
    studentSelector.value = existing;
  }
  studentSelector.disabled = !state.session.loggedIn;
}

export function updatePlanControlsAvailability() {
  const hasStudent = Boolean(state.currentStudentId);
  const planReady = state.currentPlanSnapshot !== null;
  if (studentSelector) {
    studentSelector.disabled = !state.session.loggedIn || state.rosterCache.length === 0;
  }
  const canEdit = state.session.loggedIn && hasStudent && planReady && !state.planBusy;
  if (planEditor) {
    planEditor.disabled = !canEdit;
  }
  if (planSaveDraftButton) {
    planSaveDraftButton.disabled = !(state.session.loggedIn && hasStudent) || state.planBusy;
  }
  if (planPublishButton) {
    planPublishButton.disabled = !(state.session.loggedIn && hasStudent) || state.planBusy;
  }
  if (refreshButton) {
    refreshButton.disabled =
      !state.session.loggedIn || state.planBusy || state.busy || Boolean(state.activeRefreshJobId);
  }
}

export { sendDefaultText };
