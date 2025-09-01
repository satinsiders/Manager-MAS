import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import { supabase } from '../../packages/shared/supabase';
import { LATEST_SUMMARY_PATH } from '../../packages/shared/summary';
import { generatePerformanceChart, PerformancePoint } from './chartGenerator';
import { AGENT_SECRET } from '../../packages/shared/config';

interface Performance {
  student_id: string;
  score: number | null;
  confidence_rating: number | null;
  timestamp: string;
}

interface Dispatch {
  student_id: string;
  status: string;
}

export async function aggregateStudentStats(
  performances: Performance[],
  dispatches: Dispatch[],
  safeTimestamp: string,
  chartFn = generatePerformanceChart
) {
  const studentMap: Record<string, { scores: number[]; confidences: number[]; points: PerformancePoint[] }> = {};
  const assignments: Record<string, number> = {};

  performances.forEach((p) => {
    if (!studentMap[p.student_id]) studentMap[p.student_id] = { scores: [], confidences: [], points: [] };
    if (p.score !== null && p.score !== undefined) {
      studentMap[p.student_id].scores.push(Number(p.score));
      studentMap[p.student_id].points.push({ timestamp: p.timestamp, score: Number(p.score) });
    }
    if (p.confidence_rating !== null && p.confidence_rating !== undefined) {
      studentMap[p.student_id].confidences.push(Number(p.confidence_rating));
    }
  });

  dispatches
    .filter((d) => d.status === 'sent')
    .forEach((d) => {
      if (!studentMap[d.student_id]) studentMap[d.student_id] = { scores: [], confidences: [], points: [] };
      assignments[d.student_id] = (assignments[d.student_id] || 0) + 1;
    });

  const students = [] as {
    student_id: string;
    average_score: number;
    average_confidence: number;
    completion_rate: number;
    chart_url: string;
  }[];
  for (const [studentId, info] of Object.entries(studentMap)) {
    const assigned = assignments[studentId] ?? 0;
    const average_score = info.scores.length ? info.scores.reduce((a, b) => a + b, 0) / info.scores.length : 0;
    const average_confidence = info.confidences.length ? info.confidences.reduce((a, b) => a + b, 0) / info.confidences.length : 0;
    const completion_rate = assigned ? info.scores.length / assigned : 0;
    const sortedPoints = [...info.points].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const chart_url = info.points.length
      ? await chartFn(studentId, sortedPoints, safeTimestamp)
      : '';
    students.push({ student_id: studentId, average_score, average_confidence, completion_rate, chart_url });
  }

  return students;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${AGENT_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');

    const { data: performances } = await supabase
      .from('performances')
      .select('student_id, score, confidence_rating, timestamp')
      .gte('timestamp', since);

    const { data: dispatches } = await supabase
      .from('dispatch_log')
      .select('student_id, status')
      .gte('sent_at', since);

    const students = await aggregateStudentStats(performances ?? [], dispatches ?? [], safeTimestamp);

    const summary = { generated_at: timestamp, students };
    const content = Buffer.from(JSON.stringify(summary, null, 2));
    const archivePath = `performance_summary_${safeTimestamp}.json`;

    // Save timestamped archive
    await supabase.storage
      .from('summaries')
      .upload(archivePath, content, {
        upsert: true,
        contentType: 'application/json',
      });

    // Save/update latest summary for other services
    await supabase.storage
      .from('summaries')
      .upload(LATEST_SUMMARY_PATH, content, {
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
