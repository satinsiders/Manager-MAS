import { supabase } from '../../packages/shared/supabase';

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
  score?: number | null;
  confidence_rating?: number | null;
  timestamp?: string | null;
  study_plan_id?: string | null;
};

export function computeProgressRows(
  studentId: string,
  studyPlanId: string,
  performances: PerformanceRow[],
  lookbackDays = PROGRESS_LOOKBACK_DAYS,
  now = new Date()
) {
  const groups = new Map<string, PerformanceRow[]>();
  for (const row of performances) {
    const qtypeRaw = row.question_type?.trim();
    if (!qtypeRaw) continue;
    const qtype = qtypeRaw.toLowerCase();
    if (!groups.has(qtype)) groups.set(qtype, []);
    groups.get(qtype)!.push(row);
  }

  const result: any[] = [];
  for (const [questionType, samples] of groups.entries()) {
    const evaluation = evaluateQuestionTypeProgress(samples, now, lookbackDays);
    result.push({
      student_id: studentId,
      study_plan_id: studyPlanId,
      question_type: questionType,
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

  const { data: students } = await client
    .from('students')
    .select('id, current_curriculum_version, active')
    .eq('active', true);

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
        .select('question_type, score, confidence_rating, timestamp, study_plan_id')
        .eq('student_id', studentId)
        .gte('timestamp', sinceIso);

      const relevant = (performanceRows ?? []).filter(
        (row: PerformanceRow) => !row.study_plan_id || row.study_plan_id === studyPlanId
      );
      const updates = computeProgressRows(studentId, studyPlanId, relevant, lookbackDays, new Date());
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
