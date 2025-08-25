import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/supabase';
import { redis } from '../../packages/redis';
import { openai } from '../../packages/openai';
import fetch from 'node-fetch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch lessons' });
    }

    const lesson = data?.[0];
    if (lesson) {
      await redis.set('current_lesson', lesson);
      if (process.env.SLACK_WEBHOOK_URL) {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `New lesson: ${lesson.title}` })
        });
      }
    }

    // Placeholder OpenAI usage
    if (lesson) {
      await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: 'Summarize the lesson.' }, { role: 'user', content: lesson.content ?? '' }]
      });
    }

    res.status(200).json({ lesson });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Unexpected error' });
  }
}
