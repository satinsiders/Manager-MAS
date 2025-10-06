import { state } from './state.js';
import { refs } from './dom.js';
import {
  clearContextInsights,
  renderAlerts,
  renderDrafts,
  renderActivity,
  renderRefreshProgress,
  renderStudentList,
  hydrateStudentSelector,
} from './insights.js';
import { updatePlanControlsAvailability } from './plan.js';
import { setMetricValue, formatRelativeTimestamp } from './utils.js';

const { contextPanel, contextError, contextTimestamp } = refs;
const {
  metricActiveStudents,
  metricFlaggedStudents,
  metricIdleStudents,
  metricOpenDrafts,
} = refs;

let afterHydrateCallback = null;

export function setWorkspaceHooks({ onRosterHydrated } = {}) {
  afterHydrateCallback = typeof onRosterHydrated === 'function' ? onRosterHydrated : null;
}

export async function loadWorkspaceInsights(options = {}) {
  if (!state.session.loggedIn) {
    clearContextInsights();
    return;
  }
  if (state.contextRefreshTimer) {
    clearTimeout(state.contextRefreshTimer);
    state.contextRefreshTimer = null;
  }
  if (contextError) {
    contextError.classList.add('hidden');
  }
  try {
    if (contextPanel) contextPanel.classList.add('loading');
    const [dashboardRes, activityRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/activity-log?limit=12'),
    ]);
    if (!dashboardRes.ok) {
      throw new Error('Failed to load dashboard insights');
    }
    const dashboardData = await dashboardRes.json();
    const activityData = activityRes.ok ? await activityRes.json() : { events: [] };

    setMetricValue(
      metricActiveStudents,
      typeof dashboardData?.totals?.activeStudents === 'number'
        ? String(dashboardData.totals.activeStudents)
        : '0',
    );
    setMetricValue(
      metricFlaggedStudents,
      typeof dashboardData?.totals?.flaggedStudents === 'number'
        ? String(dashboardData.totals.flaggedStudents)
        : '0',
    );
    setMetricValue(
      metricIdleStudents,
      typeof dashboardData?.totals?.idleStudents === 'number'
        ? String(dashboardData.totals.idleStudents)
        : '0',
    );
    setMetricValue(
      metricOpenDrafts,
      typeof dashboardData?.totals?.openDrafts === 'number'
        ? String(dashboardData.totals.openDrafts)
        : '0',
    );

    state.rosterCache = Array.isArray(dashboardData?.roster) ? dashboardData.roster : [];
    renderAlerts(dashboardData?.alerts ?? []);
    renderDrafts(dashboardData?.roster ?? []);
    renderActivity(activityData?.events ?? []);
    renderStudentList(state.rosterCache);
    hydrateStudentSelector(state.rosterCache);
    if (afterHydrateCallback) {
      await afterHydrateCallback(state.rosterCache);
    }

    if (contextTimestamp) {
      contextTimestamp.textContent = formatRelativeTimestamp(dashboardData?.generatedAt ?? null);
    }
  } catch (err) {
    console.error('Failed to load workspace insights', err);
    if (!options.silent && contextError) {
      contextError.textContent = err instanceof Error ? err.message : 'Unable to load insights.';
      contextError.classList.remove('hidden');
    }
  } finally {
    if (contextPanel) contextPanel.classList.remove('loading');
    state.contextRefreshTimer = window.setTimeout(
      () => loadWorkspaceInsights({ silent: true }),
      5 * 60 * 1000,
    );
    renderStudentList(state.rosterCache);
    updatePlanControlsAvailability();
  }
}
