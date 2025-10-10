import { supabase } from './supabase';

export type QuestionTypeMeta = {
  id: string;
  canonical_path: string | null;
  display_name: string | null;
  specific_type: string | null;
  assessment_code: string | null;
  section_code: string | null;
  skill_code: string | null;
  domain: string | null;
  category: string | null;
};

export type QuestionTypeLookup = {
  byId: Map<string, QuestionTypeMeta>;
  byKey: Map<string, QuestionTypeMeta>;
};

export type NormalizedQuestionType = {
  question_type: string | null;
  question_type_id: string | null;
  canonical_path: string | null;
  meta: QuestionTypeMeta | null;
};

const QUESTION_TYPE_SELECT =
  'id, canonical_path, display_name, specific_type, assessment_code, section_code, skill_code, domain, category';

function normalizeKey(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase() || null;
}

function toMeta(row: any | null | undefined): QuestionTypeMeta | null {
  if (!row || !row.id) return null;
  return {
    id: row.id,
    canonical_path: row.canonical_path ?? null,
    display_name: row.display_name ?? null,
    specific_type: row.specific_type ?? null,
    assessment_code: row.assessment_code ?? null,
    section_code: row.section_code ?? null,
    skill_code: row.skill_code ?? null,
    domain: row.domain ?? null,
    category: row.category ?? null,
  };
}

export function buildQuestionTypeLookup(rows: any[]): QuestionTypeLookup {
  const byId = new Map<string, QuestionTypeMeta>();
  const byKey = new Map<string, QuestionTypeMeta>();
  for (const row of rows ?? []) {
    const meta = toMeta(row);
    if (!meta) continue;
    byId.set(meta.id, meta);
    const keys = new Set<string>();
    if (meta.canonical_path) keys.add(meta.canonical_path);
    if (meta.display_name) keys.add(meta.display_name);
    if (meta.specific_type) keys.add(meta.specific_type);
    if (meta.skill_code) keys.add(meta.skill_code);
    if (meta.domain) keys.add(meta.domain);
    if (meta.category) keys.add(meta.category);
    const segments = (meta.canonical_path ?? '').split('>');
    const leaf = segments[segments.length - 1]?.trim();
    if (leaf) keys.add(leaf);
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (normalized) byKey.set(normalized, meta);
    }
  }
  return { byId, byKey };
}

export async function loadQuestionTypeLookup(client = supabase): Promise<QuestionTypeLookup> {
  const { data } = await client.from('question_types').select(QUESTION_TYPE_SELECT);
  return buildQuestionTypeLookup(data ?? []);
}

export function resolveQuestionTypeMeta(
  lookup: QuestionTypeLookup,
  refs: {
    question_type_id?: string | null;
    question_type?: string | null;
    canonical_path?: string | null;
    skill_code?: string | null;
    display_name?: string | null;
    specific_type?: string | null;
  }
): QuestionTypeMeta | null {
  const { question_type_id, question_type, canonical_path, skill_code, display_name, specific_type } = refs ?? {};
  if (question_type_id) {
    const meta = lookup.byId.get(question_type_id);
    if (meta) return meta;
  }
  const candidates = [
    canonical_path,
    question_type,
    display_name,
    specific_type,
    skill_code,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeKey(candidate);
    if (!normalized) continue;
    const meta = lookup.byKey.get(normalized);
    if (meta) return meta;
  }
  return null;
}

export function normalizeQuestionTypeReference(
  lookup: QuestionTypeLookup,
  refs: {
    question_type_id?: string | null;
    question_type?: string | null;
    canonical_path?: string | null;
    skill_code?: string | null;
    display_name?: string | null;
    specific_type?: string | null;
  }
): NormalizedQuestionType {
  const meta = resolveQuestionTypeMeta(lookup, refs);
  const canonical = meta?.canonical_path ?? refs.canonical_path ?? null;
  const questionType =
    canonical ??
    meta?.display_name ??
    refs.display_name ??
    refs.question_type ??
    meta?.specific_type ??
    refs.specific_type ??
    null;
  const questionTypeId = meta?.id ?? refs.question_type_id ?? null;
  return {
    question_type: questionType,
    question_type_id: questionTypeId,
    canonical_path: canonical,
    meta: meta ?? null,
  };
}

export { QUESTION_TYPE_SELECT };
