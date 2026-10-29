import { describe, expect, it } from 'vitest';
import { formatEvent, SseParser } from '@/lib/sse';

describe('SseParser', () => {
  it('parses events split across chunks and skips heartbeats', () => {
    const p = new SseParser();
    const wire = formatEvent({ event: 'chat_id', data: { chat_id: 'abc' } }) + ': ping\n\n' +
      formatEvent({ event: 'chunk', data: { text: 'สวัสดี' } });
    const first = p.push(wire.slice(0, 20));
    const rest = p.push(wire.slice(20));
    expect([...first, ...rest]).toEqual([
      { event: 'chat_id', data: { chat_id: 'abc' } },
      { event: 'chunk', data: { text: 'สวัสดี' } },
    ]);
  });

  it('ignores malformed JSON frames', () => {
    const p = new SseParser();
    expect(p.push('event: chunk\ndata: {oops\n\n')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const p = new SseParser();
    expect(p.push('event: error\r\ndata: {"error":"x"}\r\n\r\n')).toEqual([{ event: 'error', data: { error: 'x' } }]);
  });
});
