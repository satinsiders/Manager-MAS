import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';
import {
  LESSON_PICKER_URL,
  DISPATCHER_URL,
  ASSIGNMENTS_URL,
  DATA_AGGREGATOR_URL,
  CURRICULUM_EDITOR_URL,
  QA_FORMATTER_URL,
  ORCHESTRATOR_SECRET,
} from '../../packages/shared/config';
import { callWithRetry } from '../../packages/shared/retry';
import { notify } from '../../packages/shared/notify';
import { readDraft, writeDraft, deleteDraft } from '../../packages/shared/memory';

type StepDescriptor<T, C = any> = {
  url: string;
  label: string;
  buildBody: (arg: T, context?: C) => any;
};

function buildDailySteps(): StepDescriptor<{ id: number; current_curriculum_version: number }, any>[] {
  const steps: StepDescriptor<{ id: number; current_curriculum_version: number }, any>[] = [];
  const platformSyncUrl = process.env.PLATFORM_SYNC_URL;
  if (platformSyncUrl) {
    steps.push({
      url: platformSyncUrl,
      label: 'platform-sync',
      buildBody: () => ({})
    });
  }
  steps.push(
    {
      url: LESSON_PICKER_URL,
      label: 'lesson-picker',
      buildBody: (student) => ({
        student_id: student.id,
        curriculum_version: student.current_curriculum_version
      })
    },
    {
      url: ASSIGNMENTS_URL,
      label: 'assignments',
      buildBody: (student, ctx) => {
        if (!ctx) return undefined;
        const hasUnits = Array.isArray(ctx.units) && ctx.units.length > 0;
        const hasMinutes = typeof ctx.minutes === 'number' && ctx.minutes > 0;
        if (!hasUnits && !hasMinutes) return undefined;
        return {
          student_id: student.id,
          study_plan_version: student.current_curriculum_version,
          units: hasUnits ? ctx.units : undefined,
          minutes: hasMinutes ? ctx.minutes : undefined,
          decision_id: ctx.decision_id ?? null,
          next_curriculum_id: ctx.next_curriculum_id ?? null,
          reason: ctx.reason ?? null,
        };
      },
    },
    {
      url: DISPATCHER_URL,
      label: 'dispatcher',
      buildBody: (student, ctx) =>
        ctx?.units && ctx.units.length > 0
          ? {
              student_id: student.id,
              units: ctx.units,
              ...(ctx?.decision_id ? { decision_id: ctx.decision_id } : {}),
              ...(ctx?.next_curriculum_id ? { next_curriculum_id: ctx.next_curriculum_id } : {}),
              ...(ctx?.reason ? { reason: ctx.reason } : {}),
            }
          : ctx?.minutes
          ? {
              student_id: student.id,
              minutes: ctx.minutes,
              ...(ctx.next_curriculum_id ? { next_curriculum_id: ctx.next_curriculum_id } : {}),
              ...(ctx?.decision_id ? { decision_id: ctx.decision_id } : {}),
              ...(ctx?.reason ? { reason: ctx.reason } : {}),
            }
          : undefined
    }
  );
  return steps;
}

