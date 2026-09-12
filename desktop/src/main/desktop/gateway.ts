import type {
  DesktopContext,
  DesktopOperation,
  DesktopProvider,
  DesktopRequest,
  DesktopWork,
} from '../../shared/desktop';
import { parseDesktopArguments, validateInput } from './input-schema';

const works: DesktopWork[] = ['time', 'files', 'workflows', 'processing', 'device', 'computer'];

/** Discovery selects a task-scoped surface; it never grants execution permission. */
export class DesktopGateway {
  private selected = new Map<string, Map<string, DesktopOperation>>();
  constructor(private providers: DesktopProvider[]) {}

  discover(context: DesktopContext, work?: DesktopWork) {
    if (!work)
      return {
        work: works,
        instruction:
          'Use desktop(action="discover", work="<category>") to load supported operations. Discover again when the work changes.',
      };
    if (!works.includes(work))
      throw new Error('Choose time, files, workflows, processing, device, or computer.');
    const operations = this.providers
      .flatMap((provider) => provider.operations())
      .filter((operation) => operation.work === work);
    this.selected.set(
      context.activityId,
      new Map(operations.map((operation) => [operation.name, structuredClone(operation)])),
    );
    return {
      work,
      operations,
      instruction: `These are operations of the desktop tool, not standalone tools. Call desktop(action="call", work="${work}", operation="<returned name>", arguments_json="<JSON object matching inputSchema>"). For an empty schema use arguments_json="{}". Discovery does not authorize actions.`,
    };
  }

  private resolve(context: DesktopContext, name: string) {
    const loaded = this.selected.get(context.activityId)?.get(name);
    for (const provider of this.providers) {
      const operation = provider.operations().find((candidate) => candidate.name === name);
      if (loaded && operation && JSON.stringify(loaded) === JSON.stringify(operation))
        return { provider, operation };
    }
    throw new Error(
      'This desktop operation is not loaded or its capabilities changed. Discover the relevant work surface again.',
    );
  }

  async prepare(context: DesktopContext, request: DesktopRequest) {
    if (request.action !== 'call' || typeof request.operation !== 'string')
      throw new Error('Discover a desktop work surface, then call a returned operation.');
    const { provider, operation } = this.resolve(context, request.operation);
    const args = parseDesktopArguments(request.arguments_json ?? '{}');
    validateInput(operation.inputSchema, args);
    const fingerprint = JSON.stringify(operation);
    // Keep review data separate so UI/provider mutation cannot alter an approved call.
    const details = provider.preview
      ? await provider.preview(operation.name, structuredClone(args), context)
      : structuredClone(args);
    return {
      operation: structuredClone(operation),
      details,
      execute: async (signal: AbortSignal) => {
        signal.throwIfAborted();
        const fresh = this.resolve(context, operation.name);
        if (fresh.provider !== provider || JSON.stringify(fresh.operation) !== fingerprint)
          throw new Error('Desktop capabilities changed while awaiting approval. Discover again.');
        return provider.execute(operation.name, args, context, signal);
      },
    };
  }

  release(activityId: string) {
    this.selected.delete(activityId);
    this.providers.forEach((provider) => provider.release?.(activityId));
  }
}
