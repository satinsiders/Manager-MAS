import { supabase } from '../../packages/shared/supabase';
import {
  loadQuestionTypeLookup,
  normalizeQuestionTypeReference,
  QuestionTypeLookup,
} from '../../packages/shared/questionTypes';

export const PROGRESS_LOOKBACK_DAYS = parseInt(process.env.STUDY_PLAN_PROGRESS_LOOKBACK_DAYS ?? '14', 10);
const MASTERED_SCORE_THRESHOLD = 90;
const MASTERED_CONFIDENCE_THRESHOLD = 0.8;
const MASTERED_MIN_COUNT = 6;
const NEAR_SCORE_THRESHOLD = 75;
const NEAR_MIN_COUNT = 3;

export type PerformanceSample = {
  score?: number | null;
  confidence_rating?: number | null;
  timestamp?: string | null;
};

export type ProgressEvaluation = {
  status: 'not_started' | 'in_progress' | 'near_mastery' | 'mastered';
  evidence_window: {
    lookback_days: number;
    sample_size: number;
    observations: Array<{
      score: number | null;
      confidence_rating: number | null;
      captured_at: string | null;
    }>;
  };
  rolling_metrics: {
    lookback_days: number;
    sample_size: number;
    average_score: number | null;
    average_confidence: number | null;
    sample_with_confidence: number;
    window_start: string | null;
    window_end: string | null;
  };
};

export function evaluateQuestionTypeProgress(
  samples: PerformanceSample[],
  now = new Date(),
  lookbackDays = PROGRESS_LOOKBACK_DAYS
): ProgressEvaluation {
  const numericScores = samples
    .map((s) => (typeof s.score === 'number' ? Number(s.score) : null))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const numericConfidence = samples
    .map((s) => (typeof s.confidence_rating === 'number' ? Number(s.confidence_rating) : null))
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const sampleSize = numericScores.length;
  const averageScore = sampleSize
    ? numericScores.reduce((sum, v) => sum + v, 0) / sampleSize
    : null;
  const averageConfidence = numericConfidence.length
    ? numericConfidence.reduce((sum, v) => sum + v, 0) / numericConfidence.length
    : null;

  let status: ProgressEvaluation['status'] = 'not_started';
  if (
    sampleSize >= MASTERED_MIN_COUNT &&
    (averageScore ?? 0) >= MASTERED_SCORE_THRESHOLD &&
    (averageConfidence == null || averageConfidence >= MASTERED_CONFIDENCE_THRESHOLD)
  ) {
    status = 'mastered';
  } else if (sampleSize >= NEAR_MIN_COUNT && (averageScore ?? 0) >= NEAR_SCORE_THRESHOLD) {
    status = 'near_mastery';
  } else if (sampleSize > 0) {
    status = 'in_progress';
  }

  const timestamps = samples
    .map((s) => (s.timestamp ? new Date(s.timestamp).getTime() : null))
    .filter((v): v is number => v !== null && !Number.isNaN(v));
  const windowStart = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
  const windowEnd = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;

  const observations = [...samples]
    .sort((a, b) => {
      const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bt - at;
    })
    .slice(0, 5)
    .map((row) => ({
      score: typeof row.score === 'number' ? Number(row.score) : null,
      confidence_rating:
        typeof row.confidence_rating === 'number' ? Number(row.confidence_rating) : null,
      captured_at: row.timestamp ?? null,
    }));

  return {
    status,
    evidence_window: {
      lookback_days: lookbackDays,
      sample_size: sampleSize,
      observations,
    },
    rolling_metrics: {
      lookback_days: lookbackDays,
      sample_size: sampleSize,
      average_score: averageScore,
      average_confidence: averageConfidence,
      sample_with_confidence: numericConfidence.length,
      window_start: windowStart,
      window_end: windowEnd,
    },
  };
}

type PerformanceRow = {
  question_type?: string | null;
  question_type_id?: string | null;
  canonical_path?: string | null;
  score?: number | null;
  confidence_rating?: number | null;
  timestamp?: string | null;
  study_plan_id?: string | null;
};

function normalizeLabel(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase() || null;
}

