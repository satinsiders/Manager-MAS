import type { VercelRequest, VercelResponse } from '../../../packages/shared/vercel';
import { createNdjsonWriter } from './streaming';
import { openai } from './openaiClient';
import { systemPrompt, platformTool as tool } from './llm';
import {
  parseBody,
  mapMessagesForLLM,
  extractAssistantOutputs,
  extractFunctionCalls,
  safeParseToolArgs,
  isPlatformOperation,
} from './helpers';
import { executePlatformOperation, runToolCall } from './platformExecutor';
import type { Response, ResponseFunctionToolCall, ResponseInput } from 'openai/resources/responses/responses';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const writer = createNdjsonWriter(res);

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
    const retryCounts = new Map<string, number>();

    while (true) {
      const responseStream = await openai.responses.stream(
        previousResponseId
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
            },
      );

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
          const output = await runToolCall(call, writer);
          toolOutputs.push(output as any);
        } catch (toolErr: any) {
          const callId = String(call.call_id);
          const prevAttempts = retryCounts.get(callId) ?? 0;
          const attempts = prevAttempts + 1;
          retryCounts.set(callId, attempts);

          const message = toolErr?.message ?? 'tool_failed';
          const failurePayload = { __tool_error: true, message, attempt: attempts } as Record<string, unknown>;
          toolOutputs.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(failurePayload) } as any);

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
    }
  } catch (err: any) {
    const message = err?.message ?? 'chat_failed';
    writer.error(message);
  }
}
 
