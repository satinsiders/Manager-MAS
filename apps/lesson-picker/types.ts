export type Lesson = {
  id: string;
  difficulty: number;
  topic?: string;
  [key: string]: any;
};

export type RuleFilter = (lesson: Lesson) => boolean;

export type UnitHistoryEntry = {
  curriculum_id: string;
  scheduled_date: string | null;
  lesson_id: string | null;
  unit_id: string | null;
  unit_seq: number | null;
  is_completed: boolean | null;
  is_correct: boolean | null;
  confidence_pct: number | null;
  consecutive_correct_count: number | null;
  question_type: string | null;
};

export type AggregateStats = {
  total_units: number;
  completed_units: number;
  graded_units: number;
  correct_units: number;
  incorrect_units: number;
  accuracy_pct: number | null;
  avg_confidence_pct: number | null;
  last_activity: string | null;
};

export type LessonPerformance = {
  lesson_id: string | null;
  scheduled_date: string | null;
  consecutive_correct_count: number | null;
  totals: AggregateStats;
  units: Array<{
    unit_id: string | null;
    unit_seq: number | null;
    scheduled_date: string | null;
    is_completed: boolean | null;
    is_correct: boolean | null;
    confidence_pct: number | null;
    consecutive_correct_count: number | null;
  }>;
};

export type CurriculumMeta = {
  raw_title: string | null;
  question_type: string | null;
  subtype: string | null;
};

export type CurriculumPerformanceSummary = {
  curriculum_id: string;
  question_type: string | null;
  totals: AggregateStats;
  recent_lessons: LessonPerformance[];
  raw_title: string | null;
  subtype: string | null;
};

export type QuestionTypeRollup = {
  question_type: string;
  curriculum_ids: string[];
  totals: AggregateStats;
};

export type StudentPerformanceWindow = {
  lookback_days: number;
  totals: AggregateStats;
  question_type_breakdown: QuestionTypeRollup[];
  unit_history: Array<{
    scheduled_date: string | null;
    curriculum_id: string;
    question_type: string | null;
    lesson_id: string | null;
    unit_id: string | null;
    unit_seq: number | null;
    is_completed: boolean | null;
    is_correct: boolean | null;
    confidence_pct: number | null;
    consecutive_correct_count: number | null;
  }>;
};

export type StudentContext = {
  average_score: number;
  recent_scores: number[];
  suggested_minutes: number;
  preferred_topics: string[];
  mastered_types: string[];
  performance_window: StudentPerformanceWindow;
};

export type CurriculumOption = {
  curriculum_id: string;
  topic: string | null;
  difficulty: number | null;
  similarity: number | null;
  question_type_path: string | null;
  remaining_minutes: number | null;
  mastered_question_type: boolean;
  raw_title: string | null;
  subtype: string | null;
  performance: CurriculumPerformanceSummary;
  daily_trend: DailyTrendPoint[];
  daily_averages: DailySummaryAverages | null;
};

export type DailyTrendPoint = {
  date: string | null;
  avg_correctness_pct: number | null;
  avg_confidence_pct: number | null;
  units: number | null;
};

export type DailySummaryAverages = {
  avg_correctness_pct: number | null;
  avg_confidence_pct: number | null;
};

export type DailySummary = {
  trend: DailyTrendPoint[];
  averages: DailySummaryAverages;
};

export type DataInventory = {
  lookback_start: string;
  unit_history_rows: number;
  daily_summary_rows: number;
};

export type DecisionInput = {
  student_profile: StudentContext;
  curriculum_options: CurriculumOption[];
  policies: {
    minute_choices: number[];
    default_minutes: number;
    minute_floor: number;
    minute_ceiling: number;
  };
  data_inventory: DataInventory;
};

export type ModelDecision = {
  action?: 'dispatch_minutes' | 'dispatch_units' | 'request_new_curriculum';
  curriculum_id?: string;
  minutes?: number;
  reason?: string;
  evidence?: string[];
  units_override?: any[];
  confidence?: number | null;
};

export type ModelDecisionResult = {
  action: 'dispatch_minutes' | 'dispatch_units' | 'request_new_curriculum';
  curriculum_id: string | null;
  minutes: number | null;
  reason: string | null;
  evidence: string[];
  units_override: any[] | null;
};
