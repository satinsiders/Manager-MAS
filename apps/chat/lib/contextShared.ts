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
  lastStudentSnapshot?: any;
  lastPlanSnapshot?: any;
  studentsCache?: CachedList;
  curriculumsCache?: CachedList;
  studentNameLookup?: NameLookup;
  curriculumNameLookup?: NameLookup;
  studyPlanId?: string;
  studyPlanVersion?: number;
};
