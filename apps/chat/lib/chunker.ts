type EmitFn = (outputIndex: number, delta: string) => void;

export type ChunkerOptions = {
  maxBufferChars?: number; // emit if buffer exceeds this length
  maxIdleMs?: number; // emit after this idle time even if no sentence end
};

export function createChunker(emit: EmitFn, opts: ChunkerOptions = {}) {
  const maxBufferChars = opts.maxBufferChars ?? 240;
  const maxIdleMs = opts.maxIdleMs ?? 400;

  const buffers = new Map<number, { text: string; timer?: NodeJS.Timeout }>();

  function scheduleFlush(index: number) {
    const entry = buffers.get(index);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      flush(index);
    }, maxIdleMs);
  }

  function push(index: number, delta: string) {
    if (!buffers.has(index)) buffers.set(index, { text: '' });
    const entry = buffers.get(index)!;
    entry.text += delta;

    // If we see a sentence terminator, emit up to the last terminator
    const match = entry.text.match(/([\s\S]*?[\.\!\?\n])([\s\S]*)$/);
    if (match) {
      const toSend = match[1];
      entry.text = match[2] ?? '';
      emit(index, toSend);
      scheduleFlush(index);
      return;
    }

    // If buffer too big, emit what's available
    if (entry.text.length >= maxBufferChars) {
      const toSend = entry.text;
      entry.text = '';
      emit(index, toSend);
      scheduleFlush(index);
      return;
    }

    // Otherwise schedule an idle flush
    scheduleFlush(index);
  }

  function flush(index: number) {
    const entry = buffers.get(index);
    if (!entry) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (entry.text && entry.text.length > 0) {
      emit(index, entry.text);
      entry.text = '';
    }
  }

  function stopAll() {
    for (const [index, entry] of buffers.entries()) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.text && entry.text.length > 0) {
        emit(index, entry.text);
      }
    }
    buffers.clear();
  }

  return { push, flush, stopAll };
}
