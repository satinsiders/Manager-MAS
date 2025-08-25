import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

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
