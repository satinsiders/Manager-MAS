import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${process.env.SCHEDULER_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const runType = req.query.run_type as string;
  if (runType !== 'daily' && runType !== 'weekly') {
    res.status(400).json({ error: 'invalid run_type' });
    return;
  }

  try {
    const url = `${process.env.ORCHESTRATOR_URL}?run_type=${runType}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}`,
      },
    });

    if (!response.ok) {
      throw new Error(`orchestrator responded ${response.status}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'scheduler failed' });
  }
}

