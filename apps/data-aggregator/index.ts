import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { supabase } from '../../packages/shared/supabase';
import { generatePerformanceChart, PerformancePoint } from './chartGenerator';

interface Performance {
  student_id: string;
  score: number | null;
  timestamp: string;
}

interface Dispatch {
  student_id: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');

    const { data: performances } = await supabase
      .from('performances')
      .select('student_id, score, timestamp')
      .gte('timestamp', since);

    const { data: dispatches } = await supabase
      .from('dispatch_log')
      .select('student_id')
      .gte('sent_at', since);

    const studentMap: Record<string, { scores: number[]; points: PerformancePoint[]; assigned: number }> = {};

    (performances ?? []).forEach((p) => {
      if (!studentMap[p.student_id]) studentMap[p.student_id] = { scores: [], points: [], assigned: 0 };
      if (p.score !== null && p.score !== undefined) {
        studentMap[p.student_id].scores.push(Number(p.score));
        studentMap[p.student_id].points.push({ timestamp: p.timestamp, score: Number(p.score) });
      }
    });

    (dispatches ?? []).forEach((d) => {
      if (!studentMap[d.student_id]) studentMap[d.student_id] = { scores: [], points: [], assigned: 0 };
      studentMap[d.student_id].assigned += 1;
    });

    const students = [] as { student_id: string; average_score: number; completion_rate: number; chart_url: string }[];
    for (const [studentId, info] of Object.entries(studentMap)) {
      const average_score = info.scores.length ? info.scores.reduce((a, b) => a + b, 0) / info.scores.length : 0;
      const completion_rate = info.assigned ? info.scores.length / info.assigned : 0;
      const chart_url = await generatePerformanceChart(studentId, info.points, safeTimestamp);
      students.push({ student_id: studentId, average_score, completion_rate, chart_url });
    }

    const summary = { generated_at: timestamp, students };
    const content = Buffer.from(JSON.stringify(summary, null, 2));
    const summaryPath = `performance_summary_${safeTimestamp}.json`;

    await supabase.storage
      .from('summaries')
      .upload(summaryPath, content, {
        upsert: true,
        contentType: 'application/json',
      });

    const hash = createHash('sha256').update(content).digest('hex');

    res.status(200).json({ saved: true, hash });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'aggregation failed' });
  }
}
