import { DEFAULT_TEMPERATURE, GPT_MINUTES_OPTIONS, MAX_EVIDENCE_ITEMS, MAX_UNITS_OVERRIDE_PREVIEW } from './constants';
import { CurriculumOption, DataInventory, ModelDecisionResult, StudentContext } from './types';

export function buildSystemPrompt(): string {
  return [
    'You are MAS Lesson Picker, an elite SAT tutor with a god-level learning philosophy.',
    'Use the JSON context to choose the best curriculum and minutes for tomorrow.',
    'Ground every conclusion in the unit-level evidence (correctness, confidence, streaks).',
    'Balance mastery progression, variety, remaining minutes, and student preferences before deciding.',
    'Default to dispatching minutes. Only request dispatch_units when a precise override is essential and request_new_curriculum when no listed option can produce progress.',
    'Return strict JSON shaped as {"decision": {...}} using the schema described below.',
    'decision.action: "dispatch_minutes" | "dispatch_units" | "request_new_curriculum"',
    'decision.curriculum_id: required unless requesting a new curriculum.',
    'decision.minutes: integer (multiples of 5) when dispatching minutes.',
    'decision.units_override: optional array describing unit overrides when dispatching units.',
    'decision.reason: concise summary tied to explicit evidence.',
    'decision.evidence: array of strings citing concrete data (dates, unit ids, streaks, confidence).',
    'decision.confidence: decimal between 0 and 1 representing your confidence.',
    'Never fabricate data or ignore contradictory signals.',
  ].join('\n');
}

export function buildDecisionInput(
  student_profile: StudentContext,
  curriculum_options: CurriculumOption[],
  data_inventory: DataInventory,
) {
  return {
    student_profile,
    curriculum_options,
    policies: {
      minute_choices: GPT_MINUTES_OPTIONS,
      default_minutes: student_profile.suggested_minutes,
      minute_floor: Math.min(...GPT_MINUTES_OPTIONS),
      minute_ceiling: Math.max(...GPT_MINUTES_OPTIONS),
    },
    data_inventory,
  };
}

type ParseParams = {
  responseText: string;
  candidateIds: Set<string>;
  defaultCurriculumId: string;
  defaultMinutes: number;
};

export function parseDecision({
  responseText,
  candidateIds,
  defaultCurriculumId,
  defaultMinutes,
}: ParseParams): ModelDecisionResult {
  let parsed: any = {};
  try {
    parsed = JSON.parse(responseText || '{}');
  } catch {
    parsed = {};
  }
  const decision = parsed?.decision ?? parsed?.result ?? parsed;

  let action: ModelDecisionResult['action'] = 'dispatch_minutes';
  let curriculumId: string | null = defaultCurriculumId;
  let minutes: number | null = defaultMinutes;
  let reason: string | null = null;
  let evidence: string[] = [];
  let unitsOverride: any[] | null = null;

  if (decision && typeof decision === 'object') {
    if (typeof decision.action === 'string') {
      if (
        decision.action === 'dispatch_minutes' ||
        decision.action === 'dispatch_units' ||
        decision.action === 'request_new_curriculum'
      ) {
        action = decision.action;
      }
    }

    const reasonText =
      typeof decision.reason === 'string'
        ? decision.reason
        : typeof decision.rationale?.summary === 'string'
        ? decision.rationale.summary
        : null;
    if (reasonText) reason = reasonText.trim();

    if (Array.isArray(decision.evidence)) {
      evidence = decision.evidence
        .map((value: any) => (typeof value === 'string' ? value.trim() : null))
        .filter((value: string | null): value is string => Boolean(value))
        .slice(0, MAX_EVIDENCE_ITEMS);
    }

    if (Array.isArray(decision.units_override)) {
      unitsOverride = decision.units_override.slice(0, MAX_UNITS_OVERRIDE_PREVIEW);
    }

    if (action !== 'request_new_curriculum') {
      if (typeof decision.curriculum_id === 'string' && candidateIds.has(decision.curriculum_id)) {
        curriculumId = decision.curriculum_id;
      }
      if (decision.minutes != null && Number.isFinite(Number(decision.minutes))) {
        const rounded = Math.max(5, Math.round(Number(decision.minutes) / 5) * 5);
        if (GPT_MINUTES_OPTIONS.includes(rounded)) {
          minutes = rounded;
        }
      }
    } else {
      curriculumId = null;
      minutes = null;
    }
  }

  if (evidence.length) {
    reason = reason
      ? `${reason} | Evidence: ${evidence.join(' | ')}`
      : `Evidence: ${evidence.join(' | ')}`;
  }

  if (action === 'dispatch_units' && unitsOverride?.length) {
    const preview = JSON.stringify(unitsOverride);
    reason = reason
      ? `${reason} | Units override suggested: ${preview}`
      : `Units override suggested: ${preview}`;
  }

  return {
    action,
    curriculum_id: curriculumId,
    minutes,
    reason,
    evidence,
    units_override: unitsOverride,
  };
}

export function decisionTemperature() {
  return DEFAULT_TEMPERATURE;
}
