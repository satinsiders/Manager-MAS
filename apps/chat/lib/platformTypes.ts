// Platform-related types extracted from index.ts

export type PlatformOperation =
  | 'list_students'
  | 'list_student_curriculums'
  | 'list_study_schedules'
  | 'list_curriculums'
  | 'set_learning_volume'
  | 'grant_student_course';

export type PlatformToolArgs = {
  operation: PlatformOperation;
  input?: Record<string, unknown>;
};

export const PLATFORM_OPERATIONS: PlatformOperation[] = [
  'list_students',
  'list_student_curriculums',
  'list_study_schedules',
  'list_curriculums',
  'set_learning_volume',
  'grant_student_course',
];
