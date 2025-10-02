export type NameLookup = {
  byName: Map<string, number>;
  ambiguous: Set<string>;
};

export type CachedList = {
  argsKey: string;
  data: any[];
};

export type AgentContext = {
  studentId?: number;
  curriculumId?: number;
  studentCurriculumId?: number;
  studentsCache?: CachedList;
  curriculumsCache?: CachedList;
  studentNameLookup?: NameLookup;
  curriculumNameLookup?: NameLookup;
};
