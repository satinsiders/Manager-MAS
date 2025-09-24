import { getPlatformAuthToken } from '../packages/shared/platformAuth';
import { SUPERFASTSAT_API_URL } from '../packages/shared/config';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      i++;
    } else {
      options[key] = true;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();
  const studentCurriculumId = options.studentCurriculumId ?? options.studentcurriculumid ?? options.studentCurriculum ?? options.studentcurriculum;
  const scheduledDate = options.scheduledDate ?? options.date ?? options.scheduleddate;
  const duration = options.duration ?? options.minutes ?? options.durationMinutes ?? options.durationminutes;

  if (!studentCurriculumId || !scheduledDate || !duration) {
    console.error('Usage: npx tsx scripts/post-learning-volume.ts --studentCurriculumId <id> --scheduledDate YYYY-MM-DD --duration <minutes> [--refresh]');
    process.exit(1);
  }

  const body = {
    studentCurriculumId: Number(studentCurriculumId),
    scheduledDate: String(scheduledDate),
    duration: Number(duration),
  };

  if (Number.isNaN(body.studentCurriculumId) || Number.isNaN(body.duration)) {
    console.error('studentCurriculumId and duration must be numeric');
    process.exit(1);
  }

  try {
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    const token = await getPlatformAuthToken(Boolean(options.refresh));

    const resp = await fetch(`${baseUrl}/study-schedules/learning-volumes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const message = await resp.text().catch(() => resp.statusText);
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${message}`);
    }

    const responseText = await resp.text();
    if (responseText.trim().length > 0) {
      console.log(responseText);
    } else {
      console.log('Success (204/empty response).');
    }
  } catch (err) {
    console.error('Failed to post learning volume:', err);
    process.exit(1);
  }
}

main();
