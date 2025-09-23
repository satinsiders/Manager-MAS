import { supabase } from '../../packages/shared/supabase';
import type { DailyPerformance, DailyPerformanceUnit, PlatformDispatch } from './types';

export async function upsertDispatchMirror(rows: PlatformDispatch[], client = supabase) {
  for (const r of rows) {
    await client
      .from('platform_dispatches')
      .upsert(
        {
          student_id: r.student_id,
          external_curriculum_id: r.external_curriculum_id,
          student_curriculum_id: r.student_curriculum_id ?? r.external_curriculum_id,
          raw_title: r.raw_title ?? null,
          total_minutes: r.total_minutes ?? null,
          remaining_minutes: r.remaining_minutes ?? null,
          first_dispatched_at: r.first_dispatched_at ?? null,
          last_dispatched_at: r.last_dispatched_at ?? null,
          ingested_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,student_curriculum_id' }
      );
  }
}

export async function upsertDailyPerformance(rows: DailyPerformance[], client = supabase) {
  for (const r of rows) {
    await client
      .from('daily_performance')
      .upsert(
        {
          student_id: r.student_id,
          date: r.date,
          external_curriculum_id: r.external_curriculum_id,
          bundle_ref: r.bundle_ref,
          avg_correctness: r.avg_correctness ?? null,
          avg_confidence: r.avg_confidence ?? null,
          units: r.units ?? null,
          ingested_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,date,external_curriculum_id,bundle_ref' }
      );
  }
}

export async function upsertDailyPerformanceUnits(
  details: DailyPerformanceUnit[],
  client = supabase
) {
  if (!details.length) return;

  const groups = new Map<string, { student_id: string; date: string; external_curriculum_id: string }>();
  for (const d of details) {
    const key = `${d.student_id}|${d.date}|${d.external_curriculum_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        student_id: d.student_id,
        date: d.date,
        external_curriculum_id: d.external_curriculum_id,
      });
    }
  }

  for (const { student_id, date, external_curriculum_id } of groups.values()) {
    await client
      .from('daily_performance_units')
      .delete()
      .eq('student_id', student_id)
      .eq('scheduled_date', date)
      .eq('platform_curriculum_id', external_curriculum_id);
  }

  const payload = details.map((d) => ({
    student_id: d.student_id,
    scheduled_date: d.date,
    platform_curriculum_id: d.external_curriculum_id,
    lesson_id: d.lesson_id ?? null,
    unit_id: d.unit_id ?? null,
    unit_seq: d.unit_seq ?? null,
    is_completed: d.is_completed ?? null,
    is_correct: d.is_correct ?? null,
    confidence: d.confidence ?? null,
    consecutive_correct_count: d.consecutive_correct_count ?? null,
    raw: d.raw ?? null,
    ingested_at: new Date().toISOString(),
  }));

  if (payload.length) {
    await client.from('daily_performance_units').insert(payload);
  }
}
