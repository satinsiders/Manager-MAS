Assistant contract for Manager-MAS chat assistant

Purpose
- Describe the public contract the assistant follows when interacting via the `/api/chat` streaming endpoint.

Inputs
- JSON body: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
- Tools: a single function tool `platform_api_call` used for reading/updating platform data.

Outputs
- The server streams newline-delimited JSON (NDJSON) events of these types:
  - assistant_delta: incremental text chunks (deltas) for the assistant's output
  - assistant_message: final assistant message text for a given output index
  - tool_status: progress updates for platform tool calls (started, succeeded, failed)
  - done: end-of-response marker
  - error: structured error payload

Streaming behavior
- Assistant text is emitted as short, incremental deltas suitable for token-by-token or token-group rendering in the client.
- The assistant is instructed (system prompt) to produce short sentences and concise public rationales (1-3 sentences) when a rationale is needed.
- The assistant must not emit chain-of-thought or internal reasoning; only public-facing rationales are allowed.
- Tool calls are represented as structured function_call objects on the LLM side; the server executes them and emits `tool_status` events during execution and `function_call_output` back into the LLM loop.

Error modes
- Tool failure: server emits `tool_status` with status `failed` and includes a failure message; the server will allow up to 3 retry attempts initiated by the LLM. After 3 attempts, the server emits `error` and closes the stream.
- LLM failure: server emits `error` with diagnostic details and closes the stream.
- Client disconnect: server should stop long-running work when client disconnected. Client abort is propagated to the fetch/stream reading on the server.

Success criteria
- Client receives at least one `assistant_delta` followed by `assistant_message` and a `done` event when no tools are required.
- For calls involving platform operations, client receives `tool_status` events for progress and either a succeeded flow ending with `done` or clear `error` events when failure occurs.

Notes for implementers
- Keep deltas small and in short sentence-sized chunks where possible.
- Avoid sending large JSON blobs directly to the user; instead summarize and provide structured data back to the LLM.
- Respect privacy and do not include secrets in any streamed payloads.
