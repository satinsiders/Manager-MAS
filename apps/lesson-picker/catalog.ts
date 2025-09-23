import { platformFetch } from '../../packages/shared/platform';
import { isPlatformAuthConfigured } from '../../packages/shared/platformAuth';
import { USE_CATALOG_API_FALLBACK } from './constants';
import { CurriculumMeta, Lesson } from './types';

function topicFromCanonicalPath(path: string | null | undefined) {
  if (!path) return null;
  const parts = path.split('>').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

function fallbackTopicFromTitle(title: string | null | undefined) {
  if (!title) return null;
  const cleaned = title.split('>').map((part) => part.trim()).filter(Boolean);
  if (cleaned.length === 0) return title.trim() || null;
  return cleaned[cleaned.length - 1];
}

export async function loadCurriculumMeta(
  client: typeof import('../../packages/shared/supabase').supabase,
  curriculumIds: string[],
): Promise<Map<string, CurriculumMeta>> {
  if (curriculumIds.length === 0) return new Map();

  const uniqueIds = Array.from(new Set(curriculumIds.filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const { data } = await client
    .from('curriculum_catalog')
    .select('external_curriculum_id, raw_title, subtype, question_types(canonical_path)')
    .in('external_curriculum_id', uniqueIds);

  const map = new Map<string, CurriculumMeta>();
  for (const row of data ?? []) {
    const key = String((row as any).external_curriculum_id);
    const canonical = (row as any).question_types?.canonical_path ?? null;
    map.set(key, {
      raw_title: (row as any).raw_title ?? null,
      question_type: canonical,
      subtype: (row as any).subtype ?? null,
    });
  }
  return map;
}

async function fetchCatalogFromApi(limit: number): Promise<Lesson[]> {
  if (!isPlatformAuthConfigured()) return [];
  try {
    const response = await platformFetch('/curriculums');
    if (!response?.ok) return [];
    const body: any = await response.json();
    const list: any[] = Array.isArray(body) ? body : body?.items ?? [];
    return list.slice(0, limit).map((item: any) => ({
      id: String(item?.id ?? item?.curriculumId ?? ''),
      difficulty: Number(item?.difficulty ?? 2) || 2,
      topic: fallbackTopicFromTitle(item?.title ?? null),
    })) as Lesson[];
  } catch {
    return [];
  }
}

export async function fetchAdditionalCurricula(
  client: typeof import('../../packages/shared/supabase').supabase,
  excludeIds: Set<string>,
  limit: number,
  options: { useApiFallback?: boolean } = {},
): Promise<{ lessons: Lesson[]; meta: Map<string, CurriculumMeta> }> {
  if (limit <= 0) return { lessons: [], meta: new Map() };

  const { data } = await client
    .from('curriculum_catalog')
    .select('external_curriculum_id, raw_title, subtype, question_types(canonical_path)')
    .eq('active', true)
    .order('ingested_at', { ascending: false })
    .limit(limit * 3);

  const lessons: Lesson[] = [];
  const meta = new Map<string, CurriculumMeta>();

  for (const row of data ?? []) {
    const id = String((row as any).external_curriculum_id ?? '');
    if (!id || excludeIds.has(id)) continue;
    const canonical = (row as any).question_types?.canonical_path ?? null;
    const topic = topicFromCanonicalPath(canonical) ?? fallbackTopicFromTitle((row as any).raw_title ?? null);
    lessons.push({ id, topic: topic ?? undefined, difficulty: 2 });
    meta.set(id, {
      raw_title: (row as any).raw_title ?? null,
      question_type: canonical,
      subtype: (row as any).subtype ?? null,
    });
    if (lessons.length >= limit) break;
  }

  if (lessons.length < limit && options.useApiFallback && USE_CATALOG_API_FALLBACK) {
    const apiFallback = await fetchCatalogFromApi(limit * 2);
    for (const lesson of apiFallback) {
      if (!lesson.id || excludeIds.has(lesson.id)) continue;
      lessons.push(lesson);
      if (lessons.length >= limit) break;
    }
  }

  return { lessons, meta };
}
