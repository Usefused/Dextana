import type { Message } from './types';

// Boundaries are recorded when a user turn starts, including queued/steered turns.
// Older conversations retain their unassigned history rather than guessing ownership.
export function turnEvents(messages: Message[], events: string[]) {
  const starts = messages.flatMap((message, index) =>
    message.role === 'user' && Number.isInteger(message.eventStart) && message.eventStart! >= 0
      ? [{ index, start: Math.min(message.eventStart!, events.length) }]
      : []);
  const turns = new Map<number, string[]>();
  starts.forEach((entry, i) => {
    const next = starts[i + 1];
    const endIndex = next ? next.index - 1 : messages.length - 1;
    turns.set(endIndex, events.slice(entry.start, next?.start ?? events.length));
  });
  return { turns, earlier: events.slice(0, starts[0]?.start ?? events.length) };
}
