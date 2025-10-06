import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInput,
  Tool,
} from 'openai/resources/responses/responses';
import {
  hasStaticPlatformToken,
  isPlatformAuthConfigured,
} from '../../packages/shared/platformAuth';
import { openai } from './lib/openaiClient';
import { systemPrompt, platformTool, type PlatformOperation } from './lib/llm';
import {
  getCurrentSessionId,
  getSession,
  onSessionDestroyed,
  parseCookieHeader,
  sessionCookieName,
  touchSession,
  withSessionContextAsync,
} from '../../packages/shared/authSessions';

const tool = platformTool;

import { createNdjsonWriter } from './lib/streaming';
import {
  parseBody,
  mapMessagesForLLM,
  extractAssistantOutputs,
  extractFunctionCalls,
  safeParseToolArgs,
  isPlatformOperation,
} from './lib/helpers';

import operationHandlers from './lib/operationHandlers';
import type { AgentContext } from './lib/contextShared';
import type { StudentWithStudyPlan } from '../../packages/shared/studyPlans';
import {
  createCacheKey,
  getCachedList,
  resolveCurriculumIdFromContext,
  resolveStudentIdFromContext,
  updateCurriculumsCache,
  updateStudentsCache,
  extractStudentLookupFromSnapshot,
} from './lib/contextHelpers';

const STATIC_SESSION_KEY = '__static__';
const agentContexts = new Map<string, AgentContext>();

function sessionKeyForContext(sessionId: string | null): string {
  return sessionId ?? STATIC_SESSION_KEY;
}

function getAgentContext(sessionId: string | null): AgentContext {
  const key = sessionKeyForContext(sessionId);
  let context = agentContexts.get(key);
  if (!context) {
    context = {};
    agentContexts.set(key, context);
  }
  return context;
}

function getActiveAgentContext(): AgentContext {
  return getAgentContext(getCurrentSessionId());
}

function getSessionIdFromRequest(req: VercelRequest): string | null {
  const header = (req.headers['cookie'] as string) ?? '';
  const cookies = parseCookieHeader(header);
  const fromHeader = cookies[sessionCookieName];
  if (fromHeader) return fromHeader;
  if (req.cookies && typeof req.cookies === 'object') {
    const direct = (req.cookies as Record<string, string | undefined>)[sessionCookieName];
    if (direct) return direct;
  }
  return null;
}

onSessionDestroyed((sessionId) => {
  agentContexts.delete(sessionId);
});

async function executePlatformOperation(
  operation: PlatformOperation,
  input: Record<string, unknown> | undefined,
  signal?: AbortSignal,
) {
  const agentContext = getActiveAgentContext();
  const handler = operationHandlers[operation];
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  const normalizedInput: Record<string, unknown> = input ? { ...input } : {};

  if (operation === 'set_learning_volume' && !normalizedInput.studentCurriculumId && agentContext.studentCurriculumId) {
    normalizedInput.studentCurriculumId = agentContext.studentCurriculumId;
  }

  if (operation === 'grant_student_course' || operation === 'list_student_curriculums' || operation === 'list_study_schedules') {
    const rawStudentId = normalizedInput.studentId ?? normalizedInput.student_id;
    const resolvedStudentId = resolveStudentIdFromContext(agentContext, rawStudentId);
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
    agentContext.studentId = resolvedStudentId;
  }

  if (operation === 'grant_student_course') {
    const rawCurriculumId = normalizedInput.curriculumId ?? normalizedInput.curriculum_id;
    const resolvedCurriculumId = resolveCurriculumIdFromContext(agentContext, rawCurriculumId);
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
    agentContext.curriculumId = resolvedCurriculumId;
  }

  if (operation === 'list_students' || operation === 'list_curriculums') {
    const cacheKey = createCacheKey(normalizedInput);
    const cached = operation === 'list_students'
      ? getCachedList(agentContext.studentsCache, cacheKey)
      : getCachedList(agentContext.curriculumsCache, cacheKey);
    if (cached) {
      return cached;
    }
    const result = await handler(normalizedInput, signal);
    if (operation === 'list_students') {
      updateStudentsCache(agentContext, result, cacheKey);
    } else {
    updateCurriculumsCache(agentContext, result, cacheKey);
    }
    return result;
  }

  // Pass the abort signal to the operation handler so platform HTTP calls can be cancelled
  const result = await handler(normalizedInput, signal);

  if (operation === 'get_study_plan' && result && typeof result === 'object') {
    const snapshot = (result as any)?.snapshot ?? result;
    if (snapshot?.active_plan?.id) {
      agentContext.studyPlanId = snapshot.active_plan.id;
      agentContext.studyPlanVersion = snapshot.active_plan.version;
    }
    if (snapshot?.student) {
      agentContext.lastStudentSnapshot = snapshot.student;
      const lookup = extractStudentLookupFromSnapshot(snapshot);
      if (lookup) {
        agentContext.studentNameLookup = lookup;
      }
    }
    agentContext.lastPlanSnapshot = snapshot;
  }

  if (operation === 'publish_study_plan' && result && typeof result === 'object') {
    const published = (result as any)?.plan ?? result;
    if (published?.id) {
      agentContext.studyPlanId = published.id;
    }
    if (typeof published?.version === 'number') {
      agentContext.studyPlanVersion = published.version;
    }
  }

  return result;
}


