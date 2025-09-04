import { supabase } from './supabase';

export interface StudentProgress {
  mastered: boolean;
  last_updated: string | null;
}

export async function getProgress(
  studentId: string,
  questionType: string,
): Promise<StudentProgress> {
  const { data } = await supabase
    .from('student_progress')
    .select('mastered, last_updated')
    .eq('student_id', studentId)
    .eq('question_type', questionType)
    .maybeSingle();

  return data ?? { mastered: false, last_updated: null };
}

export async function updateProgress(
  studentId: string,
  questionType: string,
  mastered: boolean,
): Promise<void> {
  await supabase
    .from('student_progress')
    .upsert({
      student_id: studentId,
      question_type: questionType,
      mastered,
      last_updated: new Date().toISOString(),
    });
}