const WEEKLY_STEPS: StepDescriptor<void>[] = [
  { url: DATA_AGGREGATOR_URL, label: 'data-aggregator', buildBody: () => undefined },
  { url: CURRICULUM_EDITOR_URL, label: 'curriculum-editor', buildBody: () => undefined }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${ORCHESTRATOR_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const runType = req.query.run_type as string;
  if (runType !== 'daily' && runType !== 'weekly') {
    res.status(400).json({ error: 'invalid run_type' });
    return;
  }

  const usedDraftKeys = new Set<string>();

  try {
    if (runType === 'daily') {
      const { data: students } = await supabase
        .from('students')
        .select('id, current_curriculum_version')
        .eq('active', true);

      for (const student of students ?? []) {
        let lastResp: any = true;
        const DAILY_STEPS = buildDailySteps();
        for (let i = 0; i < DAILY_STEPS.length; i++) {
          if (!lastResp) break;
          const step = DAILY_STEPS[i];
          const prev = DAILY_STEPS[i - 1];
          const context = prev
            ? await readDraft(`${prev.label}:${student.id}`)
            : undefined;
          const body = step.buildBody(student, context);
          if (!body) {
            lastResp = null;
            break;
          }
          lastResp = await callWithRetry(
            step.url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            },
            runType,
            `${step.label}:${student.id}`,
            3,
            'orchestrator_log'
          );
          if (lastResp) {
            try {
              const ctx = await lastResp.json();
              // Write a MAS decision log after lesson-picker result
              if (step.label === 'lesson-picker' && ctx) {
                try {
                  const decision_type = ctx?.units && ctx.units.length > 0
                    ? 'dispatch_units'
                    : ctx?.minutes
                    ? 'dispatch_minutes'
                    : ctx?.action === 'request_new_curriculum'
                    ? 'assign_new'
                    : 'continue';
                  // Fetch policy version from current study plan metadata
                  let policy_version: string | null = null;
                  let decision_question_type: string | null = null;
                  try {
                    const { data: plan } = await supabase
                      .from('study_plans')
                      .select('study_plan')
                      .eq('student_id', (student as any).id)
                      .eq('version', (student as any).current_curriculum_version)
                      .single();
                    const sp: any = plan?.study_plan ?? {};
                    policy_version =
                      sp?.metadata?.policy_version ??
                      sp?.metadata?.policy?.version ??
                      sp?.policy_version ??
                      null;
                  if (ctx?.question_type) {
                    decision_question_type = ctx.question_type;
                  } else if (ctx?.next_curriculum_id) {
                    const { data: catalogRow } = await supabase
                      .from('curriculum_catalog')
                      .select('question_types(canonical_path)')
                      .eq('external_curriculum_id', ctx.next_curriculum_id)
                      .single();
                    decision_question_type =
                      (catalogRow as any)?.question_types?.canonical_path ?? null;
                  }
                  } catch {
                    /* ignore */
                  }
                  const { data: dec } = await supabase
                    .from('mas_decisions')
                    .insert({
                      student_id: (student as any).id,
                      study_plan_version: (student as any).current_curriculum_version,
                      question_type: decision_question_type ?? undefined,
                      decision_type,
                      inputs: {
                        context: ctx,
                      },
                      expected_outcome:
                        decision_type === 'dispatch_minutes'
                          ? {
                              minutes: ctx.minutes,
                              curriculum_id: ctx.next_curriculum_id ?? undefined,
                              reason: ctx.reason ?? undefined,
                            }
                          : decision_type === 'dispatch_units'
                          ? {
                              units_count: (ctx.units || []).length,
                              curriculum_id: ctx.next_curriculum_id ?? undefined,
                              reason: ctx.reason ?? undefined,
                            }
                          : { action: ctx?.action, reason: ctx.reason ?? undefined },
                      policy_version,
                    })
                    .select('id')
                    .single();
                  if (dec?.id) {
                    ctx.decision_id = dec.id;
                  }
                } catch {
                  /* ignore logging errors */
                }
              }
              if (ctx?.action === 'request_new_curriculum') {
                await callWithRetry(
                  CURRICULUM_EDITOR_URL,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: student.id })
                  },
                  runType,
                  `curriculum-editor:${student.id}`,
                  3,
                  'orchestrator_log'
                );
                lastResp = null;
                break;
              }
              const key = `${step.label}:${student.id}`;
              await writeDraft(key, ctx);
              usedDraftKeys.add(key);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } else {
      for (const step of WEEKLY_STEPS) {
        const body = step.buildBody(undefined);
        await callWithRetry(
          step.url,
          {
            method: 'POST',
            ...(body
              ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
              : {})
          },
          runType,
          step.label,
          3,
          'orchestrator_log'
        );
      }

      const { data: drafts } = await supabase
        .from('curricula_drafts')
        .select('student_id, version, qa_user');

      for (const draft of drafts ?? []) {
        const resp = await callWithRetry(
          QA_FORMATTER_URL,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: draft.student_id,
              version: draft.version,
              qa_user: draft.qa_user ?? 'system'
            })
          },
          runType,
          `qa-formatter:${draft.student_id}:${draft.version}`,
          3,
          'orchestrator_log'
        );

        if (resp?.ok) {
          try {
            await supabase
              .from('curricula_drafts')
              .delete()
              .eq('student_id', draft.student_id)
              .eq('version', draft.version);
          } catch {
            /* ignore */
          }
        }
      }
    }
    await notify(`Orchestrator ${runType} run succeeded`, 'orchestrator');
    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    await notify(
      `Orchestrator ${runType} run failed: ${err.message}`,
      'orchestrator'
    );
    res.status(500).json({ error: 'orchestration failed' });
  } finally {
    if (runType === 'daily') {
      for (const key of usedDraftKeys) {
        await deleteDraft(key);
      }
    }
  }
}
