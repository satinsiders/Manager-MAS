import type { ResponseFunctionToolCall, ResponseInput } from 'openai/resources/responses/responses';
import { createNdjsonWriter } from './streaming';
import { operationHandlers } from './operationHandlers';
import { agentContext } from './context';
import { toNumber } from './utils';

export async function executePlatformOperation(
  operation: string,
  input: Record<string, unknown> | undefined,
) {
  const handler = (operationHandlers as any)[operation];
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  // Inject context values if missing
  if (operation === 'set_learning_volume') {
    if (!input?.studentCurriculumId && (agentContext as any).studentCurriculumId) {
      input = { ...input, studentCurriculumId: (agentContext as any).studentCurriculumId };
    }
  }
  return handler(input ?? {});
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
    if (args.operation === 'grant_student_course') {
      // Save studentId and curriculumId
      const sid = toNumber(args.input?.studentId ?? args.input?.student_id);
      (agentContext as any).studentId = sid === null ? undefined : sid;
      const cid = toNumber(args.input?.curriculumId ?? args.input?.curriculum_id);
      (agentContext as any).curriculumId = cid === null ? undefined : cid;
    }
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
