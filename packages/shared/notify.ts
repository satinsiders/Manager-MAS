import fetch from 'node-fetch';

const NOTIFICATION_BOT_URL = process.env.NOTIFICATION_BOT_URL!;

export interface NotificationPayload {
  agent: string;
  studentId?: string | number;
  message?: string;
  error?: string;
  summary?: string[];
}

export async function notify({
  agent,
  studentId,
  message,
  error,
  summary
}: NotificationPayload) {
  const parts = [`agent: ${agent}`];
  if (studentId) parts.push(`student: ${studentId}`);
  if (error) parts.push(`error: ${error}`);
  if (message) parts.push(message);
  if (summary && summary.length > 0) {
    parts.push('summary:');
    parts.push(...summary);
  }
  const text = parts.join('\n');

  await fetch(NOTIFICATION_BOT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}
