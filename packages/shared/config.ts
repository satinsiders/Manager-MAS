import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    SLACK_WEBHOOK_URL: z.string().url(),
    OPENAI_API_KEY: z.string().min(1),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    NOTIFICATION_BOT_URL: z.string().url(),
    LESSON_PICKER_URL: z.string().url(),
    DISPATCHER_URL: z.string().url(),
    ASSIGNMENTS_URL: z.string().url(),
    DATA_AGGREGATOR_URL: z.string().url(),
    CURRICULUM_EDITOR_URL: z.string().url(),
    QA_FORMATTER_URL: z.string().url(),
    SUPERFASTSAT_API_URL: z.string().url(),
    SUPERFASTSAT_API_TOKEN: z.string().min(1).optional(),
    SUPERFASTSAT_TEACHER_EMAIL: z.string().email().optional(),
    SUPERFASTSAT_TEACHER_PASSWORD: z.string().min(1).optional(),
    ORCHESTRATOR_URL: z.string().url(),
    ORCHESTRATOR_SECRET: z.string().min(1),
    SCHEDULER_SECRET: z.string().min(1),
  })
  .superRefine((values, ctx) => {
    const hasStaticToken = Boolean(values.SUPERFASTSAT_API_TOKEN);
    const hasCredentials = Boolean(
      values.SUPERFASTSAT_TEACHER_EMAIL && values.SUPERFASTSAT_TEACHER_PASSWORD,
    );
    if (!hasStaticToken && !hasCredentials) {
      ctx.addIssue({
        path: ['SUPERFASTSAT_API_TOKEN'],
        code: z.ZodIssueCode.custom,
        message:
          'Provide SUPERFASTSAT_API_TOKEN or SUPERFASTSAT_TEACHER_EMAIL and SUPERFASTSAT_TEACHER_PASSWORD',
      });
    }
  });

const env = envSchema.safeParse(process.env);
if (!env.success) {
  console.error('Invalid or missing environment variables:', env.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const parsedEnv = env.data;

export const SLACK_WEBHOOK_URL = parsedEnv.SLACK_WEBHOOK_URL;
export const OPENAI_API_KEY = parsedEnv.OPENAI_API_KEY;
export const SUPABASE_URL = parsedEnv.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = parsedEnv.SUPABASE_SERVICE_ROLE_KEY;
export const NOTIFICATION_BOT_URL = parsedEnv.NOTIFICATION_BOT_URL;
export const LESSON_PICKER_URL = parsedEnv.LESSON_PICKER_URL;
export const DISPATCHER_URL = parsedEnv.DISPATCHER_URL;
export const ASSIGNMENTS_URL = parsedEnv.ASSIGNMENTS_URL;
export const DATA_AGGREGATOR_URL = parsedEnv.DATA_AGGREGATOR_URL;
export const CURRICULUM_EDITOR_URL = parsedEnv.CURRICULUM_EDITOR_URL;
export const QA_FORMATTER_URL = parsedEnv.QA_FORMATTER_URL;
export const SUPERFASTSAT_API_URL = parsedEnv.SUPERFASTSAT_API_URL;
export const SUPERFASTSAT_API_TOKEN = parsedEnv.SUPERFASTSAT_API_TOKEN ?? null;
export const SUPERFASTSAT_TEACHER_EMAIL = parsedEnv.SUPERFASTSAT_TEACHER_EMAIL ?? null;
export const SUPERFASTSAT_TEACHER_PASSWORD = parsedEnv.SUPERFASTSAT_TEACHER_PASSWORD ?? null;
export const ORCHESTRATOR_URL = parsedEnv.ORCHESTRATOR_URL;
export const ORCHESTRATOR_SECRET = parsedEnv.ORCHESTRATOR_SECRET;
export const SCHEDULER_SECRET = parsedEnv.SCHEDULER_SECRET;
