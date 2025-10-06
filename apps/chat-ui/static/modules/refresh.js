import { state } from './state.js';
import { refs } from './dom.js';
import { renderRefreshProgress } from './insights.js';
import { updatePlanControlsAvailability } from './plan.js';
import { loadWorkspaceInsights } from './workspace.js';

const { refreshButton, refreshStatus } = refs;

function stopPolling(message) {
  if (state.refreshPollTimer) {
    window.clearInterval(state.refreshPollTimer);
    state.refreshPollTimer = null;
  }
  state.activeRefreshJobId = null;
  state.refreshStudentStatuses.clear();
  renderRefreshProgress([], message ?? 'No refresh running.');
  updatePlanControlsAvailability();
}

async function pollOnce() {
  if (!state.activeRefreshJobId) return;
  try {
    const response = await fetch(
      `/api/platform-sync/refresh/status?jobId=${encodeURIComponent(state.activeRefreshJobId)}`,
    );
    if (!response.ok) {
      throw new Error('Failed to fetch refresh status');
    }
    const payload = await response.json();
    const job = payload?.job;
    if (!job) {
      stopPolling('Refresh job not found.');
      if (refreshStatus) refreshStatus.textContent = 'Refresh job not found.';
      return;
    }
    renderRefreshProgress(job.students ?? [], job.status === 'running' ? 'Refreshing…' : null);
    if (refreshStatus) {
      if (job.status === 'running' || job.status === 'pending') {
        refreshStatus.textContent = 'Refreshing platform data…';
      } else if (job.status === 'completed') {
        refreshStatus.textContent = `Refresh complete: ${job.summary.studentsProcessed} students updated.`;
      } else if (job.status === 'failed') {
        refreshStatus.textContent = job.error ? `Refresh failed: ${job.error}` : 'Refresh failed.';
      }
    }
    if (job.status === 'completed') {
      stopPolling('Refresh complete.');
      await loadWorkspaceInsights({ silent: true });
    } else if (job.status === 'failed') {
      stopPolling('Refresh failed.');
    }
  } catch (err) {
    console.error('Refresh status polling failed', err);
    stopPolling('Refresh status unavailable.');
    if (refreshStatus) {
      refreshStatus.textContent = err instanceof Error ? err.message : 'Unable to track refresh status.';
    }
  }
}

export async function triggerPlatformRefresh() {
  if (!refreshButton || state.activeRefreshJobId) return;
  refreshButton.disabled = true;
  if (refreshStatus) {
    refreshStatus.textContent = 'Starting refresh…';
  }
  renderRefreshProgress([], 'Preparing refresh…');
  try {
    const response = await fetch('/api/platform-sync/refresh/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody?.error ?? 'Refresh failed to start');
    }
    const payload = await response.json().catch(() => ({}));
    const jobId = payload?.jobId;
    const job = payload?.job;
    if (!jobId) {
      throw new Error('Refresh job missing identifier');
    }
    state.activeRefreshJobId = jobId;
    renderRefreshProgress(job?.students ?? [], 'Refreshing…');
    if (refreshStatus) {
      refreshStatus.textContent = 'Refreshing platform data…';
    }
    updatePlanControlsAvailability();
    await pollOnce();
    state.refreshPollTimer = window.setInterval(pollOnce, 2000);
  } catch (err) {
    console.error('Platform refresh failed to start', err);
    if (refreshStatus) {
      refreshStatus.textContent = err instanceof Error ? err.message : 'Refresh failed.';
    }
    stopPolling('No refresh running.');
  } finally {
    updatePlanControlsAvailability();
  }
}

export { stopPolling as stopRefreshPolling, pollOnce as pollRefreshJobOnce };
