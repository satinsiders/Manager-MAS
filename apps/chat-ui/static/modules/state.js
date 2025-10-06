export const state = {
  dialogue: [],
  busy: false,
  assistantStreams: new Map(),
  assistantPlaceholder: null,
  toolBubbles: new Map(),
  session: { loggedIn: false, mode: 'interactive', email: null },
  previousSessionLoggedIn: false,
  rosterCache: [],
  contextRefreshTimer: null,
  currentStudentId: null,
  currentPlanSnapshot: null,
  currentDraftVersion: null,
  currentPlanStudentId: null,
  planBusy: false,
  planDraftData: new Map(),
  currentPlanTemplate: null,
  activeRefreshJobId: null,
  refreshPollTimer: null,
  studentListCollapsed: false,
  refreshStudentStatuses: new Map(),
};

export const defaultSessionState = { loggedIn: false, mode: 'interactive', email: null };
