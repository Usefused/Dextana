import { record } from './a2ui';

export type Question = {
  id: string;
  prompt: string;
  type: 'text' | 'single' | 'multiple';
  required: boolean;
  multiline?: boolean;
  options: { id: string; label: string; description?: string }[];
};
export type QuestionForm = { title: string; questions: Question[] };
export type QuestionAnswer = { selected: string[]; text: string };
export type QuestionAnswers = Record<string, QuestionAnswer>;

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new Error('Invalid question text.');
  return value.trim();
}
function identifier(value: unknown): string {
  const id = text(value, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id))
    throw new Error('Invalid question identifier.');
  return id;
}
export function questionForm(value: unknown): QuestionForm {
  if (
    !record(value) ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    value.questions.length > 6
  )
    throw new Error('A question card must contain between one and six questions.');
  const questions = value.questions.map((item): Question => {
    if (!record(item) || !['text', 'single', 'multiple'].includes(String(item.type)))
      throw new Error('Unsupported question type.');
    if (item.multiline !== undefined && typeof item.multiline !== 'boolean')
      throw new Error('Multiline must be true or false.');
    const options = item.type === 'text' ? [] : item.options;
    if (!Array.isArray(options) || options.length > 12 || (item.type !== 'text' && !options.length))
      throw new Error('Choice questions need between one and twelve options.');
    const choices = options.map((option) => {
      if (!record(option)) throw new Error('Invalid question option.');
      return {
        id: identifier(option.id),
        label: text(option.label, 120),
        ...(option.description === undefined ? {} : { description: text(option.description, 240) }),
      };
    });
    if (new Set(choices.map((option) => option.id)).size !== choices.length)
      throw new Error('Question option IDs must be unique.');
    return {
      id: identifier(item.id),
      prompt: text(item.prompt, 500),
      type: item.type as Question['type'],
      required: item.required !== false,
      multiline: item.multiline === true,
      options: choices,
    };
  });
  if (new Set(questions.map((question) => question.id)).size !== questions.length)
    throw new Error('Question IDs must be unique.');
  return { title: text(value.title ?? 'A few details before we continue', 160), questions };
}

// Only reviewed answers become a user message; model-defined actions are never executed.
export function questionReply(form: QuestionForm, answers: QuestionAnswers): string {
  let answered = false;
  const lines = form.questions.map((question) => {
    const answer = answers[question.id] ?? { selected: [], text: '' };
    const selected = [...new Set(answer.selected)];
    if (
      answer.text.length > 2000 ||
      selected.some((id) => !question.options.some((option) => option.id === id)) ||
      (question.type !== 'multiple' && selected.length > (question.type === 'text' ? 0 : 1))
    )
      throw new Error('Choose valid answers before sending.');
    const parts = question.options
      .filter((option) => selected.includes(option.id))
      .map((option) => option.label);
    if (answer.text.trim()) parts.push(answer.text.trim());
    if (question.required && !parts.length)
      throw new Error(`Answer “${question.prompt}” before sending.`);
    answered ||= !!parts.length;
    return `${question.prompt}\n${parts.length ? parts.join('\n') : '(Skipped)'}`;
  });
  if (!answered) throw new Error('Add an answer before sending.');
  return `My answers to “${form.title}”:\n\n${lines.join('\n\n')}`;
}
