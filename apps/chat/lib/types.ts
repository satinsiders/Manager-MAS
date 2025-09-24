export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  messages?: ChatMessage[];
};

export type AssistantDeltaEvent = {
  type: 'assistant_delta';
  delta: string;
  outputIndex: number;
};

export type AssistantMessageEvent = {
  type: 'assistant_message';
  content: string;
  outputIndex: number;
};

export type ToolStatusEvent = {
  type: 'tool_status';
  callId: string;
  operation: string;
  status: 'started' | 'succeeded' | 'failed';
  durationMs?: number;
  message?: string;
};

export type DoneEvent = { type: 'done' };

export type ErrorPayload = { message?: string; stack?: string; details?: Record<string, unknown> };
export type ErrorEvent = { type: 'error'; message?: string; error?: ErrorPayload };

export type StreamEvent =
  | AssistantDeltaEvent
  | AssistantMessageEvent
  | ToolStatusEvent
  | DoneEvent
  | ErrorEvent;