async function runToolCall(
  call: ResponseFunctionToolCall,
  writer: ReturnType<typeof createNdjsonWriter>,
  signal?: AbortSignal,
): Promise<ResponseInput[number]> {
  const agentContext = getActiveAgentContext();
  const args = safeParseToolArgs(call.arguments);
  writer.write({
    type: 'tool_status',
    callId: call.call_id,
    operation: args.operation,
    status: 'started',
  });
  const startedAt = Date.now();
  try {
    const result = await executePlatformOperation(args.operation, args.input, signal);
    // Store context after relevant operations
    if (args.operation === 'list_student_curriculums' && result) {
      // Find the latest studentCurriculumId for the current student/curriculum
      const arr = Array.isArray(result) ? result : (result as any)?.data;
      if (Array.isArray(arr)) {
        const match = arr.find(
          (item) => {
            const sid = Number(item.studentId ?? item.student_id);
            const cid = Number(item.curriculumId ?? item.curriculum_id);
            return (
              (!agentContext.studentId || sid === agentContext.studentId) &&
              (!agentContext.curriculumId || cid === agentContext.curriculumId)
            );
          }
        );
        if (match) {
          agentContext.studentCurriculumId = Number(match.studentCurriculumId ?? match.student_curriculum_id);
        }
      }
    }
    writer.write({
      type: 'tool_status',
      callId: call.call_id,
      operation: args.operation,
      status: 'succeeded',
      durationMs: Date.now() - startedAt,
    });
    return {
      type: 'function_call_output',
      call_id: call.call_id,
      output: JSON.stringify(result ?? null),
    };
  } catch (error: any) {
    const message = error?.message ? String(error.message) : 'Tool call failed';
    writer.write({
      type: 'tool_status',
      callId: call.call_id,
      operation: args.operation,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      message,
    });
    throw error;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const hasStaticToken = hasStaticPlatformToken();
  const sessionId = getSessionIdFromRequest(req);
  const session = hasStaticToken ? null : getSession(sessionId);

  if (!hasStaticToken && !session) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  const { messages = [] } = parseBody(req);
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'missing_messages' });
    return;
  }

  await withSessionContextAsync(session?.id ?? null, async () => {
    if (session) {
      touchSession(session.id);
    }

    const writer = createNdjsonWriter(res);
    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    const llmMessages: ResponseInput = [
      { type: 'message', role: 'system', content: systemPrompt },
      ...mapMessagesForLLM(messages),
    ];

    if (!isPlatformAuthConfigured()) {
      writer.write({
        type: 'assistant_message',
        content: 'Platform authentication is not configured. Please sign in and try again.',
        outputIndex: 0,
      });
      writer.write({ type: 'done' });
      writer.close();
      return;
    }

    let previousResponseId: string | undefined;
    let nextInput: ResponseInput | undefined;
    const retryCounts = new Map<string, number>();

    try {
      while (true) {
        const body = previousResponseId
          ? {
              model: 'gpt-5-mini',
              previous_response_id: previousResponseId,
              input: nextInput ?? [],
              tools: [tool],
            }
          : {
              model: 'gpt-5-mini',
              input: llmMessages,
              tools: [tool],
            };

        const responseStream = await openai.responses.stream(body, {
          signal: abortController.signal,
        });

        let completedResponse: Response | null = null;
        let aborted = false;

        const streamedOutputs = new Map<number, string>();
        const snapshotOutputs = new Map<number, string>();

        try {
          for await (const event of responseStream) {
            if (event.type === 'response.output_text.delta') {
              const index = event.output_index ?? 0;
              const snapshotValue = (event as any)?.snapshot;
              const latestSnapshot = typeof snapshotValue === 'string' ? snapshotValue : undefined;
              const previousSnapshot = latestSnapshot ? snapshotOutputs.get(index) ?? '' : '';
              let deltaText = typeof event.delta === 'string' ? event.delta : '';
              if (!deltaText && typeof latestSnapshot === 'string') {
                deltaText = latestSnapshot.startsWith(previousSnapshot)
                  ? latestSnapshot.slice(previousSnapshot.length)
                  : latestSnapshot;
              }
              if (typeof latestSnapshot === 'string') {
                snapshotOutputs.set(index, latestSnapshot);
              }
              if (deltaText) {
                const previous = streamedOutputs.get(index) ?? previousSnapshot;
                const updated = previous + deltaText;
                streamedOutputs.set(index, updated);
                writer.write({ type: 'assistant_delta', delta: deltaText, outputIndex: index });
              }
            } else if (event.type === 'response.output_text.done') {
              const index = event.output_index ?? 0;
              const snapshotValue = (event as any)?.snapshot;
              if (typeof snapshotValue === 'string') {
                snapshotOutputs.set(index, snapshotValue);
                streamedOutputs.set(index, snapshotValue);
              }
            } else if (event.type === 'response.completed') {
              completedResponse = event.response;
            } else if (event.type === 'response.failed') {
              writer.write({ type: 'error', error: { message: 'llm_failed', details: event as any } });
              aborted = true;
              break;
            } else if (event.type === 'error') {
              const errorMessage = (event as any)?.message ?? 'llm_error';
              writer.write({ type: 'error', error: { message: String(errorMessage), details: event as any } });
              aborted = true;
              break;
            }
          }
        } catch (err: any) {
          if (abortController.signal.aborted || (err?.name === 'AbortError')) {
            responseStream.abort();
            writer.error({ message: 'client_aborted' });
            writer.close();
            return;
          }
          responseStream.abort();
          writer.write({ type: 'error', error: { message: 'llm_stream_error', details: { error: String(err) } } });
          writer.close();
          return;
        }

        if (aborted) {
          responseStream.abort();
          writer.close();
          return;
        }

        let finalResponse = completedResponse;
        if (!finalResponse) {
          try {
            finalResponse = await responseStream.finalResponse();
          } catch (err: any) {
            const message = err?.message ?? 'missing_response';
            writer.write({ type: 'error', error: { message } });
            writer.close();
            return;
          }
        }
        previousResponseId = finalResponse.id;

        const assistantOutputs = extractAssistantOutputs(finalResponse);
        for (const output of assistantOutputs) {
          const content = snapshotOutputs.get(output.index) ?? streamedOutputs.get(output.index) ?? output.text;
          writer.write({
            type: 'assistant_message',
            content,
            outputIndex: output.index,
          });
        }

        const functionCalls = extractFunctionCalls(finalResponse);
        if (functionCalls.length === 0) {
          writer.write({ type: 'done' });
          writer.close();
          return;
        }

        const toolOutputs: ResponseInput = [];
        let brokeForRetry = false;
        for (const call of functionCalls) {
          try {
            const output = await runToolCall(call, writer, abortController.signal);
            toolOutputs.push(output);
          } catch (toolErr: any) {
            const callId = String(call.call_id);
            const prevAttempts = retryCounts.get(callId) ?? 0;
            const attempts = prevAttempts + 1;
            retryCounts.set(callId, attempts);

            const message = toolErr?.message ?? 'tool_failed';
            const failurePayload = {
              __tool_error: true,
              message,
              attempt: attempts,
            } as Record<string, unknown>;

            toolOutputs.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify(failurePayload),
            } as any);

            if (attempts >= 3) {
              writer.write({ type: 'error', error: { message: `tool_failed_after_${attempts}_attempts`, stack: toolErr?.stack, details: toolErr as any } });
              writer.close();
              return;
            }

            brokeForRetry = true;
            break;
          }
        }

        nextInput = toolOutputs;
        if (!brokeForRetry) {
          nextInput = toolOutputs;
        }
      }
    } catch (err: any) {
      const message = err?.message ?? 'chat_failed';
      writer.error(message);
    }
  });
}
