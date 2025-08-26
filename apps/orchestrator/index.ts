import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';

const LESSON_PICKER_URL = process.env.LESSON_PICKER_URL!;
const DISPATCHER_URL = process.env.DISPATCHER_URL!;
const DATA_AGGREGATOR_URL = process.env.DATA_AGGREGATOR_URL!;
const CURRICULUM_MODIFIER_URL = process.env.CURRICULUM_MODIFIER_URL!;
const QA_FORMATTER_URL = process.env.QA_FORMATTER_URL!;

async function callWithRetry(
  url: string,
  options: any,
  runType: string,
  step: string,
  retries = 3
): Promise<boolean> {
  const [action, studentId] = step.split(':');
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
      await notify({
        agent: 'orchestrator',
        studentId,
        message: `${action} succeeded`
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
        await notify({
          agent: 'orchestrator',
          studentId,
          error: `${action} failed: ${err.message}`
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
    await notify({ agent: 'orchestrator', message: `${runType} run complete` });
    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    await notify({ agent: 'orchestrator', error: err.message });
    res.status(500).json({ error: 'orchestration failed' });
  }
}
