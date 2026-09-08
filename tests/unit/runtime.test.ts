import { describe, expect, it } from 'vitest';
import { readSSE } from '../../src/main/runtime';
describe('Harnest stream framing', () => {
  it('decodes fragmented UTF-8, comments, and multiple CRLF frames', async () => {
    const bytes = new TextEncoder().encode(
      ': heartbeat\r\n\r\ndata: {"type":"response.text.delta","delta":"café"}\r\n\r\ndata: {"type":"response.completed"}\r\n\r\n',
    );
    const stream = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const events: any[] = [];
    await readSSE(new Response(stream), async (event) => {
      events.push(event);
    });
    expect(events).toEqual([
      { type: 'response.text.delta', delta: 'café' },
      { type: 'response.completed' },
    ]);
  });
  it('does not treat HTTP errors as a completed stream', async () => {
    await expect(
      readSSE(new Response('unavailable', { status: 503 }), async () => {}),
    ).rejects.toThrow('503');
  });
});
