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

type StepDescriptor<T> = {
  url: string;
  label: string;
  buildBody: (arg: T) => any;
};

const DAILY_STEPS: StepDescriptor<{ id: number }>[] = [
  {
    url: LESSON_PICKER_URL,
    label: 'lesson-picker',
    buildBody: (student) => ({ student_id: student.id })
  },
  {
    url: DISPATCHER_URL,
    label: 'dispatcher',
    buildBody: (student) => ({ student_id: student.id })
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
        for (const step of DAILY_STEPS) {
          if (!lastResp) break;
          const body = step.buildBody(student);
          lastResp = await callWithRetry(
            step.url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: body ? JSON.stringify(body) : undefined
            },
            runType,
            `${step.label}:${student.id}`
          );
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
          step.label
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
