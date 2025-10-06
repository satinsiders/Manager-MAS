import { state } from './state.js';
import { refs } from './dom.js';
import { renderPlaceholder, formatDateLabel } from './utils.js';

const {
  planSummary,
  planEditor,
  planSaveDraftButton,
  planPublishButton,
  planStatus,
  studentSelector,
  refreshButton,
  refreshStatus,
} = refs;

let onPlanMutated = null;

async function notifyPlanMutation(reason) {
  if (typeof onPlanMutated === 'function') {
    try {
      await onPlanMutated(reason);
    } catch (err) {
      console.error('Plan mutation hook failed', err);
    }
  }
}

export function setPlanHooks({ onMutated } = {}) {
  onPlanMutated = typeof onMutated === 'function' ? onMutated : null;
}

function clonePlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(plan));
  } catch {
    return null;
  }
}

function serializePlanToText(plan) {
  if (!plan || typeof plan !== 'object') return '';
  const lines = [];
  if (plan.notes) {
    lines.push(String(plan.notes));
  }
  if (plan.daily_minutes_target != null) {
    lines.push('', `Daily minutes: ${plan.daily_minutes_target}`);
  }
  if (Array.isArray(plan.objectives) && plan.objectives.length) {
    lines.push('', 'Objectives:');
    for (const objective of plan.objectives) {
      lines.push(`- ${objective}`);
    }
  }
  if (Array.isArray(plan.curricula) && plan.curricula.length) {
    lines.push('', 'Curricula:');
    for (const curriculum of plan.curricula) {
      const title = curriculum.title ?? curriculum.name ?? curriculum.id ?? 'Curriculum';
      const minutes = curriculum.minutes_recommended ?? curriculum.duration_minutes ?? curriculum.minutes ?? null;
      lines.push(`- ${title}${minutes ? ` | ${minutes} min` : ''}`);
    }
  }
  return lines.join('\n').trim();
}

function parsePlainTextPlan(raw) {
  const lines = raw.split(/\r?\n/);
  const notesLines = [];
  const objectives = [];
  let dailyMinutes = null;
  let section = 'notes';
  for (const original of lines) {
    const line = original.trim();
    if (!line) {
      if (section === 'notes') notesLines.push('');
      continue;
    }
    if (/^objectives?:/i.test(line)) {
      section = 'objectives';
      continue;
    }
    if (/^curricula?:/i.test(line)) {
      section = 'curricula';
      continue;
    }
    const dailyMatch = line.match(/^daily\s+minutes?:\s*(\d+)/i);
    if (dailyMatch) {
      dailyMinutes = Number(dailyMatch[1]);
      continue;
    }
    if (section === 'objectives') {
      const cleaned = line.replace(/^[-•\*]\s*/, '').trim();
      if (cleaned) objectives.push(cleaned);
      continue;
    }
    if (section === 'curricula') {
      continue;
    }
    notesLines.push(original);
  }
  return {
    notes: notesLines.join('\n').trim(),
    objectives,
    dailyMinutes: dailyMinutes != null && Number.isFinite(dailyMinutes) ? dailyMinutes : null,
  };
}

function loadPlanIntoEditor(planObject) {
  if (!planEditor) return;
  state.currentPlanTemplate = clonePlan(planObject);
  if (!planObject) {
    planEditor.value = '';
    return;
  }
  const text = serializePlanToText(planObject);
  planEditor.value = text || '';
}

