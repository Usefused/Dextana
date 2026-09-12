import type { DesktopProvider, DesktopContext } from '../../shared/desktop';
import type { DesktopTimeFilesRequest } from '../../shared/desktop-time-files';
import { DesktopTimeFiles } from './time-files';
import { timeFileOperations } from './time-files-operations';

/** Agent-scoped adapter; the owner UI may separately manage all local alarms. */
export function timeProvider(
  service: DesktopTimeFiles,
  completed: (
    operation: string,
    args: Record<string, unknown>,
    result: unknown,
    context: DesktopContext,
  ) => void,
  describeFile?: (fileId: string, activityId: string) => unknown,
): DesktopProvider {
  return {
    operations: () => [...timeFileOperations],
    async preview(operation, args, context) {
      if (operation === 'file.open' && describeFile)
        return {
          operation,
          file: describeFile(String(args.fileId), context.activityId),
          application: 'System default',
        };
      if (typeof args.id === 'string') {
        const alarm = service
          .snapshot()
          .alarms.find((a) => a.id === args.id && a.sourceActivityId === context.activityId);
        if (!alarm) throw new Error('This alarm is not referenced by this chat.');
        return { operation, title: alarm.title, dueAt: alarm.dueAt, ...args };
      }
      return { operation, ...args };
    },
    async execute(operation, args, context, signal) {
      signal.throwIfAborted();
      if (operation === 'alarms.list') {
        const snapshot = service.snapshot();
        return {
          ...snapshot,
          alarms: snapshot.alarms.filter((alarm) => alarm.sourceActivityId === context.activityId),
        };
      }
      if (
        typeof args.id === 'string' &&
        !service
          .snapshot()
          .alarms.some((a) => a.id === args.id && a.sourceActivityId === context.activityId)
      )
        throw new Error('This alarm is not referenced by this chat.');
      const request = {
        ...args,
        operation,
        activityId: context.activityId,
        sourceActivityId: context.activityId,
      } as DesktopTimeFilesRequest;
      const result = await service.execute(request);
      completed(operation, args, result, context);
      return operation === 'file.open'
        ? result
        : { ...result, availability: service.snapshot().availability };
    },
  };
}
