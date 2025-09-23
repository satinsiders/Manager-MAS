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
  const studentId = options.studentId ?? options.studentid ?? options.student;
  if (!studentId || typeof studentId !== 'string') {
    console.error('Usage: npx tsx scripts/fetch-student-curriculums.ts --studentId <id> [--date YYYY-MM-DD] [--includeStopped true] [--includeNoRemainingDuration true] [--refresh]');
    process.exit(1);
  }

  try {
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/student-curriculums`);
    url.searchParams.set('studentId', studentId);

    if (typeof options.date === 'string') url.searchParams.set('date', options.date);
    if (typeof options.includeStopped !== 'undefined') {
      url.searchParams.set('includeStopped', String(options.includeStopped));
    }
    if (typeof options.includeNoRemainingDuration !== 'undefined') {
      url.searchParams.set('includeNoRemainingDuration', String(options.includeNoRemainingDuration));
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
    console.error('Failed to fetch student curriculums:', err);
    process.exit(1);
  }
}

main();
