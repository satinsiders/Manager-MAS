// Utility functions extracted from index.ts

export function buildQuery(params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      search.set(key, String(value));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isKnownMutationSuccess(message: string) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('cannot read properties of undefined (reading') ||
    normalized.includes('platform api 409') ||
    normalized.includes('http 409') ||
    normalized.includes('status 409')
  );
}
