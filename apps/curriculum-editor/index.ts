import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import OpenAI from 'openai';
import { supabase } from '../../packages/shared/supabase';
import { OPENAI_API_KEY } from '../../packages/shared/config';
import { LATEST_SUMMARY_PATH } from '../../packages/shared/summary';
import { notify } from '../../packages/shared/notify';

export async function fetchLatestSummary() {
  try {
    const { data: file, error } = await supabase.storage
      .from('summaries')
      .download(LATEST_SUMMARY_PATH);
    if (error || !file) return [];
    const rawText = await file.text();
    if (!rawText) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      await notify('Failed to parse latest summary', 'curriculum-editor');
      return [];
    }
    const students: any[] = Array.isArray(parsed.students) ? parsed.students : [];
    return students.map((s) => ({ summary: s, summaryText: JSON.stringify(s) }));
  } catch {
    return [];
  }
}

export async function getNextCurriculumVersion(
  student_id: string,
  client = supabase
) {
  const { data: lastApproved } = await client
    .from('curricula')
    .select('version')
    .eq('student_id', student_id)
    .order('version', { ascending: false })
    .limit(1);

  const { data: lastDraft } = await client
    .from('curricula_drafts')
    .select('version')
    .eq('student_id', student_id)
    .order('version', { ascending: false })
    .limit(1);

  const maxVersion = Math.max(
    lastApproved && lastApproved.length > 0 ? lastApproved[0].version : 0,
    lastDraft && lastDraft.length > 0 ? lastDraft[0].version : 0
  );
  return maxVersion + 1;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Load performance summaries from Supabase storage
    const summaries = await fetchLatestSummary();

    // 2. Retrieve candidate lessons from Supabase
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, topic, difficulty')
      .limit(10);
    const lessonsText = JSON.stringify(lessons);

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const versions: { student_id: string; version: number }[] = [];

    for (const { summary, summaryText } of summaries) {
      const student_id = summary.student_id || 'demo';

      // 3. Ask OpenAI to propose a new curriculum structure
      const prompt = `You are the Study Plan Editor for SAT prep.
Use the student's performance summary and the candidate curriculum options to produce JSON with:
  "curricula" – an array where each item has:
      "id" (UUID from candidates),
      "minutes_recommended" (positive integer minutes per daily dispatch),
      optional "strategy" notes, and optional "units" if specific practice is required.
  "notes" – brief study plan guidance for humans.
Return only valid JSON.
Performance Summary:
${summaryText}
Candidate Curricula:
${lessonsText}`;

      const completion = await openai.responses.create({
        model: 'gpt-5-mini',
        input: prompt,
        temperature: 0.2,
      });
      const llmResponse = completion.output_text || '{}';

      let proposal: any = {};
      try {
        proposal = JSON.parse(llmResponse);
      } catch {
        proposal = { lessons: [], notes: 'LLM response parsing failed' };
      }

      // 4. Determine next curriculum version for the student
      const newVersion = await getNextCurriculumVersion(student_id);

      const defaultMinutes = 15;
      const formattedCurricula = Array.isArray(proposal.curricula)
        ? proposal.curricula
            .filter((item: any) => item && item.id)
            .map((item: any) => ({
              id: item.id,
              minutes_recommended: Math.max(
                1,
                Math.round(Number(item.minutes_recommended ?? defaultMinutes))
              ),
              strategy: item.strategy ?? '',
              units: Array.isArray(item.units) ? item.units : undefined,
            }))
        : [];

      const studyPlan = {
        version: newVersion,
        student_id,
        notes: proposal.notes || '',
        curricula: formattedCurricula,
      };

      await supabase.from('curricula_drafts').insert({
        version: newVersion,
        student_id,
        curriculum: studyPlan
      });

      // 5. Store prompt and response for audit trail
      const auditContent = Buffer.from(
        JSON.stringify({ prompt, response: llmResponse }, null, 2)
      );
      await supabase.storage
        .from('summaries')
        .upload(
          `curriculum_audit/${student_id}_${newVersion}.json`,
          auditContent,
          { upsert: true, contentType: 'application/json' }
        );

      versions.push({ student_id, version: newVersion });
    }

    res.status(200).json({ versions });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'curriculum update failed' });
  }
}
