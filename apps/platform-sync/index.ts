import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { callWithRetry } from '../../packages/shared/retry';
import { notify } from '../../packages/shared/notify';

export type PlatformDispatch = {
  student_id: string;
  external_curriculum_id: string;
  raw_title?: string;
  total_minutes?: number | null;
  remaining_minutes?: number | null;
  first_dispatched_at?: string | null;
  last_dispatched_at?: string | null;
};

export type DailyPerformance = {
  student_id: string;
  date: string; // YYYY-MM-DD
  external_curriculum_id: string;
  bundle_ref: string;
  avg_correctness?: number | null;
  avg_confidence?: number | null;
  units?: number | null;
};

export async function upsertDispatchMirror(rows: PlatformDispatch[], client = supabase) {
  for (const r of rows) {
    await client
      .from('platform_dispatches')
      .upsert(
        {
          student_id: r.student_id,
          external_curriculum_id: r.external_curriculum_id,
          raw_title: r.raw_title ?? null,
          total_minutes: r.total_minutes ?? null,
          remaining_minutes: r.remaining_minutes ?? null,
          first_dispatched_at: r.first_dispatched_at ?? null,
          last_dispatched_at: r.last_dispatched_at ?? null,
          ingested_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,external_curriculum_id' }
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

function cleanSegment(s: string): string {
  return (s || '')
    .replace(/^\s*\[(.*?)\]\s*$/, '$1') // strip brackets
    .replace(/[–—]/g, '-')
    .replace(/\(.+?\)/g, '') // remove parenthetical
    .split(/\s+-\s+|\s+–\s+|\s+—\s+/)[0] // strip descriptors after dash
    .trim()
    .toLowerCase();
}

export function parseTitleToTaxonomy(rawTitle?: string): { domain: string; category: string; specific_type: string; canonical_path: string } | null {
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
    // if first had brackets, cleanSegment already removed them
    domain = filtered[0];
    category = 'general';
  }
  const canonical_path = `${domain} > ${category} > ${specific}`;
  return { domain, category, specific_type: specific, canonical_path };
}

export async function upsertCatalogFromDispatches(rows: PlatformDispatch[], client = supabase) {
  // Build a map: external_curriculum_id -> raw_title
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

    // If catalog already has this external id, update title only (keep mapping stable)
    const { data: existingCat } = await client
      .from('curriculum_catalog')
      .select('external_curriculum_id, question_type_id')
      .eq('external_curriculum_id', extId)
      .limit(1);
    let qtypeId: string | null = null;
    if (existingCat && existingCat.length > 0) {
      // Compare parsed canonical path to existing question type's canonical path.
      // If they differ, alert but keep the existing mapping stable.
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
      // Update raw_title/active and skip remapping
      await client
        .from('curriculum_catalog')
        .upsert({
          external_curriculum_id: extId,
          raw_title: rawTitle,
          question_type_id: existingCat[0].question_type_id,
          active: true,
          ingested_at: new Date().toISOString(),
        });
      continue;
    }

    // Upsert question_types by canonical_path
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
        active: true,
        ingested_at: new Date().toISOString(),
      });
  }
}

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
      await upsertDispatchMirror(dispatches);
      await upsertCatalogFromDispatches(dispatches);
    }
    if (daily_performance.length) await upsertDailyPerformance(daily_performance);

    // If no explicit body provided, optionally fetch from platform APIs for all active students
    const DISPATCH_URL = process.env.PLATFORM_DISPATCH_LIST_URL; // API 3
    const DAILY_URL = process.env.PLATFORM_DAILY_PERFORMANCE_URL; // API 5
    if (!dispatches.length && !daily_performance.length && (DISPATCH_URL || DAILY_URL)) {
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .eq('active', true);
      for (const s of students ?? []) {
        const sid = s.id;
        if (DISPATCH_URL) {
          const resp = await callWithRetry(
            `${DISPATCH_URL}?student_id=${encodeURIComponent(sid)}`,
            {},
            'platform-sync',
            `api3:${sid}`
          );
          if (resp) {
            try {
              const body = await resp.json();
              const list: any[] = Array.isArray(body) ? body : (body?.dispatches ?? body?.items ?? []);
              const rows: PlatformDispatch[] = list.map((it: any) => ({
                student_id: sid,
                external_curriculum_id: it.external_curriculum_id ?? it.curriculum_id ?? it.id,
                raw_title: it.raw_title ?? it.title ?? it.name ?? null,
                total_minutes: it.total_minutes ?? it.total ?? it.minutes_total ?? null,
                remaining_minutes: it.remaining_minutes ?? it.remaining ?? it.minutes_remaining ?? null,
                first_dispatched_at: it.first_dispatched_at ?? it.first ?? null,
                last_dispatched_at: it.last_dispatched_at ?? it.last ?? null,
              }));
              if (rows.length) {
                await upsertDispatchMirror(rows);
                await upsertCatalogFromDispatches(rows);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
        if (DAILY_URL) {
          const resp = await callWithRetry(
            `${DAILY_URL}?student_id=${encodeURIComponent(sid)}`,
            {},
            'platform-sync',
            `api5:${sid}`
          );
          if (resp) {
            try {
              const body = await resp.json();
              const summaries: any[] = body?.days ?? body?.daily ?? body?.items ?? [];
              const rows: DailyPerformance[] = [];
              for (const day of summaries) {
                const date = day.date ?? day.day ?? day?.Date ?? null;
                const bundles: any[] = day.bundles ?? day.lessons ?? day.items ?? [];
                for (const b of bundles) {
                  rows.push({
                    student_id: sid,
                    date,
                    external_curriculum_id: b.external_curriculum_id ?? b.curriculum_id ?? b.id,
                    bundle_ref: b.bundle_ref ?? b.bundle_id ?? b.lesson_id ?? `${date}:${Math.random().toString(36).slice(2, 8)}`,
                    avg_correctness: b.avg_correctness ?? b.average_correctness ?? b.correctness ?? null,
                    avg_confidence: b.avg_confidence ?? b.average_confidence ?? b.confidence ?? null,
                    units: b.units ?? b.unit_count ?? b.count ?? null,
                  });
                }
              }
              if (rows.length) await upsertDailyPerformance(rows);
            } catch {
              /* ignore parse errors */
            }
          }
        }
      }
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
