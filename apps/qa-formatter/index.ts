import type { VercelRequest, VercelResponse } from '@vercel/node';
import Ajv from 'ajv';
import addKeywords from 'ajv-keywords';
import addFormats from 'ajv-formats';
import schema from '../../docs/curriculum.schema.json';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';
import { AGENT_SECRET } from '../../packages/shared/config';
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
addKeywords(ajv, ['uniqueItemProperties']);
const validate = ajv.compile(schema);

function enforceStyle(curriculum: any) {
  if (typeof curriculum.notes === 'string') {
    let notes = curriculum.notes.trim();
    if (notes) {
      notes = notes.charAt(0).toUpperCase() + notes.slice(1);
      if (!notes.endsWith('.')) notes += '.';
      curriculum.notes = notes;
    }
  }
  if (Array.isArray(curriculum.lessons)) {
    for (const lesson of curriculum.lessons) {
      if (Array.isArray(lesson.units)) {
        const seen = new Set<string>();
        lesson.units = lesson.units.map((unit: any) => {
          if (!unit.id || unit.duration_minutes == null) {
            throw new Error('unit missing id or duration_minutes');
          }
          if (seen.has(unit.id)) {
            throw new Error(`duplicate unit id ${unit.id} in lesson ${lesson.id}`);
          }
          seen.add(unit.id);
          return {
            ...unit,
            duration_minutes: Math.max(
              1,
              Math.round(Number(unit.duration_minutes))
            )
          };
        });
      }
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${AGENT_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const {
    student_id,
    version,
    qa_user
  } = req.body as { student_id: string; version: number; qa_user: string };
  try {
    const { data: draft } = await supabase
      .from('curricula_drafts')
      .select('curriculum')
      .eq('student_id', student_id)
      .eq('version', version)
      .single();

    const curriculum = draft?.curriculum;
    if (!curriculum) {
      res.status(404).json({ error: 'draft not found' });
      return;
    }

    if (!validate(curriculum)) {
      const message = `Curriculum validation failed: ${ajv.errorsText(validate.errors)}`;
      await notify(message, 'qa-formatter');
      res.status(400).json({ error: 'invalid curriculum' });
      return;
    }

    try {
      enforceStyle(curriculum);
    } catch (err: any) {
      const message = `Curriculum validation failed: ${err.message}`;
      await notify(message, 'qa-formatter');
      res.status(400).json({ error: 'invalid curriculum' });
      return;
    }

    await supabase.from('curricula').insert({
      version,
      student_id,
      curriculum,
      qa_user,
      approved_at: new Date().toISOString()
    });

    await supabase
      .from('students')
      .update({ current_curriculum_version: version })
      .eq('id', student_id);

    await supabase
      .from('curricula_drafts')
      .delete()
      .eq('student_id', student_id)
      .eq('version', version);

    res.status(200).json({ updated: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'qa failed' });
  }
}
