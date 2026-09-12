import { createServer, type ServerResponse } from 'node:http';
import { StringDecoder } from 'node:string_decoder';
export interface ModelTrace {
  models: string[];
  results: string[];
  calls: { name: string; arguments: Record<string, unknown> }[];
  replies: string[];
  errors: string[];
  requests: number;
  inputTokens: number;
  outputTokens: number;
}
function capture(line: string, trace: ModelTrace) {
  if (!line.trim()) return;
  const chunk = JSON.parse(line);
  for (const tool of chunk.message?.tool_calls ?? []) trace.calls.push(tool.function);
  if (chunk.message?.content) trace.replies.push(chunk.message.content);
  trace.inputTokens += chunk.prompt_eval_count ?? 0;
  trace.outputTokens += chunk.eval_count ?? 0;
}
async function forward(
  path: string,
  body: string,
  response: ServerResponse,
  trace: ModelTrace,
  base: string,
) {
  if (!['/api/tags', '/api/show', '/api/chat', '/api/ps'].includes(path))
    throw new Error(`Unsupported model endpoint: ${path}`);
  if (path === '/api/chat' && ++trace.requests > 30)
    throw new Error('Model request budget exhausted');
  if (path === '/api/chat') {
    const request = JSON.parse(body);
    trace.models.push(request.model);
    trace.results = request.messages
      .filter((item: any) => item.role === 'tool')
      .map((item: any) => String(item.content));
  }
  const controller = new AbortController();
  response.on('close', () => controller.abort());
  const upstream = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    body: body || undefined,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)]),
  });
  if (!upstream.ok)
    throw new Error(`Model HTTP ${upstream.status}: ${(await upstream.text()).slice(0, 500)}`);
  response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
  await stream(upstream, response, path === '/api/chat' ? trace : undefined);
}
async function stream(upstream: Response, response: ServerResponse, trace?: ModelTrace) {
  let pending = '';
  const decoder = new StringDecoder('utf8');
  for await (const bytes of upstream.body!) {
    response.write(bytes);
    if (!trace) continue;
    pending += decoder.write(Buffer.from(bytes));
    const lines = pending.split('\n');
    pending = lines.pop()!;
    for (const line of lines) capture(line, trace);
  }
  if (trace) capture(pending + decoder.end(), trace);
  response.end();
}
export async function liveModelProxy(base: string) {
  const trace: ModelTrace = {
    models: [],
    results: [],
    calls: [],
    replies: [],
    errors: [],
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      await forward(request.url!, body, response, trace, base);
    } catch (error) {
      trace.errors.push(String(error));
      response.statusCode = 502;
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    trace,
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
