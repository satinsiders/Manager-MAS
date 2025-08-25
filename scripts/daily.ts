import fetch from 'node-fetch';

async function main() {
  const url = process.env.ORCHESTRATOR_URL || 'http://localhost:3000/api/orchestrator';
  const res = await fetch(url);
  console.log('Daily run status', res.status);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
