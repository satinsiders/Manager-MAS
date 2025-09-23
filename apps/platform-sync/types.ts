export type PlatformDispatch = {
  student_id: string;
  external_curriculum_id: string;
  student_curriculum_id?: string | null;
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
  unit_details?: DailyPerformanceUnit[];
};

export type DailyPerformanceUnit = {
  student_id: string;
  date: string; // YYYY-MM-DD
  external_curriculum_id: string;
  lesson_id?: string | null;
  unit_id?: string | null;
  unit_seq?: number | null;
  is_completed?: boolean | null;
  is_correct?: boolean | null;
  confidence?: number | null;
  consecutive_correct_count?: number | null;
  raw?: any;
};
