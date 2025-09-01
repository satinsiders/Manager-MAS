import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SLACK_WEBHOOK_URL, AGENT_SECRET } from '../../packages/shared/config';
import { callWithRetry } from '../../packages/shared/retry';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${AGENT_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const { text } = req.body as { text: string };
  try {
    const resp = await callWithRetry(
      SLACK_WEBHOOK_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      },
      'notification-bot',
      'slack'
    );
    if (!resp) throw new Error('slack request failed');
    res.status(200).json({ sent: true });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'notify failed' });
  }
}
