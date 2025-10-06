import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import {
  getStudentStudyPlanSnapshot,
  publishStudyPlan,
  saveStudyPlanDraft,
} from '../../packages/shared/studyPlans';
import { supabase } from '../../packages/shared/supabase';

function sendError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

function normalizeStudentId(value: unknown): string | null {
  if (!value) return null;
  const asString = Array.isArray(value) ? value[0] : value;
  if (typeof asString !== 'string') return null;
  const trimmed = asString.trim();
  return trimmed.length ? trimmed : null;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

export type StudyPlanHandlerDeps = {
  getSnapshot: typeof getStudentStudyPlanSnapshot;
  saveDraft: typeof saveStudyPlanDraft;
  publish: typeof publishStudyPlan;
  supabaseClient: typeof supabase;
};

export function createStudyPlansHandler({
  getSnapshot,
  saveDraft,
  publish,
  supabaseClient,
}: StudyPlanHandlerDeps) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const studentId = normalizeStudentId(req.query.student_id ?? req.query.studentId);
      if (!studentId) {
        sendError(res, 400, 'student_id query parameter is required.');
        return;
      }

      const historyLimitRaw = req.query.historyLimit ?? req.query.history_limit ?? req.query.history;
      const historyLimit = historyLimitRaw ? Number(historyLimitRaw) : undefined;
      const includeDrafts = parseBoolean(req.query.includeDrafts ?? req.query.include_drafts);
      const includeProgress = parseBoolean(req.query.includeProgress ?? req.query.include_progress);

      const snapshot = await getSnapshot(studentId, {
        includeHistoryCount:
          typeof historyLimit === 'number' && Number.isFinite(historyLimit) && historyLimit > 0
            ? historyLimit
            : undefined,
        includeDrafts,
        includeProgress,
      });

      res.status(200).json({ snapshot, fetchedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'POST') {
      if (!req.body || typeof req.body !== 'object') {
        sendError(res, 400, 'Request body must be a JSON object.');
        return;
      }
      const body = req.body as Record<string, unknown>;
      const studentIdValue = body.studentId ?? body.student_id;
      const studentId = normalizeStudentId(studentIdValue);
      if (!studentId) {
        sendError(res, 400, 'studentId is required to save a study plan draft.');
        return;
      }
      const planPayload = body.plan ?? body.studyPlan ?? body.study_plan;
      if (planPayload == null) {
        sendError(res, 400, 'plan field is required to save a study plan draft.');
        return;
      }
      const versionRaw = body.version ?? body.draftVersion ?? body.draft_version;
      const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw);

      const draft = await saveDraft(studentId, planPayload, {
        version: Number.isFinite(version) ? Number(version) : undefined,
      });

      res.status(200).json({ draft, savedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!req.body || typeof req.body !== 'object') {
        sendError(res, 400, 'Request body must be a JSON object.');
        return;
      }
      const body = req.body as Record<string, unknown>;
      const studentIdValue = body.studentId ?? body.student_id;
      const studentId = normalizeStudentId(studentIdValue);
      if (!studentId) {
        sendError(res, 400, 'studentId is required to publish a study plan.');
        return;
      }

      const publication = await publish(studentId, {
        plan: (body.plan ?? body.studyPlan ?? body.study_plan) as unknown,
        version:
          typeof body.version === 'number'
            ? body.version
            : body.version
            ? Number(body.version)
            : undefined,
        draftVersion:
          typeof body.draftVersion === 'number'
            ? body.draftVersion
            : body.draftVersion
            ? Number(body.draftVersion)
            : typeof body.draft_version === 'number'
            ? body.draft_version
            : body.draft_version
            ? Number(body.draft_version)
            : undefined,
        qaUser: typeof body.qaUser === 'string' ? body.qaUser : (body.qa_user as string | undefined),
        approvedAt:
          typeof body.approvedAt === 'string'
            ? body.approvedAt
            : typeof body.approved_at === 'string'
            ? body.approved_at
            : undefined,
        deleteDraft:
          parseBoolean(body.deleteDraft ?? body.delete_draft),
      });

      res.status(200).json({ plan: publication, publishedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'DELETE') {
      if (!req.body || typeof req.body !== 'object') {
        sendError(res, 400, 'Request body must be a JSON object containing studentId and version.');
        return;
      }
      const body = req.body as Record<string, unknown>;
      const studentIdValue = body.studentId ?? body.student_id;
      const studentId = normalizeStudentId(studentIdValue);
      const versionRaw = body.version ?? body.draftVersion ?? body.draft_version;
      const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw);
      if (!studentId || !Number.isFinite(version)) {
        sendError(res, 400, 'studentId and numeric version are required to delete a draft.');
        return;
      }

      const { error } = await supabaseClient
        .from('study_plan_drafts')
        .delete()
        .eq('student_id', studentId)
        .eq('version', version);
      if (error) {
        sendError(res, 500, `Failed to remove draft: ${error.message}`);
        return;
      }

      res.status(200).json({ deleted: true });
      return;
    }

    res.setHeader('Allow', 'GET,POST,PUT,PATCH,DELETE');
    sendError(res, 405, 'Method not allowed.');
  } catch (err: any) {
    const message = err?.message ?? 'study_plan_request_failed';
    console.error('study plan handler failed', err);
    sendError(res, 500, message);
  }
  };
}

const defaultHandler = createStudyPlansHandler({
  getSnapshot: getStudentStudyPlanSnapshot,
  saveDraft: saveStudyPlanDraft,
  publish: publishStudyPlan,
  supabaseClient: supabase,
});

export default defaultHandler;

export const config = {
  api: {
    bodyParser: true,
  },
};
