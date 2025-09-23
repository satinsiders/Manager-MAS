import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { createHash } from 'crypto';
import { supabase } from '../../packages/shared/supabase';
import { LATEST_SUMMARY_PATH } from '../../packages/shared/summary';
import { generatePerformanceChart, PerformancePoint } from './chartGenerator';

interface Performance {
  student_id: string;
  question_type: string | null;
  score: number | null;
  confidence_rating: number | null;
  timestamp: string;
}

interface Dispatch {
  student_id: string;
  question_type: string | null;
  status: string;
}

export async function aggregateStudentStats(
  performances: Performance[],
  dispatches: Dispatch[],
  safeTimestamp: string,
  chartFn = generatePerformanceChart
) {
  const studentMap: Record<string, { student_id: string; question_type: string; scores: number[]; confidences: number[]; points: PerformancePoint[] }> = {};
  const assignments: Record<string, number> = {};

  performances.forEach((p) => {
    const key = `${p.student_id}:${p.question_type ?? ''}`;
    if (!studentMap[key]) studentMap[key] = { student_id: p.student_id, question_type: p.question_type ?? '', scores: [], confidences: [], points: [] };
    if (p.score !== null && p.score !== undefined) {
      studentMap[key].scores.push(Number(p.score));
      studentMap[key].points.push({ timestamp: p.timestamp, score: Number(p.score) });
    }
    if (p.confidence_rating !== null && p.confidence_rating !== undefined) {
      studentMap[key].confidences.push(Number(p.confidence_rating));
    }
  });

  dispatches
    .filter((d) => d.status === 'sent')
    .forEach((d) => {
      const key = `${d.student_id}:${d.question_type ?? ''}`;
      if (!studentMap[key]) studentMap[key] = { student_id: d.student_id, question_type: d.question_type ?? '', scores: [], confidences: [], points: [] };
      assignments[key] = (assignments[key] || 0) + 1;
    });

  const students = [] as {
    student_id: string;
    question_type: string;
    average_score: number;
    average_confidence: number;
    completion_rate: number;
    chart_url: string;
  }[];
  for (const [key, info] of Object.entries(studentMap)) {
    const assigned = assignments[key] ?? 0;
    const average_score = info.scores.length ? info.scores.reduce((a, b) => a + b, 0) / info.scores.length : 0;
    const average_confidence = info.confidences.length ? info.confidences.reduce((a, b) => a + b, 0) / info.confidences.length : 0;
    const completion_rate = assigned ? info.scores.length / assigned : 0;
    const sortedPoints = [...info.points].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const chart_url = info.points.length
      ? await chartFn(info.student_id, sortedPoints, safeTimestamp)
      : '';
    students.push({
      student_id: info.student_id,
      question_type: info.question_type,
      average_score,
      average_confidence,
      completion_rate,
      chart_url,
    });
  }

  return students;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');

    const { data: performances } = await supabase
      .from('performances')
      .select('student_id, score, confidence_rating, timestamp, question_type')
      .gte('timestamp', since);

    const { data: dispatches } = await supabase
      .from('dispatch_log')
      .select('student_id, status, question_type')
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