export function renderPlanSummary(snapshot) {
  if (!planSummary) return;
  planSummary.innerHTML = '';
  state.planDraftData.clear();
  state.currentPlanSnapshot = snapshot ?? null;
  state.currentDraftVersion = null;
  state.currentPlanStudentId = snapshot ? state.currentStudentId : null;

  if (!snapshot) {
    renderPlaceholder(
      planSummary,
      state.currentStudentId ? 'Select a learner to view their plan.' : 'No learner selected.',
    );
    loadPlanIntoEditor(null);
    if (planStatus) {
      planStatus.textContent = '';
    }
    updatePlanControlsAvailability();
    return;
  }

  const plan = snapshot.active_plan?.study_plan ?? {};
  const header = document.createElement('h4');
  header.textContent = plan.notes ? plan.notes : 'Current plan';
  planSummary.appendChild(header);

  const detailList = document.createElement('dl');
  const appendDetail = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    detailList.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = value ?? '—';
    detailList.appendChild(dd);
  };

  appendDetail('Version', String(snapshot.active_plan?.version ?? plan.version ?? '—'));
  appendDetail('Daily minutes', plan.daily_minutes_target != null ? String(plan.daily_minutes_target) : '—');
  appendDetail('Objectives', Array.isArray(plan.objectives) && plan.objectives.length ? plan.objectives.join(', ') : '—');
  appendDetail('Curricula', Array.isArray(plan.curricula) ? String(plan.curricula.length) : '0');
  planSummary.appendChild(detailList);

  const progressRows = Array.isArray(snapshot.progress) ? snapshot.progress : [];
  if (progressRows.length) {
    const counts = progressRows.reduce((acc, row) => {
      const status = row.status ?? 'unknown';
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
    const masteryList = document.createElement('ul');
    masteryList.className = 'plan-mastery';
    for (const [status, count] of Object.entries(counts)) {
      const item = document.createElement('li');
      item.textContent = `${status.replace(/_/g, ' ')}: ${count}`;
      masteryList.appendChild(item);
    }
    planSummary.appendChild(masteryList);
  }

  const drafts = Array.isArray(snapshot.drafts) ? snapshot.drafts : [];
  const draftsContainer = document.createElement('div');
  draftsContainer.className = 'plan-drafts';
  if (drafts.length === 0) {
    const noDrafts = document.createElement('span');
    noDrafts.className = 'hub-footnote';
    noDrafts.textContent = 'No drafts saved for this student.';
    draftsContainer.appendChild(noDrafts);
  } else {
    for (const draft of drafts) {
      const version = draft.version;
      const planData = draft.study_plan ?? draft.curriculum ?? {};
      state.planDraftData.set(String(version), planData);
      const label = document.createElement('label');
      label.className = 'plan-draft-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'plan-draft-option';
      input.value = String(version);
      input.addEventListener('change', () => selectDraftVersion(version));
      const text = document.createElement('span');
      const stamp = formatDateLabel(draft.created_at ?? draft.createdAt ?? null);
      text.textContent = `Draft v${version} • ${stamp}`;
      label.appendChild(input);
      label.appendChild(text);
      draftsContainer.appendChild(label);
    }
  }
  planSummary.appendChild(draftsContainer);

  const links = document.createElement('div');
  links.className = 'plan-links';
  const loadActiveButton = document.createElement('button');
  loadActiveButton.type = 'button';
  loadActiveButton.className = 'ghost-button';
  loadActiveButton.textContent = 'Load active plan';
  loadActiveButton.addEventListener('click', () => {
    const radios = planSummary.querySelectorAll('input[name="plan-draft-option"]');
    radios.forEach((radio) => {
      radio.checked = false;
    });
    selectDraftVersion(null);
  });
  links.appendChild(loadActiveButton);
  planSummary.appendChild(links);

  loadPlanIntoEditor(plan);
  updatePlanControlsAvailability();
  if (planStatus) planStatus.textContent = '';
}

export function selectDraftVersion(version) {
  state.currentDraftVersion = version != null ? Number(version) : null;
  if (planStatus) {
    planStatus.textContent = state.currentDraftVersion != null ? `Loaded draft v${state.currentDraftVersion}` : 'Loaded active plan.';
  }
  if (state.currentDraftVersion != null) {
    const draftPlan = state.planDraftData.get(String(state.currentDraftVersion));
    loadPlanIntoEditor(draftPlan ?? {});
  } else if (state.currentPlanSnapshot?.active_plan?.study_plan) {
    loadPlanIntoEditor(state.currentPlanSnapshot.active_plan.study_plan);
  } else if (planEditor) {
    planEditor.value = '';
    state.currentPlanTemplate = null;
  }
  updatePlanControlsAvailability();
}

export function parsePlanEditorValue() {
  if (!planEditor) {
    throw new Error('Plan editor unavailable.');
  }
  const raw = planEditor.value.trim();
  if (!raw) {
    return state.currentPlanTemplate ? clonePlan(state.currentPlanTemplate) ?? {} : {};
  }
  try {
    if (raw.startsWith('{') || raw.startsWith('[')) {
      return JSON.parse(raw);
    }
  } catch (err) {
    throw new Error(`Plan JSON invalid: ${(err && err.message) || err}`);
  }
  const base = state.currentPlanTemplate ? clonePlan(state.currentPlanTemplate) ?? {} : {};
  const parsed = parsePlainTextPlan(planEditor.value);
  if (parsed.notes !== undefined) {
    base.notes = parsed.notes;
  }
  if (parsed.objectives.length) {
    base.objectives = parsed.objectives;
  }
  if (parsed.dailyMinutes !== null) {
    base.daily_minutes_target = parsed.dailyMinutes;
  }
  return base;
}

export async function loadStudentPlan(studentId, options = {}) {
  if (!studentId || !state.session.loggedIn) {
    renderPlanSummary(null);
    return;
  }
  state.planBusy = true;
  updatePlanControlsAvailability();
  if (planSummary) {
    planSummary.innerHTML = '';
    renderPlaceholder(planSummary, 'Loading study plan…');
  }
  try {
    const params = new URLSearchParams({
      student_id: studentId,
      includeDrafts: 'true',
      includeProgress: 'true',
    });
    const response = await fetch(`/api/study-plans?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to load study plan');
    }
    const data = await response.json();
    renderPlanSummary(data?.snapshot ?? null);
    if (!options.silent && planStatus) {
      planStatus.textContent = 'Plan loaded.';
    }
  } catch (err) {
    console.error('Failed to load student plan', err);
    renderPlanSummary(null);
    if (planStatus) {
      planStatus.textContent = 'Unable to load study plan. Try again later.';
    }
  } finally {
    state.planBusy = false;
    updatePlanControlsAvailability();
  }
}

export async function handlePlanSaveDraft() {
  if (!state.session.loggedIn || !state.currentStudentId) {
    return;
  }
  try {
    const planPayload = parsePlanEditorValue();
    state.planBusy = true;
    updatePlanControlsAvailability();
    const response = await fetch('/api/study-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: state.currentStudentId, plan: planPayload }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error ?? 'Failed to save draft');
    }
    if (planStatus) {
      planStatus.textContent = 'Draft saved successfully.';
    }
    await loadStudentPlan(state.currentStudentId, { silent: true });
    await notifyPlanMutation('draftSaved');
  } catch (err) {
    if (planStatus) {
      planStatus.textContent = err?.message ?? 'Unable to save draft.';
    }
  } finally {
    state.planBusy = false;
    updatePlanControlsAvailability();
  }
}

export async function handlePlanPublish() {
  if (!state.session.loggedIn || !state.currentStudentId) {
    return;
  }
  const body = { studentId: state.currentStudentId };
  if (state.currentDraftVersion != null) {
    body.draftVersion = state.currentDraftVersion;
    body.deleteDraft = true;
  } else {
    try {
      body.plan = parsePlanEditorValue();
    } catch (err) {
      if (planStatus) {
        planStatus.textContent = err?.message ?? 'Plan JSON invalid.';
      }
      return;
    }
  }
  try {
    state.planBusy = true;
    updatePlanControlsAvailability();
    const response = await fetch('/api/study-plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error ?? 'Failed to publish plan');
    }
    state.currentDraftVersion = null;
    if (planStatus) {
      planStatus.textContent = 'Study plan published.';
    }
    await loadStudentPlan(state.currentStudentId, { silent: true });
    await notifyPlanMutation('published');
  } catch (err) {
    if (planStatus) {
      planStatus.textContent = err?.message ?? 'Unable to publish plan.';
    }
  } finally {
    state.planBusy = false;
    updatePlanControlsAvailability();
  }
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

export function getSendDefaultText() {
  return sendDefaultText;
}
