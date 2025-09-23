import { DAILY_TREND_LIMIT, MAX_UNIT_HISTORY, PERFORMANCE_LOOKBACK_DAYS } from './constants';
import {
  AggregateStats,
  CurriculumMeta,
  CurriculumPerformanceSummary,
  DailySummary,
  LessonPerformance,
  QuestionTypeRollup,
  StudentPerformanceWindow,
  UnitHistoryEntry,
} from './types';

export const EMPTY_AGGREGATE: AggregateStats = {
  total_units: 0,
  completed_units: 0,
  graded_units: 0,
  correct_units: 0,
  incorrect_units: 0,
  accuracy_pct: null,
  avg_confidence_pct: null,
  last_activity: null,
};

type BuildContextParams = {
  client: typeof import('../../packages/shared/supabase').supabase;
  studentId: string;
  candidateCurriculumIds: Iterable<string>;
  loadCurriculumMeta: (ids: string[]) => Promise<Map<string, CurriculumMeta>>;
  fallbackQuestionType: (curriculumId: string) => string | null;
  lookbackDays?: number;
  maxUnitHistory?: number;
  dailyTrendLimit?: number;
};

export type PerformanceContext = {
  unitHistory: UnitHistoryEntry[];
  curriculumPerformanceMap: Map<string, CurriculumPerformanceSummary>;
  curriculumMeta: Map<string, CurriculumMeta>;
  dailySummary: Map<string, DailySummary>;
  studentPerformanceWindow: StudentPerformanceWindow;
  dailySummaryCount: number;
};

export function computeAggregate(units: UnitHistoryEntry[]): AggregateStats {
  if (units.length === 0) return { ...EMPTY_AGGREGATE };

  let completed = 0;
  let graded = 0;
  let correct = 0;
  let incorrect = 0;
  const confidences: number[] = [];
  let lastActivity: string | null = null;

  for (const unit of units) {
    if (unit.is_completed === true) completed += 1;
    if (typeof unit.is_correct === 'boolean') {
      graded += 1;
      if (unit.is_correct) correct += 1;
      else incorrect += 1;
    }
    if (typeof unit.confidence_pct === 'number') {
      confidences.push(unit.confidence_pct);
    }
    if (unit.scheduled_date) {
      if (!lastActivity || unit.scheduled_date > lastActivity) {
        lastActivity = unit.scheduled_date;
      }
    }
  }

  const accuracyPct = graded > 0 ? (correct / graded) * 100 : null;
  const avgConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null;

  return {
    total_units: units.length,
    completed_units: completed,
    graded_units: graded,
    correct_units: correct,
    incorrect_units: incorrect,
    accuracy_pct: accuracyPct != null ? Number(accuracyPct.toFixed(2)) : null,
    avg_confidence_pct: avgConfidence != null ? Number(avgConfidence.toFixed(2)) : null,
    last_activity: lastActivity,
  };
}

function toUnitEntry(
  row: any,
  metaMap: Map<string, CurriculumMeta>,
  fallbackQuestionType: (curriculumId: string) => string | null,
): UnitHistoryEntry | null {
  const curriculumId =
    row?.platform_curriculum_id != null ? String(row.platform_curriculum_id) : '';
  if (!curriculumId) return null;
  const meta = metaMap.get(curriculumId);
  const questionType = meta?.question_type ?? fallbackQuestionType(curriculumId) ?? null;
  const confidence =
    row?.confidence != null && Number.isFinite(Number(row.confidence))
      ? Number(row.confidence)
      : null;
  return {
    curriculum_id: curriculumId,
    scheduled_date: row?.scheduled_date ?? null,
    lesson_id: row?.lesson_id ?? null,
    unit_id: row?.unit_id ?? null,
    unit_seq: typeof row?.unit_seq === 'number' ? row.unit_seq : null,
    is_completed: typeof row?.is_completed === 'boolean' ? row.is_completed : null,
    is_correct: typeof row?.is_correct === 'boolean' ? row.is_correct : null,
    confidence_pct: confidence,
    consecutive_correct_count:
      typeof row?.consecutive_correct_count === 'number'
        ? row.consecutive_correct_count
        : null,
    question_type: questionType,
  };
}

