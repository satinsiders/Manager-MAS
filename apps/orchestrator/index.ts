import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { callWithRetry } from '../../packages/shared/retry';

const LESSON_PICKER_URL = process.env.LESSON_PICKER_URL!;
const DISPATCHER_URL = process.env.DISPATCHER_URL!;
const DATA_AGGREGATOR_URL = process.env.DATA_AGGREGATOR_URL!;
const CURRICULUM_MODIFIER_URL = process.env.CURRICULUM_MODIFIER_URL!;
const QA_FORMATTER_URL = process.env.QA_FORMATTER_URL!;

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
