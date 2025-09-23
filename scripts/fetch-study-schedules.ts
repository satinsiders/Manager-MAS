import { getPlatformAuthToken } from '../packages/shared/platformAuth.ts';
import { SUPERFASTSAT_API_URL } from '../packages/shared/config.ts';

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
  const studentId = options.studentId ?? options.student ?? options.studentid;
  const scheduledDate = options.scheduledDate ?? options.date ?? options.scheduleddate;

  if (!studentId || !scheduledDate) {
    console.error('Usage: npx tsx scripts/fetch-study-schedules.ts --studentId <id> --scheduledDate YYYY-MM-DD [additional query params like --skillId 20] [--refresh]');
    process.exit(1);
  }

  try {
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    // API path is /study-schedules (no /teacher prefix)
    const url = new URL(`${baseUrl}/study-schedules`);
    url.searchParams.set('studentId', String(studentId));
    url.searchParams.set('scheduledDate', String(scheduledDate));

    const reservedKeys = new Set(['studentid', 'studentId', 'student', 'scheduledDate', 'scheduleddate', 'date', 'refresh']);
    for (const [key, value] of Object.entries(options)) {
      if (reservedKeys.has(key)) continue;
      url.searchParams.set(key, String(value));
    }

    const token = await getPlatformAuthToken(Boolean(options.refresh));
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const message = await resp.text().catch(() => resp.statusText);
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${message}`);
    }

    const bodyText = await resp.text();
    console.log(bodyText);
  } catch (err) {
    console.error('Failed to fetch study schedules:', err);
    process.exit(1);
  }
}

main();
