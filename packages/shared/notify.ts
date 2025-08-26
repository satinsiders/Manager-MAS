import fetch from 'node-fetch';

const NOTIFICATION_BOT_URL = process.env.NOTIFICATION_BOT_URL!;

interface NotifyParams {
  agent: string;
  studentId?: string;
  error?: string;
  summary?: string[];
}

export async function notify({ agent, studentId, error, summary }: NotifyParams) {
  const parts = [`agent=${agent}`];
  if (studentId) parts.push(`student=${studentId}`);
  let text: string;

  if (summary && summary.length) {
    text = `${parts.join(' ')} summary:\n${summary.join('\n')}`;
  } else if (error) {
    text = `${parts.join(' ')} error: ${error}`;
  } else {
    text = `${parts.join(' ')} success`;
  }

  await fetch(NOTIFICATION_BOT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
