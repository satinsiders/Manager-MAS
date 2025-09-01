import { z } from 'zod';

const envSchema = z.object({
  SLACK_WEBHOOK_URL: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NOTIFICATION_BOT_URL: z.string().url(),
  LESSON_PICKER_URL: z.string().url(),
  DISPATCHER_URL: z.string().url(),
  DATA_AGGREGATOR_URL: z.string().url(),
  CURRICULUM_EDITOR_URL: z.string().url(),
  QA_FORMATTER_URL: z.string().url(),
  SUPERFASTSAT_API_URL: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
  console.error('Invalid or missing environment variables:', env.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const {
  SLACK_WEBHOOK_URL,
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  NOTIFICATION_BOT_URL,
  LESSON_PICKER_URL,
  DISPATCHER_URL,
  DATA_AGGREGATOR_URL,
  CURRICULUM_EDITOR_URL,
  QA_FORMATTER_URL,
  SUPERFASTSAT_API_URL,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} = env.data;
