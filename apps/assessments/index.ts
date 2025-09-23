import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';

type SectionResult = { section: string; correct: number; total: number };

function estimateSectionScore(r: SectionResult) {
  const pct = r.total > 0 ? Math.max(0, Math.min(1, r.correct / r.total)) : 0;
  // Simple v1 method: map percentage to 0–100, with mild non-linearity
  const est = Math.round(100 * Math.pow(pct, 0.9));
  return { section: r.section, estimate: est, pct, correct: r.correct, total: r.total };
}

function estimateComposite(sections: ReturnType<typeof estimateSectionScore>[]) {
  if (!sections.length) return 0;
  return Math.round(sections.reduce((a, b) => a + b.estimate, 0) / sections.length);
}

function estimateConfidence(sections: SectionResult[]) {
  const n = sections.reduce((a, b) => a + (b.total || 0), 0);
  // Confidence heuristic: 0–1 scaled by sample size
  return Math.max(0.1, Math.min(1, Math.log10(1 + n) / 2));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { student_id, external_curriculum_id, type, sections } = req.body as {
      student_id: string;
      external_curriculum_id?: string;
      type: 'diagnostic' | 'full-length';
      sections: SectionResult[];
    };
    if (!student_id || !type || !Array.isArray(sections)) {
      res.status(400).json({ error: 'invalid body' });
      return;
    }
    const perSection = sections.map(estimateSectionScore);
    const composite = estimateComposite(perSection);
    const confidence = estimateConfidence(sections);
    const method_version = 'v1-simple';
    const rationale = `Estimated from ${sections.length} sections, total items ${sections.reduce((a, b) => a + (b.total || 0), 0)}.`;

    const { data } = await supabase
      .from('assessments')
      .insert({
        student_id,
        external_curriculum_id: external_curriculum_id ?? null,
        type,
        raw_signals: { sections },
        section_estimates: perSection,
        composite_estimate: composite,
        method_version,
        confidence,
        rationale,
      })
      .select('id')
      .single();

    res.status(200).json({ id: data?.id, composite_estimate: composite, confidence });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'assessment failed' });
  }
}

