import type { Message } from '../shared/types';

export function appendThought(message: Message, delta: unknown, now = Date.now()) {
  if (typeof delta !== 'string' || !delta) return;
  message.thought ??= { text: '', durationMs: 0 };
  message.thought.steps ??= message.thought.text ? [message.thought.text] : [];
  if (message.thought.runningSince === undefined || !message.thought.steps.length) message.thought.steps.push('');
  message.thought.steps[message.thought.steps.length - 1] += delta;
  message.thought.runningSince ??= now;
  message.thought.text += delta;
}

export function finishThought(message: Message, now = Date.now()) {
  if (message.thought?.runningSince !== undefined) {
    message.thought.durationMs += Math.max(0, now - message.thought.runningSince);
    delete message.thought.runningSince;
  }
}
