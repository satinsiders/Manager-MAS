import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NOTIFICATION_BOT_URL: z.string().url(),
  SUPERFASTSAT_API_URL: z.string().url(),
  SUPERFASTSAT_API_TOKEN: z.string().min(1).optional(),
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
  console.error('Invalid or missing environment variables:', env.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const parsedEnv = env.data;

const hasStaticToken = Boolean(parsedEnv.SUPERFASTSAT_API_TOKEN);

if (!hasStaticToken) {
  console.warn(
    'SUPERFASTSAT_API_TOKEN is not configured. Interactive chat login will be required at runtime.',
  );
}

export const OPENAI_API_KEY = parsedEnv.OPENAI_API_KEY;
export const SUPABASE_URL = parsedEnv.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = parsedEnv.SUPABASE_SERVICE_ROLE_KEY;
export const NOTIFICATION_BOT_URL = parsedEnv.NOTIFICATION_BOT_URL;
export const SUPERFASTSAT_API_URL = parsedEnv.SUPERFASTSAT_API_URL;
export const SUPERFASTSAT_API_TOKEN = parsedEnv.SUPERFASTSAT_API_TOKEN ?? null;
