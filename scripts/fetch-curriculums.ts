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
  try {
    const options = parseArgs();
    const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/curriculums`);

    if (options.page) url.searchParams.set('page', String(options.page));
    if (options.limit) url.searchParams.set('limit', String(options.limit));
    if (options.search) url.searchParams.set('search', String(options.search));

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
    console.error('Failed to fetch curriculums:', err);
    process.exit(1);
  }
}

main();
