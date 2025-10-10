import { z } from 'zod';
import { supabase } from './supabase';

const studyPlanUnitSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    duration_minutes: z.number().int().nonnegative().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const studyPlanCurriculumSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().optional(),
    strategy: z.string().optional(),
    minutes_recommended: z.number().int().nonnegative().optional(),
    question_type: z.string().optional(),
    track: z.string().optional(),
    units: z.array(studyPlanUnitSchema).optional(),
  })
  .passthrough();

const studyPlanSchema = z
  .object({
    version: z.number().int().positive().optional(),
    student_id: z.string().min(1).optional(),
    notes: z.string().optional(),
    objectives: z.array(z.string()).optional(),
    daily_minutes_target: z.number().int().positive().optional(),
    curricula: z.array(studyPlanCurriculumSchema).optional(),
  })
  .passthrough();

export type StudyPlanPayload = z.infer<typeof studyPlanSchema>;
export type StudyPlanRecord = {
  id: string;
  student_id: string;
  version: number;
  study_plan: StudyPlanPayload;
  qa_user: string | null;
  approved_at: string | null;
};

export type StudyPlanDraftRecord = {
  student_id: string;
  version: number;
  study_plan: StudyPlanPayload;
  created_at: string | null;
};

export type StudyPlanProgressRecord = {
  id: string;
  question_type: string;
  question_type_id?: string | null;
  status: string;
  evidence_window: Record<string, unknown> | null;
  rolling_metrics: Record<string, unknown> | null;
  last_decision_at: string | null;
  context?: {
    canonical_path?: string | null;
    display_name?: string | null;
    domain?: string | null;
    category?: string | null;
    specific_type?: string | null;
    skill_code?: string | null;
    skill_description?: string | null;
    source_url?: string | null;
    metadata?: Record<string, unknown> | null;
    assessment?: {
      code?: string | null;
      reference_code?: string | null;
      name?: string | null;
      total_questions?: number | null;
      total_minutes?: number | null;
      description?: string | null;
      source_url?: string | null;
    };
    section?: {
      code?: string | null;
      reference_code?: string | null;
      name?: string | null;
      total_questions?: number | null;
      total_minutes?: number | null;
      module_count?: number | null;
      description?: string | null;
      notes?: string | null;
    };
    domain_summary?: {
      code?: string | null;
      name?: string | null;
      description?: string | null;
      approx_question_percentage?: number | null;
      questions_min?: number | null;
      questions_max?: number | null;
      grouping_notes?: string | null;
      source_url?: string | null;
    };
  };
};

export type StudentWithStudyPlan = {
  student: {
    id: string;
    name: string | null;
    timezone: string | null;
    preferred_topics: string[] | null;
    platform_student_id: string | null;
    current_curriculum_version: number | null;
    active: boolean | null;
    last_lesson_sent: string | null;
    last_lesson_id: string | null;
  };
  active_plan: StudyPlanRecord | null;
  progress: StudyPlanProgressRecord[];
  drafts: StudyPlanDraftRecord[];
  recent_versions: StudyPlanRecord[];
};

export const DEFAULT_QA_USER = 'mas-automation';

function determineMaxVersion(rows: Array<{ version: number | null | undefined }>): number {
  let max = 0;
  for (const row of rows) {
    const value = typeof row.version === 'number' ? row.version : null;
    if (value && value > max) {
      max = value;
    }
  }
  return max;
}

export function nextStudyPlanVersion(existing: number[], drafts: number[] = []): number {
  const maxExisting = existing.length ? Math.max(...existing) : 0;
  const maxDraft = drafts.length ? Math.max(...drafts) : 0;
  return Math.max(maxExisting, maxDraft) + 1;
}

function normalizeStudyPlanPayload(plan: StudyPlanPayload, studentId: string, version: number): StudyPlanPayload {
  const parsed = studyPlanSchema.parse(plan ?? {});
  const withIdentity = {
    ...parsed,
    student_id: studentId,
    version,
  } as StudyPlanPayload;
  if (withIdentity.curricula) {
    withIdentity.curricula = withIdentity.curricula.map((curriculum) => {
      const parsedCurriculum = studyPlanCurriculumSchema.parse(curriculum);
      if (parsedCurriculum.units) {
        parsedCurriculum.units = parsedCurriculum.units.map((unit) =>
          studyPlanUnitSchema.parse(unit)
        );
      }
      return parsedCurriculum;
    });
  }
  return withIdentity;
}