function enrichPerformanceRow(
  row: PerformanceRow,
  lookup: QuestionTypeLookup
): PerformanceRow | null {
  const normalized = normalizeQuestionTypeReference(lookup, {
    question_type: row.question_type ?? null,
    question_type_id: row.question_type_id ?? null,
    canonical_path: row.canonical_path ?? null,
  });
  if (!normalized.question_type && !normalized.question_type_id) {
    return null;
  }
  return {
    ...row,
    question_type: normalized.question_type ?? row.question_type ?? null,
    question_type_id: normalized.question_type_id ?? null,
    canonical_path: normalized.canonical_path ?? row.canonical_path ?? null,
  };
}

export function computeProgressRows(
  studentId: string,
  studyPlanId: string,
  performances: PerformanceRow[],
  lookbackDays = PROGRESS_LOOKBACK_DAYS,
  now = new Date()
) {
  const groups = new Map<string, PerformanceRow[]>();
  const metadata = new Map<
    string,
    {
      label: string;
      question_type_id: string | null;
    }
  >();
  for (const row of performances) {
    const raw = row.question_type?.trim();
    const canonical = row.canonical_path?.trim();
    const qtypeId = row.question_type_id ?? null;
    const label = canonical || raw;
    if (!label && !qtypeId) continue;
    const key = qtypeId ?? normalizeLabel(label!) ?? null;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
    if (!metadata.has(key)) {
      metadata.set(key, {
        label: canonical || raw || key,
        question_type_id: qtypeId,
      });
    }
  }

  const result: any[] = [];
  for (const [questionType, samples] of groups.entries()) {
    const evaluation = evaluateQuestionTypeProgress(samples, now, lookbackDays);
    const meta = metadata.get(questionType);
    result.push({
      student_id: studentId,
      study_plan_id: studyPlanId,
      question_type: meta?.label ?? questionType,
      question_type_id: meta?.question_type_id ?? null,
      status: evaluation.status,
      evidence_window: evaluation.evidence_window,
      rolling_metrics: evaluation.rolling_metrics,
      last_decision_at: now.toISOString(),
    });
  }
  return result;
}

