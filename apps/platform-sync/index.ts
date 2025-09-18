import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { callWithRetry } from '../../packages/shared/retry';
import { notify } from '../../packages/shared/notify';
import { SUPERFASTSAT_API_URL, SUPERFASTSAT_API_TOKEN } from '../../packages/shared/config';
import type { DailyPerformance, PlatformDispatch } from './types';
import {
  mapStudentCurriculums,
  parseTitleToTaxonomy,
  syncCurriculumCatalogFromApi,
  upsertCatalogFromDispatches,
} from './catalog';
import {
  upsertDailyPerformance as upsertDailyPerformanceImpl,
  upsertDispatchMirror as upsertDispatchMirrorImpl,
} from './mirrors';
import { updateStudyPlanProgress as updateStudyPlanProgressImpl } from './progress';
import { syncStudentsRoster } from './students';

export type { PlatformDispatch, DailyPerformance } from './types';
export {
  mapStudentCurriculums,
  parseTitleToTaxonomy,
  syncCurriculumCatalogFromApi,
  upsertCatalogFromDispatches,
} from './catalog';
export { upsertDailyPerformance, upsertDispatchMirror } from './mirrors';
export { computeProgressRows, evaluateQuestionTypeProgress, updateStudyPlanProgress } from './progress';

export async function upsertLessonsQuestionTypes(client = supabase) {
  // Assign question_type_id for lessons based on their topic using existing taxonomy where possible.
  const { data: lessons } = await client
    .from('lessons')
    .select('id, topic, question_type_id')
    .is('question_type_id', null);
  for (const l of lessons ?? []) {
    const topic: string = (l as any).topic ?? '';
    if (!topic) continue;
    // Try to find an existing question type by specific_type or canonical suffix
    let qid: string | null = null;
    try {
      const { data: qt } = await client
        .from('question_types')
        .select('id, specific_type, canonical_path')
        .ilike('specific_type', topic)
        .limit(1);
      if (qt && qt.length > 0) qid = (qt[0] as any).id;
      if (!qid) {
        const { data: qt2 } = await client
          .from('question_types')
          .select('id, canonical_path')
          .ilike('canonical_path', `%> ${topic.toLowerCase()}`)
          .limit(1);
        if (qt2 && qt2.length > 0) qid = (qt2[0] as any).id;
      }
      if (!qid) {
        // Create a generic taxonomy entry for this topic
        const canonical_path = `unknown > general > ${topic.toLowerCase()}`;
        const { data: inserted } = await client
          .from('question_types')
          .insert({
            domain: 'unknown',
            category: 'general',
            specific_type: topic.toLowerCase(),
            canonical_path,
          })
          .select('id')
          .single();
        qid = inserted?.id ?? null;
      }
      if (qid) {
        await client
          .from('lessons')
          .update({ question_type_id: qid })
          .eq('id', (l as any).id);
      }
    } catch {
      /* ignore mapping errors for lessons */
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const reportMode = (req as any).query && ((req as any).query.report === '1' || (req as any).query.report === 'true');
    if (reportMode) {
      const report = await generateCatalogReconciliationReport();
      res.status(200).json(report);
      return;
    }
    const { dispatches = [], daily_performance = [] } = (req.body || {}) as {
      dispatches?: PlatformDispatch[];
      daily_performance?: DailyPerformance[];
    };
    if (dispatches.length) {
      await upsertDispatchMirrorImpl(dispatches);
      await upsertCatalogFromDispatches(dispatches);
    }
    if (daily_performance.length) await upsertDailyPerformanceImpl(daily_performance);

    // If no explicit body provided, optionally fetch from platform APIs for all active students
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    const DISPATCH_URL = process.env.PLATFORM_DISPATCH_LIST_URL ?? `${baseUrl}/student-curriculums`;
    const DAILY_URL = process.env.PLATFORM_DAILY_PERFORMANCE_URL ?? `${baseUrl}/teacher/study-schedules`;
    const headers = { Authorization: `Bearer ${SUPERFASTSAT_API_TOKEN}` };
    if (!dispatches.length && !daily_performance.length && (DISPATCH_URL || DAILY_URL)) {
      try {
        await syncStudentsRoster();
      } catch (err) {
        console.error('student roster sync failed', err);
      }
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .eq('active', true);
      try {
        await syncCurriculumCatalogFromApi();
      } catch (err) {
        console.error('catalog sync failed', err);
      }
      for (const s of students ?? []) {
        const sid = s.id;
        if (DISPATCH_URL) {
          const resp = await callWithRetry(
            `${DISPATCH_URL}?studentId=${encodeURIComponent(sid)}&includeStopped=true&includeNoRemainingDuration=true`,
            { headers },
            'platform-sync',
            `api3:${sid}`
          );
          if (resp) {
            try {
              const body: any = await resp.json();
              const list: any[] = Array.isArray(body) ? body : (body?.dispatches ?? body?.items ?? []);
              const rows: PlatformDispatch[] = mapStudentCurriculums(list, sid);
              if (rows.length) {
                await upsertDispatchMirrorImpl(rows);
                await upsertCatalogFromDispatches(rows);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
        if (DAILY_URL) {
          const scheduledDate = new Date().toISOString().slice(0, 10);
          const resp = await callWithRetry(
            `${DAILY_URL}?studentId=${encodeURIComponent(sid)}&scheduledDate=${scheduledDate}`,
            { headers },
            'platform-sync',
            `api5:${sid}`
          );
          if (resp) {
            try {
              const body: any = await resp.json();
              const summaries: any[] = Array.isArray(body) ? body : body?.items ?? [];
              const rows: DailyPerformance[] = [];
              for (const schedule of summaries) {
                const scheduleInfo = schedule.studySchedule ?? schedule;
                const date = scheduleInfo?.scheduledDate ?? scheduleInfo?.date ?? scheduledDate;
                const lessons: any[] = schedule.studyLessons ?? schedule.lessons ?? [];
                for (const lesson of lessons) {
                  const lessonIdentifier = lesson.lesson?.id ?? lesson.lessonId ?? lesson.id;
                  if (lessonIdentifier == null) continue;
                  const units: any[] = lesson.studyUnits ?? lesson.units ?? [];
                  const correctCount = units.filter((u: any) => u.isCorrect === true).length;
                  const completedUnits = units.filter((u: any) => u.isCompleted).length;
                  const correctness = units.length ? Math.round((correctCount / units.length) * 100) : null;
                  const confidences = units
                    .map((u: any) => (typeof u.confidence === 'number' ? Number(u.confidence) : null))
                    .filter((v) => v !== null) as number[];
                  const avgConfidence = confidences.length
                    ? confidences.reduce((sum, v) => sum + v, 0) / confidences.length
                    : null;
                  rows.push({
                    student_id: sid,
                    date,
                    external_curriculum_id: String(lessonIdentifier),
                    bundle_ref: String(lesson.id ?? lesson.lessonId ?? `${date}:${Math.random().toString(36).slice(2, 8)}`),
                    avg_correctness: correctness,
                    avg_confidence: avgConfidence,
                    units: units.length || null,
                  });
                }
              }
              if (rows.length) await upsertDailyPerformanceImpl(rows);
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
    }
    try {
      await updateStudyPlanProgressImpl();
    } catch {
      /* ignore */
    }
    // Backfill lesson taxonomy links from topics
    try {
      await upsertLessonsQuestionTypes();
    } catch {
      /* ignore */
    }
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'platform sync failed' });
  }
}

export async function generateCatalogReconciliationReport(client = supabase) {
  const mismatches: any[] = [];
  const missingInCatalog: any[] = [];

  // Compare parsed canonical from raw_title vs stored canonical_path
  const { data: rows } = await client
    .from('curriculum_catalog')
    .select('external_curriculum_id, raw_title, question_type_id, question_types!inner(canonical_path)');
  for (const row of rows ?? []) {
    const parsed = parseTitleToTaxonomy((row as any).raw_title);
    const storedCanonical = (row as any).question_types?.canonical_path ?? '';
    if (parsed && parsed.canonical_path && storedCanonical && parsed.canonical_path !== storedCanonical) {
      mismatches.push({
        external_curriculum_id: (row as any).external_curriculum_id,
        raw_title: (row as any).raw_title,
        parsed_canonical: parsed.canonical_path,
        stored_canonical: storedCanonical,
      });
    }
  }

  // External curricula present in mirrors but not in catalog
  const { data: mirrors } = await client
    .from('platform_dispatches')
    .select('external_curriculum_id, raw_title')
    .order('external_curriculum_id');
  const mirrorSet = new Set((mirrors ?? []).map((m: any) => m.external_curriculum_id));
  const { data: cats } = await client
    .from('curriculum_catalog')
    .select('external_curriculum_id');
  const catalogSet = new Set((cats ?? []).map((c: any) => c.external_curriculum_id));
  for (const extId of mirrorSet) {
    if (!catalogSet.has(extId)) {
      const row = (mirrors ?? []).find((m: any) => m.external_curriculum_id === extId);
      missingInCatalog.push({ external_curriculum_id: extId, raw_title: row?.raw_title ?? null });
    }
  }

  return {
    mismatches_count: mismatches.length,
    missing_count: missingInCatalog.length,
    mismatches,
    missing_in_catalog: missingInCatalog,
    generated_at: new Date().toISOString(),
  };
}
