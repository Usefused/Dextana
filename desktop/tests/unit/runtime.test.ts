import { describe, expect, it, vi } from 'vitest';
import { Runtime, readSSE } from '../../src/main/runtime';
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


it('rebuild waits for backend exit and restarts even when the staging build fails', async () => {
  const { EventEmitter } = await import('node:events');
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const runtime = new Runtime();
  (runtime as any).process = child;
  vi.spyOn(runtime, 'stop').mockImplementation(() => {});
  const ready = vi.spyOn(runtime, 'ensure').mockResolvedValue();
  const build = vi.fn().mockRejectedValue(new Error('compile failed'));
  const restarting = runtime.rebuild(build);
  const failed = expect(restarting).rejects.toThrow('compile failed');
  expect(build).not.toHaveBeenCalled();
  child.emit('exit');
  await failed;
  expect(build).toHaveBeenCalledOnce();
  expect(ready).toHaveBeenCalledOnce();
});
