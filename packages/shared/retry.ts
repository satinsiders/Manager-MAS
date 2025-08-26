import fetch, { Response } from 'node-fetch';
import { supabase } from './supabase';

export async function callWithRetry(
  url: string,
  options: any,
  runType: string,
  step: string,
  retries = 3,
  logTable = 'service_log'
): Promise<Response | null> {
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
      if (attempt === retries) {
        await supabase.from(logTable).insert({
          run_type: runType,
          step,
          success: false,
          message: err.message,
          run_at: new Date().toISOString(),
        });
        return null;
      }
    }
  }
  return null;
}

