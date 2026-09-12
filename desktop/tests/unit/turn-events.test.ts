import { expect, test } from 'vitest';
import { turnEvents } from '../../src/shared/turn-events';
import type { Message } from '../../src/shared/types';

test('turn logs stay with their response as new turns and events arrive', () => {
  const messages = [
    { id: 'u1', role: 'user', eventStart: 1 },
    { id: 'a1', role: 'assistant' },
    { id: 'u2', role: 'user', eventStart: 3 },
    { id: 'a2', role: 'assistant' },
  ] as Message[];
  const result = turnEvents(messages, ['legacy', 'open', 'read', 'send']);
  expect(result.earlier).toEqual(['legacy']);
  expect(result.turns.get(1)).toEqual(['open', 'read']);
  expect(result.turns.get(3)).toEqual(['send']);
  expect(turnEvents(messages, ['legacy', 'open', 'read', 'send', 'done']).turns.get(1)).toEqual(['open', 'read']);
  expect(turnEvents(messages.slice(0, 3), ['legacy', 'open', 'read', 'starting']).turns.get(2)).toEqual(['starting']);
  expect(turnEvents([{ id: 'old', role: 'user' } as Message], ['legacy']).earlier).toEqual(['legacy']);
});
