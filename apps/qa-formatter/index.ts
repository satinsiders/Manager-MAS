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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { curriculum, qa_user } = req.body as { curriculum: any; qa_user: string };
  const studentId: string = curriculum.student_id;
  try {
    if (!validate(curriculum)) {
      const message = `Curriculum validation failed: ${ajv.errorsText(validate.errors)}`;
      await notify({ agent: 'qa-formatter', studentId, error: message });
      res.status(400).json({ error: 'invalid curriculum' });
      return;
    }

    enforceStyle(curriculum);

    await supabase
      .from('curricula')
      .update({
        notes: curriculum.notes,
        qa_user,
        approved_at: new Date().toISOString()
      })
      .eq('version', curriculum.version)
      .eq('student_id', curriculum.student_id);

    await supabase
      .from('students')
      .update({ current_curriculum_version: curriculum.version })
      .eq('id', studentId);

    await notify({ agent: 'qa-formatter', studentId });
    res.status(200).json({ updated: true });
  } catch (err:any) {
    console.error(err);
    await notify({ agent: 'qa-formatter', studentId, error: err.message });
    res.status(500).json({ error: 'qa failed' });
  }
}
