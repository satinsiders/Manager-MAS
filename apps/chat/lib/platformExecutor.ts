import type { ResponseFunctionToolCall, ResponseInput } from 'openai/resources/responses/responses';
import { createNdjsonWriter } from './streaming';
import { operationHandlers } from './operationHandlers';
import { agentContext } from './context';
import type { AgentContext } from './contextShared';
import {
  createCacheKey,
  getCachedList,
  resolveCurriculumIdFromContext,
  resolveStudentIdFromContext,
  updateCurriculumsCache,
  updateStudentsCache,
} from './contextHelpers';

export async function executePlatformOperation(
  operation: string,
  input: Record<string, unknown> | undefined,
) {
  const handler = (operationHandlers as any)[operation];
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  const context = agentContext as AgentContext;
  const normalizedInput: Record<string, unknown> = input ? { ...input } : {};

  if (operation === 'set_learning_volume' && !normalizedInput.studentCurriculumId && context.studentCurriculumId) {
    normalizedInput.studentCurriculumId = context.studentCurriculumId;
  }

  if (operation === 'grant_student_course' || operation === 'list_student_curriculums' || operation === 'list_study_schedules') {
    const rawStudentId = normalizedInput.studentId ?? normalizedInput.student_id;
    const resolvedStudentId = resolveStudentIdFromContext(context, rawStudentId);
    if (resolvedStudentId === null) {
      if (rawStudentId === undefined) {
        throw new Error('studentId is required for this operation.');
      }
      throw new Error(
        `Unable to resolve the student from "${String(rawStudentId)}". Use list_students to look up the numeric ID.`,
      );
    }
    normalizedInput.studentId = resolvedStudentId;
    normalizedInput.student_id = resolvedStudentId;
    context.studentId = resolvedStudentId;
  }

  if (operation === 'grant_student_course') {
    const rawCurriculumId = normalizedInput.curriculumId ?? normalizedInput.curriculum_id;
    const resolvedCurriculumId = resolveCurriculumIdFromContext(context, rawCurriculumId);
    if (resolvedCurriculumId === null) {
      if (rawCurriculumId === undefined) {
        throw new Error('curriculumId is required for this operation.');
      }
      throw new Error(
        `Unable to resolve the curriculum from "${String(rawCurriculumId)}". Use list_curriculums to find the numeric ID.`,
      );
    }
    normalizedInput.curriculumId = resolvedCurriculumId;
    normalizedInput.curriculum_id = resolvedCurriculumId;
    context.curriculumId = resolvedCurriculumId;
  }

  if (operation === 'list_students' || operation === 'list_curriculums') {
    const cacheKey = createCacheKey(normalizedInput);
    const cached = operation === 'list_students'
      ? getCachedList(context.studentsCache, cacheKey)
      : getCachedList(context.curriculumsCache, cacheKey);
    if (cached) {
      return cached;
    }
    const result = await handler(normalizedInput);
    if (operation === 'list_students') {
      updateStudentsCache(context, result, cacheKey);
    } else {
      updateCurriculumsCache(context, result, cacheKey);
    }
    return result;
  }

  return handler(normalizedInput);
}

export async function runToolCall(
  call: ResponseFunctionToolCall,
  writer: ReturnType<typeof createNdjsonWriter>,
): Promise<ResponseInput[number]> {
  const args = JSON.parse(call.arguments as string) as any;
  writer.write({
    type: 'tool_status',
    callId: (call as any).call_id,
    operation: args.operation,
    status: 'started',
  });
  const startedAt = Date.now();
  try {
    const result = await executePlatformOperation(args.operation, args.input);
    // Store context after relevant operations
    if (args.operation === 'list_student_curriculums' && result) {
      // Find the latest studentCurriculumId for the current student/curriculum
      const arr = Array.isArray(result) ? result : (result as any)?.data;
      if (Array.isArray(arr)) {
        const match = arr.find((item: any) => {
          const sid = Number(item.studentId ?? item.student_id);
          const cid = Number(item.curriculumId ?? item.curriculum_id);
          return (
            (!(agentContext as any).studentId || sid === (agentContext as any).studentId) &&
            (!(agentContext as any).curriculumId || cid === (agentContext as any).curriculumId)
          );
        });
        if (match) {
          (agentContext as any).studentCurriculumId = Number(match.studentCurriculumId ?? match.student_curriculum_id);
        }
      }
    }
    writer.write({
      type: 'tool_status',
      callId: (call as any).call_id,
      operation: args.operation,
      status: 'succeeded',
      durationMs: Date.now() - startedAt,
    });
    return {
      type: 'function_call_output',
      call_id: (call as any).call_id,
      output: JSON.stringify(result ?? null),
    };
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Tool call failed';
    writer.write({
      type: 'tool_status',
      callId: (call as any).call_id,
      operation: args.operation,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      message,
    });
    throw error;
  }
}