export async function buildPerformanceContext({
  client,
  studentId,
  candidateCurriculumIds,
  loadCurriculumMeta,
  fallbackQuestionType,
  lookbackDays = PERFORMANCE_LOOKBACK_DAYS,
  maxUnitHistory = MAX_UNIT_HISTORY,
  dailyTrendLimit = DAILY_TREND_LIMIT,
}: BuildContextParams): Promise<PerformanceContext> {
  const lookbackStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const lookbackDate = lookbackStart.toISOString().slice(0, 10);

  const [unitResp, summaryResp] = await Promise.all([
    client
      .from('daily_performance_units')
      .select(
        'scheduled_date, platform_curriculum_id, lesson_id, unit_id, unit_seq, is_completed, is_correct, confidence, consecutive_correct_count',
      )
      .eq('student_id', studentId)
      .gte('scheduled_date', lookbackDate)
      .order('scheduled_date', { ascending: true })
      .limit(maxUnitHistory * 5),
    client
      .from('daily_performance')
      .select('date, external_curriculum_id, avg_correctness, avg_confidence, units')
      .eq('student_id', studentId)
      .gte('date', lookbackDate)
      .order('date', { ascending: true })
      .limit(dailyTrendLimit * 10),
  ]);

  const rawUnitRows = unitResp.data ?? [];
  const rawSummaryRows = summaryResp.data ?? [];

  const ids = new Set<string>();
  for (const curriculumId of candidateCurriculumIds ?? []) {
    if (curriculumId) ids.add(curriculumId);
  }
  for (const row of rawUnitRows) {
    if (row?.platform_curriculum_id != null) {
      ids.add(String(row.platform_curriculum_id));
    }
  }
  for (const row of rawSummaryRows) {
    if (row?.external_curriculum_id != null) {
      ids.add(String(row.external_curriculum_id));
    }
  }

  const curriculumMeta = await loadCurriculumMeta(Array.from(ids));

  const trimmedUnitRows = rawUnitRows.slice(-maxUnitHistory);
  const unitHistory = trimmedUnitRows
    .map((row) => toUnitEntry(row, curriculumMeta, fallbackQuestionType))
    .filter((entry): entry is UnitHistoryEntry => Boolean(entry));

  const curriculumUnits = new Map<string, UnitHistoryEntry[]>();
  const lessonBuckets = new Map<
    string,
    {
      curriculum_id: string;
      scheduled_date: string | null;
      lesson_id: string | null;
      consecutive_correct_count: number | null;
      units: UnitHistoryEntry[];
    }
  >();

  for (const unit of unitHistory) {
    if (!curriculumUnits.has(unit.curriculum_id)) {
      curriculumUnits.set(unit.curriculum_id, []);
    }
    curriculumUnits.get(unit.curriculum_id)!.push(unit);

    const key = `${unit.curriculum_id}|${unit.lesson_id ?? 'unknown'}|${unit.scheduled_date ?? 'unknown'}`;
    if (!lessonBuckets.has(key)) {
      lessonBuckets.set(key, {
        curriculum_id: unit.curriculum_id,
        scheduled_date: unit.scheduled_date ?? null,
        lesson_id: unit.lesson_id ?? null,
        consecutive_correct_count: unit.consecutive_correct_count,
        units: [],
      });
    }
    const bucket = lessonBuckets.get(key)!;
    bucket.units.push(unit);
    if (
      typeof unit.consecutive_correct_count === 'number' &&
      (bucket.consecutive_correct_count == null || unit.consecutive_correct_count > bucket.consecutive_correct_count)
    ) {
      bucket.consecutive_correct_count = unit.consecutive_correct_count;
    }
  }

  const curriculumPerformanceMap = new Map<string, CurriculumPerformanceSummary>();
  for (const [curriculumId, units] of curriculumUnits.entries()) {
    const meta = curriculumMeta.get(curriculumId);
    const totals = computeAggregate(units);
    const lessons = (Array.from(lessonBuckets.values()).filter(
      (item) => item.curriculum_id === curriculumId,
    )).sort((a, b) => {
      const aDate = a.scheduled_date ?? '';
      const bDate = b.scheduled_date ?? '';
      return bDate.localeCompare(aDate);
    });

    const lessonPerformances: LessonPerformance[] = lessons.map((lesson) => ({
      lesson_id: lesson.lesson_id,
      scheduled_date: lesson.scheduled_date,
      consecutive_correct_count: lesson.consecutive_correct_count ?? null,
      totals: computeAggregate(lesson.units),
      units: lesson.units.map((unit) => ({
        unit_id: unit.unit_id,
        unit_seq: unit.unit_seq,
        scheduled_date: unit.scheduled_date,
        is_completed: unit.is_completed,
        is_correct: unit.is_correct,
        confidence_pct: unit.confidence_pct,
        consecutive_correct_count: unit.consecutive_correct_count,
      })),
    }));

    curriculumPerformanceMap.set(curriculumId, {
      curriculum_id: curriculumId,
      question_type: meta?.question_type ?? fallbackQuestionType(curriculumId),
      totals,
      recent_lessons: lessonPerformances,
      raw_title: meta?.raw_title ?? null,
      subtype: meta?.subtype ?? null,
    });
  }

  const perQuestionType = new Map<string, { units: UnitHistoryEntry[]; curriculumIds: Set<string> }>();
  for (const unit of unitHistory) {
    const key = unit.question_type ?? 'unknown';
    if (!perQuestionType.has(key)) {
      perQuestionType.set(key, { units: [], curriculumIds: new Set<string>() });
    }
    const bucket = perQuestionType.get(key)!;
    bucket.units.push(unit);
    bucket.curriculumIds.add(unit.curriculum_id);
  }
  const questionTypeBreakdown: QuestionTypeRollup[] = Array.from(perQuestionType.entries())
    .map(([questionType, data]) => ({
      question_type: questionType,
      curriculum_ids: Array.from(data.curriculumIds),
      totals: computeAggregate(data.units),
    }))
    .sort((a, b) => {
      const aDate = a.totals.last_activity ?? '';
      const bDate = b.totals.last_activity ?? '';
      return bDate.localeCompare(aDate);
    });

  const overallTotals = computeAggregate(unitHistory);

  const studentPerformanceWindow: StudentPerformanceWindow = {
    lookback_days: lookbackDays,
    totals: overallTotals,
    question_type_breakdown: questionTypeBreakdown,
    unit_history: unitHistory.map((unit) => ({
      scheduled_date: unit.scheduled_date,
      curriculum_id: unit.curriculum_id,
      question_type: unit.question_type,
      lesson_id: unit.lesson_id,
      unit_id: unit.unit_id,
      unit_seq: unit.unit_seq,
      is_completed: unit.is_completed,
      is_correct: unit.is_correct,
      confidence_pct: unit.confidence_pct,
      consecutive_correct_count: unit.consecutive_correct_count,
    })),
  };

  const dailySummaryBuckets = new Map<
    string,
    {
      trend: Array<{
        date: string | null;
        avg_correctness_pct: number | null;
        avg_confidence_pct: number | null;
        units: number | null;
      }>;
      correctnessValues: number[];
      confidenceValues: number[];
    }
  >();
  for (const row of rawSummaryRows) {
    const curriculumId =
      row?.external_curriculum_id != null ? String(row.external_curriculum_id) : null;
    if (!curriculumId) continue;
    if (!dailySummaryBuckets.has(curriculumId)) {
      dailySummaryBuckets.set(curriculumId, {
        trend: [],
        correctnessValues: [],
        confidenceValues: [],
      });
    }
    const bucket = dailySummaryBuckets.get(curriculumId)!;
    const avgCorrectness =
      row?.avg_correctness != null && Number.isFinite(Number(row.avg_correctness))
        ? Number(row.avg_correctness)
        : null;
    const avgConfidence =
      row?.avg_confidence != null && Number.isFinite(Number(row.avg_confidence))
        ? Number(row.avg_confidence)
        : null;
    bucket.trend.push({
      date: row?.date ?? null,
      avg_correctness_pct: avgCorrectness != null ? Number(avgCorrectness.toFixed(2)) : null,
      avg_confidence_pct: avgConfidence != null ? Number(avgConfidence.toFixed(2)) : null,
      units: row?.units ?? null,
    });
    if (avgCorrectness != null) bucket.correctnessValues.push(avgCorrectness);
    if (avgConfidence != null) bucket.confidenceValues.push(avgConfidence);
  }

  const dailySummary = new Map<string, DailySummary>();
  for (const [curriculumId, bucket] of dailySummaryBuckets.entries()) {
    const trend = bucket.trend
      .sort((a, b) => {
        const aDate = a.date ?? '';
        const bDate = b.date ?? '';
        return bDate.localeCompare(aDate);
      })
      .slice(0, dailyTrendLimit);
    const avgCorrectness =
      bucket.correctnessValues.length > 0
        ? bucket.correctnessValues.reduce((sum, value) => sum + value, 0) /
          bucket.correctnessValues.length
        : null;
    const avgConfidence =
      bucket.confidenceValues.length > 0
        ? bucket.confidenceValues.reduce((sum, value) => sum + value, 0) /
          bucket.confidenceValues.length
        : null;
    dailySummary.set(curriculumId, {
      trend,
      averages: {
        avg_correctness_pct: avgCorrectness != null ? Number(avgCorrectness.toFixed(2)) : null,
        avg_confidence_pct: avgConfidence != null ? Number(avgConfidence.toFixed(2)) : null,
      },
    });
  }

  return {
    unitHistory,
    curriculumPerformanceMap,
    curriculumMeta,
    dailySummary,
    studentPerformanceWindow,
    dailySummaryCount: rawSummaryRows.length,
  };
}
