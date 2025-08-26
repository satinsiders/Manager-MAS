import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import { SLACK_WEBHOOK_URL } from '../../packages/shared/config';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { text } = req.body as { text: string };
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    res.status(200).json({ sent: true });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'notify failed' });
  }
}
