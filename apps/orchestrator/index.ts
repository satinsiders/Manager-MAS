import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import {
  LESSON_PICKER_URL,
  DISPATCHER_URL,
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
      url: DISPATCHER_URL,
      label: 'dispatcher',
      buildBody: (student, ctx) =>
        ctx?.units && ctx.units.length > 0
          ? { student_id: student.id, units: ctx.units, ...(ctx?.decision_id ? { decision_id: ctx.decision_id } : {}) }
          : ctx?.minutes
          ? {
              student_id: student.id,
              minutes: ctx.minutes,
              ...(ctx.next_lesson_id ? { next_lesson_id: ctx.next_lesson_id } : {}),
              ...(ctx?.decision_id ? { decision_id: ctx.decision_id } : {}),
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
                    if (ctx?.next_lesson_id) {
                      const { data: lessonRow } = await supabase
                        .from('lessons')
                        .select('topic')
                        .eq('id', ctx.next_lesson_id)
                        .single();
                      decision_question_type = lessonRow?.topic ?? null;
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
                          ? { minutes: ctx.minutes }
                          : decision_type === 'dispatch_units'
                          ? { units_count: (ctx.units || []).length }
                          : { action: ctx?.action },
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
