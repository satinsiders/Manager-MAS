import { supabase } from '../../packages/shared/supabase';
import { callWithRetry } from '../../packages/shared/retry';
import { notify } from '../../packages/shared/notify';
import { SUPERFASTSAT_API_TOKEN, SUPERFASTSAT_API_URL } from '../../packages/shared/config';
import type { PlatformDispatch } from './types';

function cleanSegment(s: string): string {
  return (s || '')
    .replace(/^\s*\[(.*?)\]\s*$/, '$1')
    .replace(/[–—]/g, '-')
    .replace(/\(.+?\)/g, '')
    .split(/\s+-\s+|\s+–\s+|\s+—\s+/)[0]
    .trim()
    .toLowerCase();
}

function inferCurriculumSubtype(rawTitle: string): string | null {
  const lower = rawTitle.toLowerCase();

  const baseSubtype = (() => {
    if (/(diagnostic|placement)/.test(lower)) return 'diagnostic';
    if (/full[ -]?length/.test(lower) || /full[ -]?test/.test(lower)) return 'full_length';
    if (/(assessment|exam)/.test(lower)) return 'assessment';
    if (/(guidance|lesson|lecture|strategy)/.test(lower)) return 'guidance';
    if (/(practice|drill|problem set|problem-set)/.test(lower)) return 'practice';
    if (/(review|recap)/.test(lower)) return 'review';
    return null;
  })();

  const difficulty = (() => {
    if (/beginner|easy|foundation/.test(lower)) return 'easy';
    if (/medium|intermediate/.test(lower)) return 'medium';
    if (/hard|advanced|challenge/.test(lower)) return 'hard';
    return null;
  })();

  if (!baseSubtype && !difficulty) return null;
  if (baseSubtype && difficulty) {
    return `${baseSubtype}_${difficulty}`;
  }
  return baseSubtype ?? difficulty;
}

export function parseTitleToTaxonomy(
  rawTitle?: string
): { domain: string; category: string; specific_type: string; canonical_path: string; subtype: string | null } | null {
  if (!rawTitle || typeof rawTitle !== 'string') return null;
  const parts = rawTitle.split('>').map((p) => cleanSegment(p));
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return null;
  let domain = 'unknown';
  let category = 'general';
  let specific = filtered[filtered.length - 1];
  if (filtered.length >= 3) {
    domain = filtered[0];
    category = filtered[1];
  } else if (filtered.length === 2) {
    domain = filtered[0];
    category = 'general';
  }
  const canonical_path = `${domain} > ${category} > ${specific}`;
  const subtype = inferCurriculumSubtype(rawTitle) ?? null;
  return { domain, category, specific_type: specific, canonical_path, subtype };
}

export function mapStudentCurriculums(list: any[], studentId: string): PlatformDispatch[] {
  return list
    .map((it: any) => {
      const curriculumId = it.curriculumId ?? it.external_curriculum_id ?? it.id;
      if (curriculumId == null) return null;
      return {
        student_id: studentId,
        external_curriculum_id: String(curriculumId),
        student_curriculum_id: it.id != null ? String(it.id) : String(curriculumId),
        raw_title: it.title ?? it.raw_title ?? it.name ?? null,
        total_minutes: it.totalDuration ?? it.total_minutes ?? it.total ?? it.minutes_total ?? null,
        remaining_minutes: it.remainingDuration ?? it.remaining_minutes ?? it.remaining ?? it.minutes_remaining ?? null,
        first_dispatched_at: it.createdAt ?? it.first_dispatched_at ?? it.first ?? null,
        last_dispatched_at: it.stoppedAt ?? it.last_dispatched_at ?? it.last ?? null,
      } as PlatformDispatch;
    })
    .filter(Boolean) as PlatformDispatch[];
}

export async function upsertCatalogFromDispatches(rows: PlatformDispatch[], client = supabase) {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.external_curriculum_id && r.raw_title) {
      map.set(r.external_curriculum_id, r.raw_title);
    }
  }
  if (map.size === 0) return;

  for (const [extId, rawTitle] of map.entries()) {
    const parsed = parseTitleToTaxonomy(rawTitle);
    if (!parsed) continue;

    const { data: existingCat } = await client
      .from('curriculum_catalog')
      .select('external_curriculum_id, question_type_id, subtype')
      .eq('external_curriculum_id', extId)
      .limit(1);
    let qtypeId: string | null = null;
    if (existingCat && existingCat.length > 0) {
      try {
        const { data: qrow } = await client
          .from('question_types')
          .select('canonical_path')
          .eq('id', (existingCat[0] as any).question_type_id)
          .single();
        const existingCanonical = qrow?.canonical_path ?? '';
        if (parsed.canonical_path && existingCanonical && parsed.canonical_path !== existingCanonical) {
          await notify(
            `Catalog rename detected for ${extId}: parsed canonical "${parsed.canonical_path}" differs from existing "${existingCanonical}". Keeping existing mapping. Raw title: "${rawTitle}"`,
            'platform-sync'
          );
        }
      } catch {
        /* ignore */
      }
      await client
        .from('curriculum_catalog')
        .upsert({
          external_curriculum_id: extId,
          raw_title: rawTitle,
          question_type_id: existingCat[0].question_type_id,
          subtype: parsed?.subtype ?? (existingCat[0] as any).subtype ?? null,
          active: true,
          ingested_at: new Date().toISOString(),
        });
      continue;
    }

    const { data: foundQ } = await client
      .from('question_types')
      .select('id')
      .eq('canonical_path', parsed.canonical_path)
      .limit(1);
    if (foundQ && foundQ.length > 0) {
      qtypeId = (foundQ[0] as any).id;
    } else {
      const { data: insertedQ } = await client
        .from('question_types')
        .insert({
          domain: parsed.domain,
          category: parsed.category,
          specific_type: parsed.specific_type,
          canonical_path: parsed.canonical_path,
        })
        .select('id')
        .single();
      qtypeId = insertedQ?.id ?? null;
    }
    if (!qtypeId) continue;

    await client
      .from('curriculum_catalog')
      .upsert({
        external_curriculum_id: extId,
        raw_title: rawTitle,
        question_type_id: qtypeId,
        subtype: parsed?.subtype ?? null,
        active: true,
        ingested_at: new Date().toISOString(),
      });
  }
}

export async function syncCurriculumCatalogFromApi(client = supabase) {
  const url = `${SUPERFASTSAT_API_URL.replace(/\/$/, '')}/curriculums`;
  const resp = await callWithRetry(
    url,
    {
      headers: {
        Authorization: `Bearer ${SUPERFASTSAT_API_TOKEN}`,
      },
    },
    'platform-sync',
    'catalog'
  );
  if (!resp) return;
  let list: any[] = [];
  try {
    const body: any = await resp.json();
    list = Array.isArray(body) ? body : body?.items ?? [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list) || list.length === 0) return;
  const rows: PlatformDispatch[] = list
    .map((item: any) => {
      const id = item?.id ?? item?.curriculumId;
      if (id == null) return null;
      return {
        student_id: 'catalog',
        external_curriculum_id: String(id),
        raw_title: item?.title ?? null,
      } as PlatformDispatch;
    })
    .filter(Boolean) as PlatformDispatch[];
  if (rows.length) await upsertCatalogFromDispatches(rows, client);
}
