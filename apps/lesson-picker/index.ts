import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../../packages/shared/config';
import { supabase } from '../../packages/shared/supabase';
import {
  DAILY_TREND_LIMIT,
  MATCH_COUNT,
  MATCH_THRESHOLD,
  MAX_UNIT_HISTORY,
  PERFORMANCE_LOOKBACK_DAYS,
  RECENT_SCORES_TTL,
  VECTOR_DIM,
} from './constants';
import { fetchAdditionalCurricula, loadCurriculumMeta } from './catalog';
import { decisionTemperature, buildDecisionInput, buildSystemPrompt, parseDecision } from './prompt';
import {
  CurriculumMeta,
  CurriculumOption,
  Lesson,
  ModelDecisionResult,
  RuleFilter,
} from './types';
import { buildPerformanceContext, EMPTY_AGGREGATE } from './performance';

// Default clients – injectable for tests
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function normalizeList(values: any[] | null | undefined): string[] {
  return Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [];
}

export async function selectNextLesson(
  student_id: string,
  curriculum_version?: number,
  clients = { supabase, openai },
  ruleFilters: RuleFilter[] = [],
) {
  const { supabase: s, openai: o } = clients;

  const [recentRes, studentRes, progressRes] = await Promise.all([
    s
      .from('student_recent_scores')
      .select('scores, updated_at')
      .eq('student_id', student_id)
      .maybeSingle(),
    s
      .from('students')
      .select('preferred_topics, last_lesson_id')
      .eq('id', student_id)
      .single(),
    s
      .from('student_progress')
      .select('question_type')
      .eq('student_id', student_id)
      .eq('mastered', true),
  ]);

  const recent = recentRes.data;
  let usableScores: number[] = Array.isArray(recent?.scores)
    ? (recent?.scores as number[])
    : [];
  if (recent?.updated_at) {
    const updatedAt = new Date(recent.updated_at).getTime();
    if (Date.now() - updatedAt > RECENT_SCORES_TTL * 1000) {
      usableScores = [];
    }
  }

  const avgScore =
    usableScores.length > 0
      ? usableScores.reduce((sum, value) => sum + Number(value || 0), 0) /
        usableScores.length
      : 0;
  const baseMinutes = avgScore < 60 ? 30 : 15;

  const student = studentRes.data ?? null;
  const topics = normalizeList(student?.preferred_topics);

  const masteredRows = progressRes.data ?? [];
  const masteredList = (masteredRows as any[])
    .map((p) => (p?.question_type ?? '') as string)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
  const masteredTypes = new Set(masteredList);
  const normalizedMastered = new Set(
    masteredList.map((value) => value.toLowerCase()),
  );
  const isMasteredType = (value?: string | null) => {
    if (!value) return false;
    return normalizedMastered.has(value.toLowerCase());
  };

  let embedding: number[] = Array(VECTOR_DIM).fill(0);
  try {
    const response = await o.embeddings.create({
      model: 'text-embedding-3-small',
      input: topics.join(' '),
    });
    const raw = response.data[0]?.embedding || [];
    if (raw.length !== VECTOR_DIM) {
      for (let i = 0; i < Math.min(VECTOR_DIM, raw.length); i++) {
        embedding[i] = raw[i];
      }
    } else {
      embedding = raw;
    }
  } catch (err) {
    console.error(err);
    throw new Error('embedding failed');
  }

  const [matchRes, dispatchRes] = await Promise.all([
    s.rpc('match_lessons', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    }),
    s
      .from('platform_dispatches')
      .select('external_curriculum_id, remaining_minutes')
      .eq('student_id', student_id),
  ]);

  const remainingByCurriculum = new Map<string, number | null>();
  for (const row of dispatchRes.data ?? []) {
    remainingByCurriculum.set(row.external_curriculum_id, row.remaining_minutes ?? null);
  }

  const matchedCandidates: Lesson[] = (matchRes.data ?? [])
    .filter((lesson: Lesson) => lesson.id !== student?.last_lesson_id)
    .filter((lesson: Lesson) => topics.length === 0 || topics.includes(lesson.topic ?? ''));

  const candidatePool: Lesson[] = [];
  const seenCurriculumIds = new Set<string>();
  const applyRuleFilters = (lesson: Lesson) =>
    ruleFilters.length === 0 || ruleFilters.every((fn) => fn(lesson));

  function addCandidate(lesson: Lesson) {
    if (!lesson?.id) return;
    if (seenCurriculumIds.has(lesson.id)) return;
    if (!applyRuleFilters(lesson)) return;
    candidatePool.push(lesson);
    seenCurriculumIds.add(lesson.id);
  }

  for (const lesson of matchedCandidates) addCandidate(lesson);

  const excludeIds = new Set<string>([...seenCurriculumIds]);
  if (student?.last_lesson_id) excludeIds.add(String(student.last_lesson_id));

  let cachedMeta = new Map<string, CurriculumMeta>();
  if (candidatePool.length < MATCH_COUNT) {
    const deficit = MATCH_COUNT - candidatePool.length;
    const { lessons: extraLessons, meta } = await fetchAdditionalCurricula(
      s,
      excludeIds,
      deficit,
      { useApiFallback: true },
    );
    for (const lesson of extraLessons) addCandidate(lesson);
    cachedMeta = new Map([...cachedMeta, ...meta.entries()]);
  }

  if (!candidatePool.length) {
    return { action: 'request_new_curriculum' };
  }

  const candidateList = candidatePool.slice(0, MATCH_COUNT);
  const candidateMap = new Map<string, Lesson>();
  for (const curriculum of candidateList) candidateMap.set(curriculum.id, curriculum);

  const loadMeta = async (ids: string[]): Promise<Map<string, CurriculumMeta>> => {
    const missing = ids.filter((id) => id && !cachedMeta.has(id));
    if (missing.length) {
      const fetched = await loadCurriculumMeta(s, missing);
      for (const [key, value] of fetched.entries()) {
        cachedMeta.set(key, value);
      }
    }
    const result = new Map<string, CurriculumMeta>();
    for (const id of ids) {
      if (cachedMeta.has(id)) {
        result.set(id, cachedMeta.get(id)!);
      }
    }
    return result;
  };

  const performanceContext = await buildPerformanceContext({
    client: s,
    studentId: student_id,
    candidateCurriculumIds: candidateMap.keys(),
    loadCurriculumMeta: loadMeta,
    fallbackQuestionType: (curriculumId) => {
      const meta = cachedMeta.get(curriculumId);
      if (meta?.question_type) return meta.question_type;
      const candidate = candidateMap.get(curriculumId);
      return candidate?.topic ?? null;
    },
    lookbackDays: PERFORMANCE_LOOKBACK_DAYS,
    maxUnitHistory: MAX_UNIT_HISTORY,
    dailyTrendLimit: DAILY_TREND_LIMIT,
  });

  for (const [key, value] of performanceContext.curriculumMeta.entries()) {
    if (!cachedMeta.has(key)) cachedMeta.set(key, value);
  }

  const studentPerformanceWindow = performanceContext.studentPerformanceWindow;
  const studentContext = {
    average_score: avgScore,
    recent_scores: usableScores,
    suggested_minutes: baseMinutes,
    preferred_topics: topics,
    mastered_types: Array.from(masteredTypes),
    performance_window: studentPerformanceWindow,
  };

  const curriculumOptions: CurriculumOption[] = candidateList.map((curriculum) => {
    const meta = cachedMeta.get(curriculum.id);
    const performance =
      performanceContext.curriculumPerformanceMap.get(curriculum.id) ?? {
        curriculum_id: curriculum.id,
        question_type: meta?.question_type ?? curriculum.topic ?? null,
        totals: { ...EMPTY_AGGREGATE },
        recent_lessons: [],
        raw_title: meta?.raw_title ?? null,
        subtype: meta?.subtype ?? null,
      };
    const summary = performanceContext.dailySummary.get(curriculum.id);
    return {
      curriculum_id: curriculum.id,
      topic: curriculum.topic ?? null,
      difficulty: curriculum.difficulty ?? null,
      similarity:
        typeof (curriculum as any).similarity === 'number'
          ? (curriculum as any).similarity
          : null,
      question_type_path: performance.question_type ?? meta?.question_type ?? null,
      remaining_minutes: remainingByCurriculum.get(curriculum.id) ?? null,
      mastered_question_type: performance.question_type
        ? isMasteredType(performance.question_type)
        : false,
      raw_title: performance.raw_title ?? meta?.raw_title ?? null,
      subtype: performance.subtype ?? meta?.subtype ?? null,
      performance,
      daily_trend: summary?.trend ?? [],
      daily_averages: summary?.averages ?? null,
    };
  });

  const lookbackStartIso = new Date(
    Date.now() - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const decisionInput = buildDecisionInput(studentContext, curriculumOptions, {
    lookback_start: lookbackStartIso,
    unit_history_rows: performanceContext.unitHistory.length,
    daily_summary_rows: performanceContext.dailySummaryCount,
  });

  const systemPrompt = buildSystemPrompt();
  const candidateIdSet = new Set(candidateList.map((lesson) => lesson.id));
  const defaultCurriculumId = candidateList[0].id;

  let decision: ModelDecisionResult = {
    action: 'dispatch_minutes',
    curriculum_id: defaultCurriculumId,
    minutes: baseMinutes,
    reason: null,
    evidence: [],
    units_override: null,
  };

  try {
    const gptResponse = await o.responses.create({
      model: 'gpt-5',
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(decisionInput) },
      ],
      temperature: decisionTemperature(),
    });

    decision = parseDecision({
      responseText: gptResponse.output_text || '{}',
      candidateIds: candidateIdSet,
      defaultCurriculumId,
      defaultMinutes: baseMinutes,
    });
  } catch (err) {
    console.error('Lesson picker GPT selection failed, falling back to deterministic choice', err);
  }

  if (decision.action === 'request_new_curriculum') {
    return { action: 'request_new_curriculum', reason: decision.reason ?? null };
  }

  let chosenCurriculumId = decision.curriculum_id ?? defaultCurriculumId;
  if (!chosenCurriculumId || !candidateMap.has(chosenCurriculumId)) {
    chosenCurriculumId = defaultCurriculumId;
  }
  let chosenMinutes = decision.minutes ?? baseMinutes;
  if (!Number.isFinite(chosenMinutes) || chosenMinutes <= 0) {
    chosenMinutes = baseMinutes;
  }
  const selectionReason = decision.reason;

  const next = candidateMap.get(chosenCurriculumId) ?? candidateList[0];

  let chosenQuestionType: string | undefined =
    performanceContext.curriculumPerformanceMap.get(chosenCurriculumId)?.question_type ??
    cachedMeta.get(chosenCurriculumId)?.question_type ??
    (next?.topic ?? undefined);
  if (!chosenQuestionType) {
    try {
      const { data: lessonRow } = await s
        .from('lessons')
        .select('topic')
        .eq('id', next.id)
        .single();
      chosenQuestionType = lessonRow?.topic ?? undefined;
    } catch {
      /* ignore */
    }
  }

  if (chosenQuestionType && isMasteredType(chosenQuestionType)) {
    return { action: 'request_new_curriculum', reason: selectionReason ?? null };
  }

  const remainingMinutes = remainingByCurriculum.get(next.id) ?? null;
  const preferMinutes = remainingMinutes == null || Number(remainingMinutes) > 0;

  let units: any[] = [];
  if (curriculum_version !== undefined) {
    const { data: plan } = await s
      .from('study_plans')
      .select('study_plan')
      .eq('student_id', student_id)
      .eq('version', curriculum_version)
      .single();
    const entry = plan?.study_plan?.curricula?.find((c: any) => c.id === next.id);
    if (entry?.units) {
      units = entry.units as any[];
    }
  }

  if (units.length === 0) {
    if (chosenQuestionType && isMasteredType(chosenQuestionType)) {
      return { action: 'request_new_curriculum', reason: selectionReason ?? null };
    }
    const { data: assigns } = await s
      .from('assignments')
      .select('id, lesson_id, questions_json, duration_minutes')
      .eq('student_id', student_id)
      .eq('lesson_id', next.id);
    units =
      assigns?.map((a: any) => ({
        id: a.id,
        lesson_id: a.lesson_id,
        duration_minutes: a.duration_minutes,
        questions: a.questions_json ?? [],
      })) ?? [];
  }

  try {
    await s
      .from('dispatch_log')
      .insert({
        student_id,
        lesson_id: next.id,
        status: 'selected',
        sent_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error('dispatch_log insert failed', err);
  }

  if (preferMinutes) {
    return {
      next_curriculum_id: next.id,
      minutes: chosenMinutes,
      reason: selectionReason,
      question_type: chosenQuestionType ?? null,
    };
  }

  if (units.length === 0) {
    return { action: 'request_new_curriculum', reason: selectionReason ?? null };
  }

  return {
    next_curriculum_id: next.id,
    minutes: chosenMinutes,
    units,
    reason: selectionReason,
    question_type: chosenQuestionType ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, curriculum_version } = req.body as {
    student_id: string;
    curriculum_version?: number;
  };
  try {
    const result = await selectNextLesson(student_id, curriculum_version);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'lesson selection failed' });
  }
}
