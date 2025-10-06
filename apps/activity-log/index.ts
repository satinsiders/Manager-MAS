import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';

function sendError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

function normalizeStudentId(value: unknown): string | null {
  if (!value) return null;
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const trimmed = first.trim();
  return trimmed.length ? trimmed : null;
}

function isoString(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

type ActivityEvent = {
  id: string;
  type: string;
  studentId: string | null;
  studyPlanVersion?: number | null;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type ActivityLogDeps = {
  supabaseClient: typeof supabase;
};

export function createActivityLogHandler({ supabaseClient }: ActivityLogDeps) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendError(res, 405, 'Method not allowed.');
      return;
    }

    const studentIdFilter = normalizeStudentId(req.query.student_id ?? req.query.studentId);
    const limitRaw = req.query.limit ?? '200';
    const limit = (() => {
      const parsed = Number(limitRaw);
      if (!Number.isFinite(parsed)) return 200;
      return Math.max(1, Math.min(500, Math.floor(parsed)));
    })();
    const sinceRaw = req.query.since ?? req.query.sinceDate;
    const since = sinceRaw ? isoString(String(sinceRaw)) : null;

    const filters = (builder: any, column: string) => {
      if (studentIdFilter) builder = builder.eq('student_id', studentIdFilter);
      if (since) builder = builder.gte(column, since);
      return builder;
    };

    const [decisions, actions, planPublishes, planDrafts, dispatchLog] = await Promise.all([
      filters(
        supabaseClient
          .from('mas_decisions')
          .select('id, student_id, study_plan_version, decision_type, policy_version, decided_at')
          .order('decided_at', { ascending: false })
          .limit(limit),
        'decided_at',
      ),
      filters(
        supabaseClient
          .from('mas_actions')
          .select('id, decision_id, action_type, status, requested_minutes, actual_minutes, attempted_at')
          .order('attempted_at', { ascending: false })
          .limit(limit),
        'attempted_at',
      ),
      filters(
        supabaseClient
          .from('study_plans')
          .select('id, student_id, version, approved_at, qa_user')
          .order('approved_at', { ascending: false })
          .limit(limit),
        'approved_at',
      ),
      filters(
        supabaseClient
          .from('study_plan_drafts')
          .select('student_id, version, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
        'created_at',
      ),
      filters(
        supabaseClient
          .from('dispatch_log')
          .select('id, student_id, study_plan_id, minutes, status, sent_at')
          .order('sent_at', { ascending: false })
          .limit(limit),
        'sent_at',
      ),
    ]);

    for (const response of [decisions, actions, planPublishes, planDrafts, dispatchLog]) {
      if ((response as any).error) {
        sendError(res, 500, (response as any).error.message);
        return;
      }
    }

    const events: ActivityEvent[] = [];
    const decisionLookup = new Map<string, { studentId: string | null; version: number | null }>();

    for (const decision of decisions.data ?? []) {
      if (!decision.decided_at) continue;
      decisionLookup.set(decision.id, {
        studentId: decision.student_id ?? null,
        version: decision.study_plan_version ?? null,
      });
      events.push({
        id: `decision:${decision.id}`,
        type: 'decision',
        studentId: decision.student_id ?? null,
        studyPlanVersion: decision.study_plan_version ?? null,
        occurredAt: new Date(decision.decided_at).toISOString(),
        summary: `Policy ${decision.policy_version ?? 'n/a'} → ${decision.decision_type}`,
      });
    }

    for (const action of actions.data ?? []) {
      if (!action.attempted_at) continue;
      const related = action.decision_id ? decisionLookup.get(action.decision_id) : undefined;
      events.push({
        id: `action:${action.id}`,
        type: 'action',
        studentId: related?.studentId ?? null,
        studyPlanVersion: related?.version ?? null,
        occurredAt: new Date(action.attempted_at).toISOString(),
        summary: `${action.action_type} (${action.status ?? 'unknown'})`,
        metadata: {
          requestedMinutes: action.requested_minutes ?? null,
          actualMinutes: action.actual_minutes ?? null,
          decisionId: action.decision_id ?? null,
        },
      });
    }

    for (const plan of planPublishes.data ?? []) {
      if (!plan.approved_at) continue;
      events.push({
        id: `plan:${plan.id}`,
        type: 'study_plan_published',
        studentId: plan.student_id ?? null,
        studyPlanVersion: plan.version ?? null,
        occurredAt: new Date(plan.approved_at).toISOString(),
        summary: `Plan v${plan.version ?? '?'} approved by ${plan.qa_user ?? 'unknown'}`,
      });
    }

    for (const draft of planDrafts.data ?? []) {
      if (!draft.created_at) continue;
      events.push({
        id: `draft:${draft.student_id}:${draft.version}`,
        type: 'study_plan_draft',
        studentId: draft.student_id ?? null,
        studyPlanVersion: draft.version ?? null,
        occurredAt: new Date(draft.created_at).toISOString(),
        summary: `Draft v${draft.version ?? '?'} saved`,
      });
    }

    for (const row of dispatchLog.data ?? []) {
      if (!row.sent_at) continue;
      events.push({
        id: `dispatch:${row.id}`,
        type: 'dispatch',
        studentId: row.student_id ?? null,
        studyPlanVersion: null,
        occurredAt: new Date(row.sent_at).toISOString(),
        summary: `Dispatch ${row.status ?? 'unknown'} (${row.minutes ?? 0} minutes)`,
        metadata: {
          studyPlanId: row.study_plan_id ?? null,
        },
      });
    }

    events.sort((a, b) => (a.occurredAt > b.occurredAt ? -1 : a.occurredAt < b.occurredAt ? 1 : 0));

    const sliced = events.slice(0, limit);

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      limit,
      total: sliced.length,
      events: sliced,
    });
  } catch (err: any) {
    console.error('activity log handler failed', err);
    sendError(res, 500, err?.message ?? 'activity_log_failed');
  }
  };
}

const defaultHandler = createActivityLogHandler({ supabaseClient: supabase });

export default defaultHandler;

export const config = {
  api: {
    bodyParser: false,
  },
};
