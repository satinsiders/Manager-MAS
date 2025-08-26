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
        const pickerResp = await callWithRetry(
          LESSON_PICKER_URL,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.id })
          },
          runType,
          `lesson-picker:${student.id}`
        );

        if (pickerResp) {
          await callWithRetry(
            DISPATCHER_URL,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ student_id: student.id })
            },
            runType,
            `dispatcher:${student.id}`
          );
        }
      }
    } else {
      await callWithRetry(
        DATA_AGGREGATOR_URL,
        { method: 'POST' },
        runType,
        'data-aggregator'
      );
      await callWithRetry(
        CURRICULUM_MODIFIER_URL,
        { method: 'POST' },
        runType,
        'curriculum-modifier'
      );
      await callWithRetry(
        QA_FORMATTER_URL,
        { method: 'POST' },
        runType,
        'qa-formatter'
      );
    }
    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'orchestration failed' });
  }
}
