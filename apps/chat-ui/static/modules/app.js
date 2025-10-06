import { state } from './state.js';
import { initializeComposer } from './chat.js';
import { setPlanHooks } from './plan.js';
import { setWorkspaceHooks, loadWorkspaceInsights } from './workspace.js';
import { registerEventListeners } from './events.js';
import { refreshSession, ensurePlanForSelection } from './session.js';
import { updatePlanControlsAvailability } from './plan.js';

export function initializeApp() {
  initializeComposer();
  registerEventListeners();

  setPlanHooks({
    onMutated: async () => {
      await loadWorkspaceInsights({ silent: true });
      await ensurePlanForSelection();
    },
  });

  setWorkspaceHooks({
    onRosterHydrated: ensurePlanForSelection,
  });

  refreshSession({ silent: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshSession({ silent: true });
      if (state.session.loggedIn) {
        void loadWorkspaceInsights({ silent: true }).then(() => ensurePlanForSelection());
      }
    }
  });

  updatePlanControlsAvailability();
}
