import { getPlatformAuthToken } from '../packages/shared/platformAuth';

async function main() {
  try {
    console.error('Requesting teacher token from', process.env.SUPERFASTSAT_API_URL);
    const token = await getPlatformAuthToken(true);
    console.log(token);
  } catch (err) {
    console.error('Failed to fetch platform token:', err);
    process.exit(1);
  }
}

main();
