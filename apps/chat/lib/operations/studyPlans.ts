import {
  getStudentStudyPlanSnapshot,
  listStudyPlanDrafts,
  listStudyPlanVersions,
  publishStudyPlan,
  saveStudyPlanDraft,
} from '../../../../packages/shared/studyPlans';
import { toNumber } from '../utils';
import type { OperationMap } from './types';

function getStudentIdArg(args: Record<string, unknown>, context: string) {
  const studentIdRaw = args.studentId ?? args.student_id ?? args.studentUuid ?? args.student_uuid;
  if (!studentIdRaw || typeof studentIdRaw !== 'string') {
    throw new Error(`${context} requires a studentId.`);
  }
  return String(studentIdRaw).trim();
}

const studyPlanHandlers: OperationMap = {
  async get_study_plan(args) {
    const studentId = getStudentIdArg(args, 'Fetching the study plan');
    const historyLimit =
      typeof args.historyLimit === 'number'
        ? args.historyLimit
        : typeof args.history_limit === 'number'
        ? args.history_limit
        : undefined;
    const includeDrafts = args.includeDrafts ?? args.include_drafts;
    const includeProgress = args.includeProgress ?? args.include_progress;
    return getStudentStudyPlanSnapshot(studentId, {
      includeHistoryCount: historyLimit,
      includeDrafts:
        includeDrafts === undefined || includeDrafts === null ? undefined : Boolean(includeDrafts),
      includeProgress:
        includeProgress === undefined || includeProgress === null ? undefined : Boolean(includeProgress),
    });
  },

  async list_study_plan_versions(args) {
    const studentId = getStudentIdArg(args, 'Listing study plan versions');
    const limit =
      typeof args.limit === 'number'
        ? args.limit
        : typeof args.historyLimit === 'number'
        ? args.historyLimit
        : undefined;
    return listStudyPlanVersions(studentId, { limit: limit && limit > 0 ? limit : 5 });
  },

  async list_study_plan_drafts(args) {
    const studentId = getStudentIdArg(args, 'Listing study plan drafts');
    const limit = typeof args.limit === 'number' ? args.limit : undefined;
    return listStudyPlanDrafts(studentId, { limit: limit && limit > 0 ? limit : 10 });
  },

  async save_study_plan_draft(args) {
    const studentId = getStudentIdArg(args, 'Saving a study plan draft');
    const versionRaw = args.version ?? args.draftVersion ?? args.draft_version;
    const version = toNumber(versionRaw);
    const planPayload = args.plan ?? args.studyPlan ?? args.study_plan;
    if (planPayload == null) {
      throw new Error('plan (study plan payload) is required to save a draft.');
    }
    return saveStudyPlanDraft(studentId, planPayload, {
      version: version ?? undefined,
    });
  },

  async publish_study_plan(args) {
    const studentId = getStudentIdArg(args, 'Publishing a study plan');
    const planPayload = args.plan ?? args.studyPlan ?? args.study_plan;
    const versionRaw = args.version;
    const draftVersionRaw = args.draftVersion ?? args.draft_version;
    const deleteDraftRaw = args.deleteDraft ?? args.delete_draft;
    const qaUser = args.qaUser ?? args.qa_user;
    const approvedAt = args.approvedAt ?? args.approved_at;

    const version = toNumber(versionRaw) ?? undefined;
    const draftVersion = toNumber(draftVersionRaw) ?? undefined;

    if (planPayload == null && draftVersion == null) {
      throw new Error('Provide either plan or draftVersion when publishing a study plan.');
    }

    return publishStudyPlan(studentId, {
      plan: planPayload ?? undefined,
      version,
      draftVersion,
      qaUser: typeof qaUser === 'string' ? qaUser : undefined,
      approvedAt: typeof approvedAt === 'string' ? approvedAt : undefined,
      deleteDraft:
        deleteDraftRaw === undefined || deleteDraftRaw === null
          ? undefined
          : Boolean(deleteDraftRaw),
    });
  },
};

export default studyPlanHandlers;
