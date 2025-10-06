import type { VercelRequest } from '../../../packages/shared/vercel';
import type { Response, ResponseFunctionToolCall, ResponseInput } from 'openai/resources/responses/responses';
import type { PlatformToolArgs, PlatformOperation } from './llm';
import { PLATFORM_OPERATIONS } from './llm';

export function parseBody(req: VercelRequest): any {
  const { body } = req;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

export function mapMessagesForLLM(messages: Array<{ role: string; content: string }>): ResponseInput {
  const inputs: ResponseInput = [];
  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    inputs.push({
      type: 'message',
      role: message.role as any,
      content: message.content,
    });
  }
  return inputs;
}

export function extractAssistantOutputs(response: Response) {
  const outputs: Array<{ index: number; text: string }> = [];
  response.output.forEach((item, index) => {
    if (item.type !== 'message') return;
    const text = (item as any).content
      .filter((part: any) => part.type === 'output_text')
      .map((part: any) => part.text)
      .join('')
      .trim();
    if (text) {
      outputs.push({ index, text });
    }
  });
  return outputs;
}

export function extractFunctionCalls(response: Response): ResponseFunctionToolCall[] {
  const calls: ResponseFunctionToolCall[] = [];
  for (const item of response.output) {
    if (item.type === 'function_call') {
      calls.push(item as any);
    }
  }
  return calls;
}

export function safeParseToolArgs(raw: string | null | undefined): PlatformToolArgs {
  if (!raw) {
    throw new Error('Tool arguments missing');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Tool arguments must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be an object');
  }
  const operation = (parsed as any).operation;
  if (!isPlatformOperation(operation)) {
    throw new Error('Unsupported operation');
  }
  const input = (parsed as any).input;
  if (input && (typeof input !== 'object' || Array.isArray(input))) {
    throw new Error('Tool input must be an object');
  }
  return { operation, input: input as Record<string, unknown> | undefined };
}

export function isPlatformOperation(value: unknown): value is PlatformOperation {
  return typeof value === 'string' && (PLATFORM_OPERATIONS as readonly string[]).includes(value as string);
}
