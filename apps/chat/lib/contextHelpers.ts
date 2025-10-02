import { toNumber } from './utils';
import type { AgentContext, NameLookup, CachedList } from './contextShared';

type LookupTarget = 'student' | 'curriculum';

const STUDENT_ID_KEYS = ['studentId', 'student_id', 'id', 'platformStudentId', 'platform_student_id', 'externalId', 'external_id'];
const CURRICULUM_ID_KEYS = ['curriculumId', 'curriculum_id', 'id', 'externalCurriculumId', 'external_curriculum_id'];

const STUDENT_NAME_KEYS = [
  'name',
  'fullName',
  'full_name',
  'displayName',
  'display_name',
  'preferredName',
  'preferred_name',
  'studentName',
  'student_name',
];

const STUDENT_NESTED_KEYS = ['student', 'profile'];
const STUDENT_FIRST_NAME_KEYS = ['firstName', 'first_name', 'givenName', 'given_name'];
const STUDENT_LAST_NAME_KEYS = ['lastName', 'last_name', 'familyName', 'family_name'];

const CURRICULUM_NAME_KEYS = ['title', 'name', 'displayName', 'display_name', 'curriculumName', 'curriculum_name'];

const CURRICULUM_NESTED_KEYS = ['curriculum'];

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectStrings(record: Record<string, unknown>, keys: string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) values.push(trimmed);
    }
  }
  return values;
}

function getFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = record[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function addNamesFromNested(record: Record<string, unknown>, nestedKeys: string[], keys: string[], collector: Set<string>) {
  for (const nestedKey of nestedKeys) {
    const nested = record[nestedKey];
    if (isRecord(nested)) {
      for (const value of collectStrings(nested, keys)) {
        collector.add(value);
      }
    }
  }
}

function gatherStudentNames(student: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const value of collectStrings(student, STUDENT_NAME_KEYS)) {
    names.add(value);
  }
  addNamesFromNested(student, STUDENT_NESTED_KEYS, STUDENT_NAME_KEYS, names);

  const firstCandidates: string[] = [];
  const lastCandidates: string[] = [];

  for (const key of STUDENT_FIRST_NAME_KEYS) {
    const value = student[key];
    if (typeof value === 'string' && value.trim()) firstCandidates.push(value.trim());
  }
  for (const key of STUDENT_LAST_NAME_KEYS) {
    const value = student[key];
    if (typeof value === 'string' && value.trim()) lastCandidates.push(value.trim());
  }

  for (const nestedKey of STUDENT_NESTED_KEYS) {
    const nested = student[nestedKey];
    if (isRecord(nested)) {
      const first = getFirstString(nested, STUDENT_FIRST_NAME_KEYS);
      if (first) firstCandidates.push(first);
      const last = getFirstString(nested, STUDENT_LAST_NAME_KEYS);
      if (last) lastCandidates.push(last);
    }
  }

  for (const first of firstCandidates) {
    for (const last of lastCandidates) {
      names.add(`${first} ${last}`.trim());
      names.add(`${last} ${first}`.trim());
    }
  }

  return Array.from(names);
}

function gatherCurriculumNames(curriculum: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const value of collectStrings(curriculum, CURRICULUM_NAME_KEYS)) {
    names.add(value);
  }
  addNamesFromNested(curriculum, CURRICULUM_NESTED_KEYS, CURRICULUM_NAME_KEYS, names);
  return Array.from(names);
}

function extractId(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const numberValue = toNumber(value);
    if (numberValue !== null) {
      return numberValue;
    }
  }
  return null;
}

function createEmptyLookup(): NameLookup {
  return { byName: new Map(), ambiguous: new Set() };
}

function addNamesToLookup(lookup: NameLookup, names: string[], id: number) {
  for (const name of names) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    if (lookup.ambiguous.has(normalized)) continue;
    if (lookup.byName.has(normalized)) {
      const existing = lookup.byName.get(normalized);
      if (existing !== id) {
        lookup.byName.delete(normalized);
        lookup.ambiguous.add(normalized);
      }
      continue;
    }
    lookup.byName.set(normalized, id);
  }
}

function buildLookup(items: any[], target: LookupTarget): NameLookup {
  const lookup = createEmptyLookup();
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (target === 'student') {
      const id = extractId(item, STUDENT_ID_KEYS);
      if (id === null) continue;
      const names = gatherStudentNames(item);
      addNamesToLookup(lookup, names, id);
    } else {
      const id = extractId(item, CURRICULUM_ID_KEYS);
      if (id === null) continue;
      const names = gatherCurriculumNames(item);
      addNamesToLookup(lookup, names, id);
    }
  }
  return lookup;
}

export function buildStudentNameLookup(students: any[]): NameLookup {
  return buildLookup(students, 'student');
}

export function buildCurriculumNameLookup(curriculums: any[]): NameLookup {
  return buildLookup(curriculums, 'curriculum');
}

export function createCacheKey(input?: Record<string, unknown>): string {
  if (!input) return '{}';
  const entries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, value] as const);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const normalised: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    normalised[key] = value;
  }
  return JSON.stringify(normalised);
}

export function extractListFromResult(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (isRecord(result)) {
    const candidates = ['data', 'items', 'results', 'list'];
    for (const key of candidates) {
      const maybe = result[key];
      if (Array.isArray(maybe)) return maybe;
    }
  }
  return [];
}

export function updateStudentsCache(context: AgentContext, result: unknown, argsKey: string) {
  const list = extractListFromResult(result);
  context.studentsCache = { argsKey, data: list };
  context.studentNameLookup = buildStudentNameLookup(list);
}

export function updateCurriculumsCache(context: AgentContext, result: unknown, argsKey: string) {
  const list = extractListFromResult(result);
  context.curriculumsCache = { argsKey, data: list };
  context.curriculumNameLookup = buildCurriculumNameLookup(list);
}

export function getCachedList(cache: CachedList | undefined, cacheKey: string): any[] | null {
  if (!cache) return null;
  return cache.argsKey === cacheKey ? cache.data : null;
}

export function resolveStudentIdFromContext(context: AgentContext, raw: unknown): number | null {
  const direct = toNumber(raw);
  if (direct !== null) return direct;
  if (typeof raw !== 'string') return null;
  const lookup = context.studentNameLookup;
  if (!lookup) return null;
  const normalized = normalizeName(raw);
  if (!normalized) return null;
  if (lookup.ambiguous.has(normalized)) {
    throw new Error(`Multiple students are named "${raw}". Please specify the numeric student ID.`);
  }
  return lookup.byName.get(normalized) ?? null;
}

export function resolveCurriculumIdFromContext(context: AgentContext, raw: unknown): number | null {
  const direct = toNumber(raw);
  if (direct !== null) return direct;
  if (typeof raw !== 'string') return null;
  const lookup = context.curriculumNameLookup;
  if (!lookup) return null;
  const normalized = normalizeName(raw);
  if (!normalized) return null;
  if (lookup.ambiguous.has(normalized)) {
    throw new Error(`Multiple curriculums share the name "${raw}". Please specify the numeric curriculum ID.`);
  }
  return lookup.byName.get(normalized) ?? null;
}
