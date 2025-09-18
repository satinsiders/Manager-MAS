import { supabase } from '../../packages/shared/supabase';
import type { DailyPerformance, PlatformDispatch } from './types';

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

