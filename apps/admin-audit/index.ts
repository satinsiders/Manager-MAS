import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';

function isoOrNull(v?: string): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const student_id = (req.query.student_id as string) || undefined;
    const since = isoOrNull(req.query.since as string);
    const until = isoOrNull(req.query.until as string);
    const include_dispatch = req.query.include_dispatch === '1' || req.query.include_dispatch === 'true';
    const limit = Math.min(parseInt((req.query.limit as string) || '200', 10) || 200, 1000);

    let decisionsQuery = supabase
      .from('mas_decisions')
      .select('id, student_id, study_plan_version, question_type, decision_type, inputs, expected_outcome, policy_version, decided_at')
      .order('decided_at', { ascending: false })
      .limit(limit);
    if (student_id) decisionsQuery = decisionsQuery.eq('student_id', student_id);
    if (since) decisionsQuery = decisionsQuery.gte('decided_at', since);
    if (until) decisionsQuery = decisionsQuery.lte('decided_at', until);

    const { data: decisions } = await decisionsQuery;
    const decisionIds = (decisions ?? []).map((d: any) => d.id);

    let actions: any[] = [];
    if (decisionIds.length > 0) {
      const { data: acts } = await supabase
        .from('mas_actions')
        .select('id, decision_id, action_type, status, platform_curriculum_id, platform_student_curriculum_id, platform_bundle_ref, requested_minutes, actual_minutes, dispatch_log_id, attempted_at, request, response')
        .in('decision_id', decisionIds)
        .order('attempted_at', { ascending: false })
        .limit(5 * decisionIds.length);
      actions = acts ?? [];
    }

    let dispatches: any[] = [];
    if (include_dispatch) {
      let dispQuery = supabase
        .from('dispatch_log')
        .select('id, student_id, platform_curriculum_id, platform_student_curriculum_id, study_plan_id, question_type, requested_minutes, actual_minutes, minutes, unit_ids, status, sent_at, channel')
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (student_id) dispQuery = dispQuery.eq('student_id', student_id);
      if (since) dispQuery = dispQuery.gte('sent_at', since);
      if (until) dispQuery = dispQuery.lte('sent_at', until);
      const { data } = await dispQuery;
      dispatches = data ?? [];
    }

    res.status(200).json({
      decisions: decisions ?? [],
      actions,
      dispatches,
      count: {
        decisions: decisions?.length ?? 0,
        actions: actions.length,
        dispatches: dispatches.length,
      },
      filters: { student_id: student_id ?? null, since, until },
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'audit fetch failed' });
  }
}
