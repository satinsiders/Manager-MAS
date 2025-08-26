import type { VercelRequest, VercelResponse } from '@vercel/node';
import Ajv from 'ajv';
import schema from '../../docs/curriculum.schema.json';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';
const ajv = new Ajv({ allErrors: true });
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
        lesson.units = lesson.units.map((unit: any) => ({
          ...unit,
          duration_minutes: Math.max(
            1,
            Math.round(Number(unit.duration_minutes))
          )
        }));
      }
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { curriculum, qa_user } = req.body as { curriculum: any; qa_user: string };
  try {
    if (!validate(curriculum)) {
      const message = `Curriculum validation failed: ${ajv.errorsText(validate.errors)}`;
      await notify(message, 'qa-formatter');
      res.status(400).json({ error: 'invalid curriculum' });
      return;
    }

    enforceStyle(curriculum);

    await supabase
      .from('curricula')
      .update({
        curriculum,
        qa_user,
        approved_at: new Date().toISOString()
      })
      .eq('version', curriculum.version)
      .eq('student_id', curriculum.student_id);

    await supabase
      .from('students')
      .update({ current_curriculum_version: curriculum.version })
      .eq('id', curriculum.student_id);

    res.status(200).json({ updated: true });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'qa failed' });
  }
}
