import { NOTIFICATION_BOT_URL } from './config';
import { callWithRetry } from './retry';

/**
 * Send a notification message using the notification bot.
 * If the webhook URL is not configured or the request fails, the error is swallowed
 * so that notification failures do not impact the main flow.
 */
export async function notify(text: string, runType: string) {
  try {
    await callWithRetry(
      NOTIFICATION_BOT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      },
      runType,
      'notify'
    );
  } catch (err: any) {
    // Log only the error message to avoid leaking sensitive data
    console.error('Notification failed:', err.message);
  }
}
