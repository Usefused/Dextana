import { expect, it } from 'vitest';
import { appendThought, finishThought } from '../../src/main/thoughts';
import type { Message } from '../../src/shared/types';

it('times only thought phases, excludes tool waits, and keeps thoughts out of the answer', () => {
  const message: Message = { id: 'one', role: 'assistant', content: 'Answer', model: 'local' };
  appendThought(message, 'First', 1000);
  appendThought(message, ' thought.', 1500);
  finishThought(message, 3000);
  finishThought(message, 5000);
  appendThought(message, ' Second thought.', 10_000);
  finishThought(message, 11_000);
  expect(message.thought).toEqual({ text: 'First thought. Second thought.', steps: ['First thought.', ' Second thought.'], durationMs: 3000 });
  expect(message.content).toBe('Answer');
});

it('does not create a thought panel for empty or malformed provider deltas', () => {
  const message: Message = { id: 'one', role: 'assistant', content: '', model: 'local' };
  for (const delta of ['', null, {}, 1]) appendThought(message, delta);
  expect(message.thought).toBeUndefined();
});
