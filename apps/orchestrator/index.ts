import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import {
  LESSON_PICKER_URL,
  DISPATCHER_URL,
  DATA_AGGREGATOR_URL,
  CURRICULUM_MODIFIER_URL,
  QA_FORMATTER_URL
} from '../../packages/shared/config';
import { callWithRetry } from '../../packages/shared/retry';
import { notify } from '../../packages/shared/notify';

type StepDescriptor<T, C = any> = {
  url: string;
  label: string;
  buildBody: (arg: T, context?: C) => any;
};

const DAILY_STEPS: StepDescriptor<{ id: number }, any>[] = [
  {
    url: LESSON_PICKER_URL,
    label: 'lesson-picker',
    buildBody: (student) => ({ student_id: student.id })
  },
  {
    url: DISPATCHER_URL,
    label: 'dispatcher',
    buildBody: (_student, ctx) => (ctx?.log_id ? { log_id: ctx.log_id } : undefined)
  }
];

const WEEKLY_STEPS: StepDescriptor<void>[] = [
  { url: DATA_AGGREGATOR_URL, label: 'data-aggregator', buildBody: () => undefined },
  { url: CURRICULUM_MODIFIER_URL, label: 'curriculum-modifier', buildBody: () => undefined },
  { url: QA_FORMATTER_URL, label: 'qa-formatter', buildBody: () => undefined }
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const runType = req.query.run_type as string;
  if (runType !== 'daily' && runType !== 'weekly') {
    res.status(400).json({ error: 'invalid run_type' });
    return;
  }

  try {
    if (runType === 'daily') {
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .eq('active', true);

      for (const student of students ?? []) {
        let lastResp: any = true;
        let context: any = undefined;
        for (const step of DAILY_STEPS) {
          if (!lastResp) break;
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
              context = await lastResp.json();
            } catch {
              context = undefined;
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
  }
}
