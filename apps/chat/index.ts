// Utility to normalize date to YYYY-MM-DD
import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
// Agent context for persisting IDs between calls
type AgentContext = {
  studentId?: number;
  curriculumId?: number;
  studentCurriculumId?: number;
};

const agentContext: AgentContext = {};
import type {
  Response,
  ResponseFunctionToolCall,
  ResponseInput,
  Tool,
} from 'openai/resources/responses/responses';
import { platformJson } from '../../packages/shared/platform';
import { openai } from './lib/openaiClient';
import { systemPrompt, platformTool, PLATFORM_OPERATIONS, type PlatformOperation, type PlatformToolArgs } from './lib/llm';

import type {
  ChatRole,
  ChatMessage,
  ChatRequestBody,
  AssistantDeltaEvent,
  AssistantMessageEvent,
  ToolStatusEvent,
  DoneEvent,
  ErrorEvent,
  StreamEvent,
} from './lib/types';


const tool = platformTool;

import { createNdjsonWriter } from './lib/streaming';
import { createChunker } from './lib/chunker';

import {
  parseBody,
  mapMessagesForLLM,
  extractAssistantOutputs,
  extractFunctionCalls,
  safeParseToolArgs,
  isPlatformOperation,
} from './lib/helpers';


import { buildQuery, toNumber, isKnownMutationSuccess } from './lib/utils';
import operationHandlers, { confirmAssignment, confirmLearningVolume } from './lib/operationHandlers';




async function executePlatformOperation(
  operation: PlatformOperation,
  input: Record<string, unknown> | undefined,
  signal?: AbortSignal,
) {
  const handler = operationHandlers[operation];
  if (!handler) {
    throw new Error(`Unsupported operation: ${operation}`);
  }
  // Inject context values if missing
  if (operation === 'set_learning_volume') {
    if (!input?.studentCurriculumId && agentContext.studentCurriculumId) {
      input = { ...input, studentCurriculumId: agentContext.studentCurriculumId };
    }
  }
  // Pass the abort signal to the operation handler so platform HTTP calls can be cancelled
  return handler(input ?? {}, signal);
}


async function runToolCall(
  call: ResponseFunctionToolCall,
  writer: ReturnType<typeof createNdjsonWriter>,
  signal?: AbortSignal,
): Promise<ResponseInput[number]> {
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
    if (args.operation === 'grant_student_course') {
      // Save studentId and curriculumId
  const sid = toNumber(args.input?.studentId ?? args.input?.student_id);
  agentContext.studentId = sid === null ? undefined : sid;
  const cid = toNumber(args.input?.curriculumId ?? args.input?.curriculum_id);
  agentContext.curriculumId = cid === null ? undefined : cid;
    }
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

  const writer = createNdjsonWriter(res);
  const abortController = new AbortController();
  // If the client disconnects, abort long-running LLM and platform requests
  req.on('close', () => {
    abortController.abort();
  });

  try {
    const { messages = [] } = parseBody(req);
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'missing_messages' });
      return;
    }

    const llmMessages: ResponseInput = [
      { type: 'message', role: 'system', content: systemPrompt },
      ...mapMessagesForLLM(messages),
    ];

    let previousResponseId: string | undefined;
  let nextInput: ResponseInput | undefined;
  // Track retry attempts per function call id so LLM can correct arguments
  const retryCounts = new Map<string, number>();

    while (true) {
      const body = previousResponseId
        ? {
            model: 'gpt-5',
            previous_response_id: previousResponseId,
            input: nextInput ?? [],
            tools: [tool],
            stream: true,
          }
        : {
            model: 'gpt-5',
            input: llmMessages,
            tools: [tool],
            stream: true,
          };
  // Pass AbortSignal via the options param supported by the SDK
  // The SDK may return a Response or a Stream; we requested streaming, so cast to async iterable
  const responseStream = (await openai.responses.create(body, { signal: abortController.signal })) as AsyncIterable<any>;

      let completedResponse: Response | null = null;
      let aborted = false;

      // chunker: buffer deltas and emit sentence-sized deltas deterministically
      let chunker = createChunker((outputIndex, delta) => {
        writer.write({ type: 'assistant_delta', delta, outputIndex });
      });

      try {
        for await (const event of responseStream) {
          if (event.type === 'response.output_text.delta') {
            if (event.delta) {
              chunker.push(event.output_index ?? 0, event.delta);
            }
          } else if (event.type === 'response.completed') {
            completedResponse = event.response;
          } else if (event.type === 'response.failed') {
            // flush any pending chunks as an error will stop the flow
            chunker.stopAll();
            writer.write({ type: 'error', error: { message: 'llm_failed', details: event as any } });
            aborted = true;
            break;
          } else if (event.type === 'error') {
            chunker.stopAll();
            const errorMessage = (event as any)?.message ?? 'llm_error';
            writer.write({ type: 'error', error: { message: String(errorMessage), details: event as any } });
            aborted = true;
            break;
          }
        }
      } catch (err: any) {
        // make sure any buffered content is emitted before handling the error
        try {
          chunker?.stopAll();
        } catch {}
        // If aborted by client, signal the writer then exit
        if (abortController.signal.aborted) {
          writer.error({ message: 'client_aborted' });
          writer.close();
          return;
        }
        // Unexpected LLM error
        writer.write({ type: 'error', error: { message: 'llm_stream_error', details: { error: String(err) } } });
        writer.close();
        return;
      }

      if (aborted) {
        writer.close();
        return;
      }

      const finalResponse = completedResponse;
      if (!finalResponse) {
        writer.write({ type: 'error', error: { message: 'missing_response' } });
        writer.close();
        return;
      }
      previousResponseId = finalResponse.id;

      // Flush any remaining buffered deltas for each output before final messages
      // We don't know how many outputs the LLM produced, but extractAssistantOutputs will tell us
      const assistantOutputs = extractAssistantOutputs(finalResponse);
      // flush buffers for each output index present in final outputs
      for (const output of assistantOutputs) {
        // ensure any buffered text for this output index is emitted
        // we created chunker inside the loop, so call flush via stopAll before writing final messages
      }
      // stopAll will flush any remaining buffers
      try {
        chunker?.stopAll();
      } catch {}
      for (const output of assistantOutputs) {
        writer.write({
          type: 'assistant_message',
          content: output.text,
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
          // runToolCall already emitted tool_status failed event. Record attempt.
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

          // Send failure as a function_call_output so the LLM receives the failure details
          toolOutputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(failurePayload) } as any);

          if (attempts >= 3) {
            writer.write({ type: 'error', error: { message: `tool_failed_after_${attempts}_attempts`, stack: toolErr?.stack, details: toolErr as any } });
            writer.close();
            return;
          }

          // Stop processing any further function calls so the LLM can reply with corrected call
          brokeForRetry = true;
          break;
        }
      }

      // If we broke early to let LLM retry, nextInput will be the toolOutputs so the LLM sees the failure output
      nextInput = toolOutputs;
      if (!brokeForRetry) {
        // All tool calls succeeded; pass their outputs back to the LLM as usual for chaining
        nextInput = toolOutputs;
      }
    }
  } catch (err: any) {
    const message = err?.message ?? 'chat_failed';
    writer.error(message);
  }
}
