export const VECTOR_DIM = 1536;
export const MATCH_THRESHOLD = 0.75;
export const MATCH_COUNT = 5;

export const GPT_MINUTES_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45];

export const RECENT_SCORES_TTL = parseInt(
  process.env.LAST_SCORES_TTL ?? '604800',
  10,
);

export const PERFORMANCE_LOOKBACK_DAYS = parseInt(
  process.env.LESSON_PICKER_PERFORMANCE_LOOKBACK_DAYS ?? '45',
  10,
);

export const MAX_UNIT_HISTORY = parseInt(
  process.env.LESSON_PICKER_MAX_UNIT_HISTORY ?? '350',
  10,
);

export const DAILY_TREND_LIMIT = parseInt(
  process.env.LESSON_PICKER_DAILY_TREND_LIMIT ?? '10',
  10,
);

export const DEFAULT_TEMPERATURE = Number.parseFloat(
  process.env.LESSON_PICKER_TEMPERATURE ?? '0.1',
);

export const MAX_EVIDENCE_ITEMS = 6;
export const MAX_UNITS_OVERRIDE_PREVIEW = 3;

export const USE_CATALOG_API_FALLBACK =
  process.env.LESSON_PICKER_USE_CATALOG_API === 'true';
