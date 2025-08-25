import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

const LESSON_PICKER_URL = process.env.LESSON_PICKER_URL!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { student_id } = req.query;
    console.log('Orchestrator triggered', { student_id });
    if (student_id) {
      await fetch(LESSON_PICKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id })
      });
    }
    res.status(200).json({ status: 'ok' });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'orchestration failed' });
  }
}
