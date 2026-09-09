import type { DesktopContext, DesktopProvider } from '../../shared/desktop';
import { DesktopWorkflows } from './workflows';

function reviewTarget(
  service: DesktopWorkflows,
  operation: string,
  args: Record<string, unknown>,
  context: DesktopContext,
) {
  if (typeof args.id !== 'string') return {};
  const snapshot = service.snapshot(context.activityId);
  if (operation.startsWith('workflow.watch_')) {
    const rule = snapshot.watches.find((item) => item.id === args.id);
    if (!rule) throw new Error('This watched folder is not referenced by this chat.');
    return { name: rule.name, folder: rule.folder };
  }
  if (operation === 'processing.cancel') {
    const job = snapshot.jobs.find((item) => item.id === args.id);
    if (!job) throw new Error('This processing job is not referenced by this chat.');
    return { kind: job.kind, outputPath: job.outputPath };
  }
  return {};
}

export function workflowProvider(
  service: DesktopWorkflows,
  completed: (
    operation: string,
    args: Record<string, unknown>,
    result: unknown,
    context: DesktopContext,
  ) => void,
): DesktopProvider {
  return {
    operations: () => service.operations(),
    async preview(operation, args, context) {
      const prepared = await service.prepare(operation, args, context);
      return {
        ...reviewTarget(service, operation, args, context),
        ...JSON.parse(prepared.preview),
      };
    },
    async execute(operation, args, context, signal) {
      const result = await service.execute(operation, args, signal, context);
      completed(operation, args, result, context);
      return result;
    },
  };
}
