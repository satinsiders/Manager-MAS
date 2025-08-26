import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import { supabase } from '../../packages/shared/supabase';
import {
  LESSON_PICKER_URL,
  DISPATCHER_URL,
  DATA_AGGREGATOR_URL,
  CURRICULUM_MODIFIER_URL,
  QA_FORMATTER_URL
} from '../../packages/shared/config';

async function callWithRetry(
  url: string,
  options: any,
  runType: string,
  step: string,
  retries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await supabase.from('orchestrator_log').insert({
        run_type: runType,
        step,
        success: true,
        run_at: new Date().toISOString()
      });
      return true;
    } catch (err: any) {
      if (attempt === retries) {
        await supabase.from('orchestrator_log').insert({
          run_type: runType,
          step,
          success: false,
          message: err.message,
          run_at: new Date().toISOString()
        });
        return false;
      }
    }
  }
  return false;
}

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
        const pickerOk = await callWithRetry(
          LESSON_PICKER_URL,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.id })
          },
          runType,
          `lesson-picker:${student.id}`
        );

        if (pickerOk) {
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
