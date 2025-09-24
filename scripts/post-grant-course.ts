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
  const curriculumId = options.curriculumId ?? options.curriculum ?? options.curriculumid;
  const studentId = options.studentId ?? options.student ?? options.studentid;

  if (!curriculumId || !studentId) {
    console.error('Usage: npx tsx scripts/post-grant-course.ts --curriculumId <id> --studentId <id> [--refresh]');
    process.exit(1);
  }

  const payload = {
    curriculumId: Number(curriculumId),
    studentId: Number(studentId),
  };

  if (Number.isNaN(payload.curriculumId) || Number.isNaN(payload.studentId)) {
    console.error('curriculumId and studentId must be numeric');
    process.exit(1);
  }

  try {
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    const token = await getPlatformAuthToken(Boolean(options.refresh));
    const resp = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const message = await resp.text().catch(() => resp.statusText);
      throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${message}`);
    }

    const bodyText = await resp.text();
    if (bodyText.trim()) {
      console.log(bodyText);
    } else {
      console.log('Success (204/empty response).');
    }
  } catch (err) {
    console.error('Failed to grant curriculum:', err);
    process.exit(1);
  }
}

main();
