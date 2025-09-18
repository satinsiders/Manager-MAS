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
};
