import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Provide Supabase connection details if not already set
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service_role_key';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

(async () => {
  // Seed prerequisite student and lesson
  const studentId = randomUUID();
  const lessonId = randomUUID();

  let res = await supabase
    .from('students')
    .insert({ id: studentId, name: 'Test', timezone: 'UTC' });
  assert.equal(res.error, null);

  res = await supabase
    .from('lessons')
    .insert({ id: lessonId, topic: 'Base', difficulty: 1 });
  assert.equal(res.error, null);

  // Lessons should be append-only
  const { error: updateLessonError } = await supabase
    .from('lessons')
    .update({ topic: 'Updated' })
    .eq('id', lessonId);
  assert.ok(updateLessonError);

  const { error: deleteLessonError } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId);
  assert.ok(deleteLessonError);

  // Performances should be append-only
  const performanceId = randomUUID();
  const { error: insertPerformanceError } = await supabase
    .from('performances')
    .insert({
      id: performanceId,
      student_id: studentId,
      lesson_id: lessonId,
      score: 1,
    });
  assert.equal(insertPerformanceError, null);

  const { error: updatePerformanceError } = await supabase
    .from('performances')
    .update({ score: 2 })
    .eq('id', performanceId);
  assert.ok(updatePerformanceError);

  const { error: deletePerformanceError } = await supabase
    .from('performances')
    .delete()
    .eq('id', performanceId);
  assert.ok(deletePerformanceError);

  // Assignments should be append-only
  const assignmentId = randomUUID();
  const { error: insertAssignmentError } = await supabase
    .from('assignments')
    .insert({
      id: assignmentId,
      lesson_id: lessonId,
      student_id: studentId,
      questions_json: {},
      generated_by: 'test',
    });
  assert.equal(insertAssignmentError, null);

  const { error: updateAssignmentError } = await supabase
    .from('assignments')
    .update({ generated_by: 'other' })
    .eq('id', assignmentId);
  assert.ok(updateAssignmentError);

  const { error: deleteAssignmentError } = await supabase
    .from('assignments')
    .delete()
    .eq('id', assignmentId);
  assert.ok(deleteAssignmentError);

  // Curricula should be append-only
  const version = 1;
  const { error: insertCurriculaError } = await supabase
    .from('curricula')
    .insert({
      version,
      student_id: studentId,
      lesson_ids: [lessonId],
      notes: 'initial',
    });
  assert.equal(insertCurriculaError, null);

  const { error: updateCurriculaError } = await supabase
    .from('curricula')
    .update({ notes: 'updated' })
    .eq('version', version)
    .eq('student_id', studentId);
  assert.ok(updateCurriculaError);

  const { error: deleteCurriculaError } = await supabase
    .from('curricula')
    .delete()
    .eq('version', version)
    .eq('student_id', studentId);
  assert.ok(deleteCurriculaError);
})();

