import fetch, { Response } from 'node-fetch';
import { supabase } from './supabase';

export const BASE_DELAY_MS = 200;

export async function callWithRetry(
  url: string,
  options: any,
  runType: string,
  step: string,
  retries = 3,
  logTable = 'service_log',
): Promise<Response> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await supabase.from(logTable).insert({
        run_type: runType,
        step,
        success: true,
        run_at: new Date().toISOString(),
      });
      return resp;
    } catch (err: any) {
      lastError = err;
      if (attempt === retries) {
        await supabase.from(logTable).insert({
          run_type: runType,
          step,
          success: false,
          message: err.message,
          run_at: new Date().toISOString(),
        });
        throw err;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