export async function updateStudyPlanProgress(
  client = supabase,
  lookbackDays = PROGRESS_LOOKBACK_DAYS
) {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const sinceDateOnly = sinceIso.slice(0, 10);

  const { data: students } = await client
    .from('students')
    .select('id, current_curriculum_version, active')
    .eq('active', true);

  const questionTypeLookup = await loadQuestionTypeLookup(client);

  for (const student of students ?? []) {
    try {
      const version = (student as any).current_curriculum_version;
      if (version == null) continue;
      const studentId = (student as any).id;
      const { data: plan } = await client
        .from('study_plans')
        .select('id')
        .eq('student_id', studentId)
        .eq('version', version)
        .single();
      const studyPlanId = plan?.id;
      if (!studyPlanId) continue;

      const { data: performanceRows } = await client
        .from('performances')
        .select('question_type, question_type_id, score, confidence_rating, timestamp, study_plan_id')
        .eq('student_id', studentId)
        .gte('timestamp', sinceIso);

      const { data: unitRows } = await client
        .from('daily_performance_units')
        .select('scheduled_date, platform_curriculum_id, is_correct, confidence')
        .eq('student_id', studentId)
        .gte('scheduled_date', sinceDateOnly);

      const { data: summaryRows } = await client
        .from('daily_performance')
        .select('date, external_curriculum_id, avg_correctness, avg_confidence')
        .eq('student_id', studentId)
        .gte('date', sinceDateOnly);

      const curriculumIds = new Set<string>();
      for (const row of unitRows ?? []) {
        if (row?.platform_curriculum_id != null) {
          curriculumIds.add(String(row.platform_curriculum_id));
        }
      }
      for (const row of summaryRows ?? []) {
        if (row?.external_curriculum_id != null) {
          curriculumIds.add(String(row.external_curriculum_id));
        }
      }

      const curriculumTypeMap = new Map<
        string,
        {
          question_type_id: string | null;
          canonical_path: string | null;
          display_name: string | null;
        }
      >();
      if (curriculumIds.size > 0) {
        const { data: catalogRows } = await client
          .from('curriculum_catalog')
          .select('external_curriculum_id, question_types(id, canonical_path, display_name)')
          .in('external_curriculum_id', Array.from(curriculumIds));
        for (const row of catalogRows ?? []) {
          const key = String((row as any).external_curriculum_id);
          const qType = (row as any).question_types ?? {};
          let canonical = qType?.canonical_path ?? null;
          const qid = qType?.id ?? null;
          let displayName = qType?.display_name ?? null;
          if (!canonical && qid) {
            const meta = questionTypeLookup.byId.get(qid);
            if (meta) {
              canonical = meta.canonical_path ?? canonical;
              displayName = displayName ?? meta.display_name ?? null;
            }
          }
          if (canonical || qid) {
            curriculumTypeMap.set(key, {
              question_type_id: qid,
              canonical_path: canonical,
              display_name: displayName,
            });
          }
        }
      }

      const unitSamples: PerformanceRow[] = (unitRows ?? [])
        .map((row: any) => {
          const curriculumId =
            row?.platform_curriculum_id != null ? String(row.platform_curriculum_id) : null;
          if (!curriculumId) return null;
          const info = curriculumTypeMap.get(curriculumId);
          if (!info) return null;
          const meta = info.question_type_id ? questionTypeLookup.byId.get(info.question_type_id) : undefined;
          const questionType =
            info.canonical_path ??
            meta?.canonical_path ??
            info.display_name ??
            meta?.display_name ??
            null;
          const questionTypeId = info.question_type_id ?? null;
          const score =
            typeof row?.is_correct === 'boolean' ? (row.is_correct ? 100 : 0) : null;
          const confidence =
            row?.confidence != null && Number.isFinite(Number(row.confidence))
              ? Number(row.confidence) / 100
              : null;
          const date = row?.scheduled_date ?? null;
          const timestamp = date ? `${date}T00:00:00.000Z` : null;
          return {
            question_type: questionType,
            question_type_id: questionTypeId,
            canonical_path: info.canonical_path ?? meta?.canonical_path ?? null,
            score,
            confidence_rating: confidence,
            timestamp,
            study_plan_id: null,
          } as PerformanceRow;
        })
        .filter((row): row is PerformanceRow => Boolean(row && row.question_type));

      const summarySamples: PerformanceRow[] = (summaryRows ?? [])
        .map((row: any) => {
          const curriculumId =
            row?.external_curriculum_id != null ? String(row.external_curriculum_id) : null;
          if (!curriculumId) return null;
          const info = curriculumTypeMap.get(curriculumId);
          if (!info) return null;
          const meta = info.question_type_id ? questionTypeLookup.byId.get(info.question_type_id) : undefined;
          const questionType =
            info.canonical_path ??
            meta?.canonical_path ??
            info.display_name ??
            meta?.display_name ??
            null;
          const questionTypeId = info.question_type_id ?? null;
          const score =
            row?.avg_correctness != null && Number.isFinite(Number(row.avg_correctness))
              ? Number(row.avg_correctness)
              : null;
          const confidence =
            row?.avg_confidence != null && Number.isFinite(Number(row.avg_confidence))
              ? Number(row.avg_confidence) / 100
              : null;
          const date = row?.date ?? null;
          const timestamp = date ? `${date}T00:00:00.000Z` : null;
          return {
            question_type: questionType,
            question_type_id: questionTypeId,
            canonical_path: info.canonical_path ?? meta?.canonical_path ?? null,
            score,
            confidence_rating: confidence,
            timestamp,
            study_plan_id: null,
          } as PerformanceRow;
        })
        .filter((row): row is PerformanceRow => Boolean(row && row.question_type));

      const relevant: PerformanceRow[] = (performanceRows ?? [])
        .filter((row: PerformanceRow) => !row.study_plan_id || row.study_plan_id === studyPlanId)
        .map((row: any) => ({
          question_type: row?.question_type ?? null,
          question_type_id: row?.question_type_id ?? null,
          canonical_path: null,
          score: row?.score ?? null,
          confidence_rating: row?.confidence_rating ?? null,
          timestamp: row?.timestamp ?? null,
          study_plan_id: row?.study_plan_id ?? null,
        }));

      const combined = [...relevant, ...unitSamples, ...summarySamples];

      const enriched = combined
        .map((row) => enrichPerformanceRow(row, questionTypeLookup))
        .filter((row): row is PerformanceRow => Boolean(row && (row.question_type || row.question_type_id)));

      const updates = computeProgressRows(studentId, studyPlanId, enriched, lookbackDays, new Date());
      if (updates.length) {
        await client
          .from('study_plan_progress')
          .upsert(updates, { onConflict: 'student_id,study_plan_id,question_type' });
      }
    } catch (err) {
      console.error('study plan progress update failed', err);
    }
  }
}