async function getMaxVersionForStudent(
  table: 'study_plans' | 'curricula_drafts',
  studentId: string,
  client = supabase,
): Promise<number> {
  const query = client
    .from(table)
    .select('version')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(1);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to query ${table} versions: ${error.message}`);
  }
  if (!data || data.length === 0) return 0;
  const max = determineMaxVersion(data as any);
  return max;
}

export async function getNextStudyPlanVersion(studentId: string, client = supabase): Promise<number> {
  const [activeMax, draftMax] = await Promise.all([
    getMaxVersionForStudent('study_plans', studentId, client),
    getMaxVersionForStudent('curricula_drafts', studentId, client),
  ]);
  return Math.max(activeMax, draftMax) + 1;
}

export async function saveStudyPlanDraft(
  studentId: string,
  plan: unknown,
  options: { version?: number; client?: typeof supabase } = {},
): Promise<StudyPlanDraftRecord> {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('studentId is required to save a study plan draft.');
  }
  const client = options.client ?? supabase;
  const targetVersion = options.version ?? (await getNextStudyPlanVersion(studentId, client));
  if (targetVersion <= 0 || !Number.isFinite(targetVersion)) {
    throw new Error('Unable to determine a valid draft version for the study plan.');
  }

  const payload = normalizeStudyPlanPayload(plan as StudyPlanPayload, studentId, targetVersion);
  const { data, error } = await client
    .from('curricula_drafts')
    .upsert(
      {
        student_id: studentId,
        version: targetVersion,
        curriculum: payload,
      },
      { onConflict: 'student_id,version' },
    )
    .select('student_id, version, curriculum, created_at')
    .single();

  if (error) {
    throw new Error(`Failed to save study plan draft: ${error.message}`);
  }

  return {
    student_id: data.student_id,
    version: data.version,
    study_plan: data.curriculum as StudyPlanPayload,
    created_at: data.created_at ?? null,
  };
}

export async function publishStudyPlan(
  studentId: string,
  input: {
    plan?: unknown;
    version?: number;
    draftVersion?: number;
    qaUser?: string | null;
    approvedAt?: string | null;
    deleteDraft?: boolean;
    client?: typeof supabase;
  } = {},
): Promise<StudyPlanRecord> {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('studentId is required to publish a study plan.');
  }
  const client = input.client ?? supabase;

  let planPayload: StudyPlanPayload | null = null;
  let resolvedVersion: number | null = input.version ?? null;

  if (input.draftVersion != null) {
    const { data, error } = await client
      .from('curricula_drafts')
      .select('curriculum, version')
      .eq('student_id', studentId)
      .eq('version', input.draftVersion)
      .single();
    if (error) {
      throw new Error(`Failed to load study plan draft v${input.draftVersion}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Study plan draft version ${input.draftVersion} was not found.`);
    }
    planPayload = data.curriculum as StudyPlanPayload;
    if (resolvedVersion === null) {
      resolvedVersion = data.version ?? null;
    }
  }

  if (input.plan != null) {
    planPayload = input.plan as StudyPlanPayload;
  }

  if (!planPayload) {
    throw new Error('A study plan payload or draftVersion must be provided to publish.');
  }

  const finalVersion = resolvedVersion ?? (await getNextStudyPlanVersion(studentId, client));
  if (!Number.isInteger(finalVersion) || finalVersion <= 0) {
    throw new Error('Unable to resolve a valid study plan version to publish.');
  }

  const normalized = normalizeStudyPlanPayload(planPayload, studentId, finalVersion);
  const qaUser = input.qaUser ?? DEFAULT_QA_USER;
  const approvedAt = input.approvedAt ?? new Date().toISOString();

  const insertResult = await client
    .from('curricula')
    .insert({
      student_id: studentId,
      version: finalVersion,
      curriculum: normalized,
      qa_user: qaUser,
      approved_at: approvedAt,
    })
    .select('id, student_id, version, curriculum, qa_user, approved_at')
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      throw new Error(`Study plan version ${finalVersion} already exists for this student.`);
    }
    throw new Error(`Failed to publish study plan: ${insertResult.error.message}`);
  }

  const updateResult = await client
    .from('students')
    .update({ current_curriculum_version: finalVersion })
    .eq('id', studentId);
  if (updateResult.error) {
    throw new Error(`Study plan published but failed to update student record: ${updateResult.error.message}`);
  }

  if (input.draftVersion != null && input.deleteDraft !== false) {
    await client
      .from('curricula_drafts')
      .delete()
      .eq('student_id', studentId)
      .eq('version', input.draftVersion);
  }

  const record = insertResult.data;
  return {
    id: record.id,
    student_id: record.student_id,
    version: record.version,
    study_plan: record.curriculum as StudyPlanPayload,
    qa_user: record.qa_user ?? null,
    approved_at: record.approved_at ?? null,
  };
}

export async function listStudyPlanDrafts(
  studentId: string,
  options: { client?: typeof supabase; limit?: number } = {},
): Promise<StudyPlanDraftRecord[]> {
  const client = options.client ?? supabase;
  const limit = options.limit && options.limit > 0 ? options.limit : 10;
  const { data, error } = await client
    .from('study_plan_drafts')
    .select('student_id, version, study_plan, created_at')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to list study plan drafts: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    student_id: row.student_id,
    version: row.version,
    study_plan: row.study_plan as StudyPlanPayload,
    created_at: row.created_at ?? null,
  }));
}

export async function listStudyPlanVersions(
  studentId: string,
  options: { client?: typeof supabase; limit?: number } = {},
): Promise<StudyPlanRecord[]> {
  const client = options.client ?? supabase;
  const limit = options.limit && options.limit > 0 ? options.limit : 5;
  const { data, error } = await client
    .from('study_plans')
    .select('id, student_id, version, study_plan, qa_user, approved_at')
    .eq('student_id', studentId)
    .order('version', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to list study plan versions: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    student_id: row.student_id,
    version: row.version,
    study_plan: row.study_plan as StudyPlanPayload,
    qa_user: row.qa_user ?? null,
    approved_at: row.approved_at ?? null,
  }));
}

export async function getStudentStudyPlanSnapshot(
  studentId: string,
  options: {
    client?: typeof supabase;
    includeHistoryCount?: number;
    includeDrafts?: boolean;
    includeProgress?: boolean;
  } = {},
): Promise<StudentWithStudyPlan> {
  if (!studentId || typeof studentId !== 'string') {
    throw new Error('studentId is required to load study plan context.');
  }
  const client = options.client ?? supabase;
  const historyLimit = options.includeHistoryCount ?? 3;

  const { data: studentData, error: studentError } = await client
    .from('students')
    .select(
      'id, name, timezone, preferred_topics, platform_student_id, current_curriculum_version, active, last_lesson_sent, last_lesson_id',
    )
    .eq('id', studentId)
    .single();

  if (studentError) {
    throw new Error(`Failed to load student ${studentId}: ${studentError.message}`);
  }
  if (!studentData) {
    throw new Error(`Student ${studentId} was not found.`);
  }

  const currentVersion = studentData.current_curriculum_version ?? null;
  let activePlan: StudyPlanRecord | null = null;
  if (currentVersion != null) {
    const { data: planData, error: planError } = await client
      .from('study_plans')
      .select('id, student_id, version, study_plan, qa_user, approved_at')
      .eq('student_id', studentId)
      .eq('version', currentVersion)
      .maybeSingle();
    if (planError) {
      throw new Error(`Failed to load active study plan version ${currentVersion}: ${planError.message}`);
    }
    if (planData) {
      activePlan = {
        id: planData.id,
        student_id: planData.student_id,
        version: planData.version,
        study_plan: planData.study_plan as StudyPlanPayload,
        qa_user: planData.qa_user ?? null,
        approved_at: planData.approved_at ?? null,
      };
    }
  }

  const [history, drafts, progress] = await Promise.all([
    listStudyPlanVersions(studentId, { client, limit: historyLimit }),
    options.includeDrafts === false ? Promise.resolve([]) : listStudyPlanDrafts(studentId, { client, limit: historyLimit }),
    options.includeProgress === false
      ? Promise.resolve([])
      : (async () => {
          if (!activePlan) return [] as StudyPlanProgressRecord[];
          const { data: progressRows, error: progressError } = await client
            .from('question_type_mastery')
            .select(
              'study_plan_progress_id, question_type, question_type_id, status, evidence_window, rolling_metrics, last_decision_at, canonical_path, display_name, domain, category, specific_type, skill_code, skill_description, source_url, metadata, assessment_code, assessment_code_reference, assessment_name, assessment_total_questions, assessment_total_minutes, assessment_description, assessment_source_url, section_code, section_code_reference, section_name, section_total_questions, section_total_minutes, section_module_count, section_description, section_notes, domain_code, domain_name, domain_description, approx_question_percentage, questions_min, questions_max, grouping_notes, domain_source_url'
            )
            .eq('student_id', studentId)
            .eq('study_plan_id', activePlan.id)
            .order('last_decision_at', { ascending: false })
            .limit(50);
          if (progressError) {
            throw new Error(`Failed to load study plan progress: ${progressError.message}`);
          }
          return (progressRows ?? []).map((row: any) => ({
            id: row.study_plan_progress_id,
            question_type: row.question_type ?? row.canonical_path ?? row.display_name ?? row.specific_type ?? 'unknown',
            question_type_id: row.question_type_id ?? null,
            status: row.status,
            evidence_window: row.evidence_window ?? null,
            rolling_metrics: row.rolling_metrics ?? null,
            last_decision_at: row.last_decision_at ?? null,
            context: {
              canonical_path: row.canonical_path ?? null,
              display_name: row.display_name ?? null,
              domain: row.domain ?? null,
              category: row.category ?? null,
              specific_type: row.specific_type ?? null,
              skill_code: row.skill_code ?? null,
              skill_description: row.skill_description ?? null,
              source_url: row.source_url ?? null,
              metadata: row.metadata ?? null,
              assessment: {
                code: row.assessment_code ?? null,
                reference_code: row.assessment_code_reference ?? null,
                name: row.assessment_name ?? null,
                total_questions: row.assessment_total_questions ?? null,
                total_minutes: row.assessment_total_minutes ?? null,
                description: row.assessment_description ?? null,
                source_url: row.assessment_source_url ?? null,
              },
              section: {
                code: row.section_code ?? null,
                reference_code: row.section_code_reference ?? null,
                name: row.section_name ?? null,
                total_questions: row.section_total_questions ?? null,
                total_minutes: row.section_total_minutes ?? null,
                module_count: row.section_module_count ?? null,
                description: row.section_description ?? null,
                notes: row.section_notes ?? null,
              },
              domain_summary: {
                code: row.domain_code ?? null,
                name: row.domain_name ?? null,
                description: row.domain_description ?? null,
                approx_question_percentage: row.approx_question_percentage ?? null,
                questions_min: row.questions_min ?? null,
                questions_max: row.questions_max ?? null,
                grouping_notes: row.grouping_notes ?? null,
                source_url: row.domain_source_url ?? null,
              },
            },
          }));
        })(),
  ]);

  return {
    student: {
      id: studentData.id,
      name: (studentData as any).name ?? null,
      timezone: studentData.timezone ?? null,
      preferred_topics: (studentData as any).preferred_topics ?? null,
      platform_student_id: (studentData as any).platform_student_id ?? null,
      current_curriculum_version: studentData.current_curriculum_version ?? null,
      active: (studentData as any).active ?? null,
      last_lesson_sent: (studentData as any).last_lesson_sent ?? null,
      last_lesson_id: (studentData as any).last_lesson_id ?? null,
    },
    active_plan: activePlan,
    progress,
    drafts,
    recent_versions: history,
  };
}

export const __test__ = {
  normalizeStudyPlanPayload,
};
