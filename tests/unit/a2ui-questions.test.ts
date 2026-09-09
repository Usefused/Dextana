import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { questionForm, questionReply } from '../../src/renderer/a2ui-questions';
import { A2UIQuestions } from '../../src/renderer/A2UIQuestions';
import { A2UIView } from '../../src/renderer/A2UIView';

const component = {
  id: 'root',
  component: 'QuestionForm',
  title: 'Report details',
  questions: [
    {
      id: 'audience',
      prompt: 'Who is it for?',
      type: 'single',
      options: [{ id: 'team', label: 'My team' }],
    },
    {
      id: 'sections',
      prompt: 'What should it contain?',
      type: 'multiple',
      options: [
        { id: 'summary', label: 'Summary' },
        { id: 'metrics', label: 'Metrics' },
      ],
    },
    { id: 'notes', prompt: 'Any other details?', type: 'text', required: false },
  ],
};

test('question replies contain readable reviewed answers, permit custom choices and validate required answers', () => {
  const form = questionForm(component);
  expect(() => questionReply(form, {})).toThrow('Who is it for?');
  const answers = {
    audience: { selected: [], text: 'External partners' },
    sections: { selected: ['metrics', 'summary'], text: '' },
  };
  expect(questionReply(form, answers)).toBe(
    'My answers to “Report details”:\n\nWho is it for?\nExternal partners\n\nWhat should it contain?\nSummary\nMetrics\n\nAny other details?\n(Skipped)',
  );
  expect(() =>
    questionReply(form, { ...answers, audience: { selected: ['invented'], text: '' } }),
  ).toThrow('valid answers');
  expect(() =>
    questionReply(form, { ...answers, audience: { selected: [], text: 'x'.repeat(2001) } }),
  ).toThrow('valid answers');
});

test('question schemas reject ambiguous identifiers, unsupported fields and oversized payloads', () => {
  for (const questions of [
    [],
    Array(7).fill(component.questions[0]),
    [component.questions[0], component.questions[0]],
    [{ ...component.questions[0], id: '__proto__' }],
    [{ ...component.questions[0], type: 'script' }],
    [
      {
        ...component.questions[0],
        options: [
          { id: 'team', label: 'A' },
          { id: 'team', label: 'B' },
        ],
      },
    ],
  ])
    expect(() => questionForm({ ...component, questions })).toThrow();
});

test('streaming and standalone question displays are inert; completed chat forms can reply', () => {
  const source = JSON.stringify([
    {
      version: 'v0.9',
      createSurface: { surfaceId: 'questions', catalogId: 'urn:dextana:display:1' },
    },
    { version: 'v0.9', updateComponents: { surfaceId: 'questions', components: [component] } },
  ]);
  const render = (props: object) =>
    renderToStaticMarkup(createElement(A2UIView, { source, ...props }));
  expect(render({})).toContain('read-only');
  expect(render({ streaming: true, reply: { send: async () => {} } })).toContain(
    'fieldset disabled',
  );
  expect(render({ reply: { send: async () => {} } })).not.toContain('fieldset disabled');
  expect(render({ reply: { answered: true } })).toContain('Answered in your reply below');
  expect(render({ reply: { answered: true } })).not.toContain('<textarea');
});


test('short answers use inputs and only explicitly multiline questions use text areas', () => {
  const form = questionForm({ title: 'Details', questions: [
    { id: 'name', type: 'text', prompt: 'Project name?' },
    { id: 'brief', type: 'text', prompt: 'Describe the requirements', multiline: true },
  ] });
  const markup = renderToStaticMarkup(createElement(A2UIQuestions, { form, reply: { send: async () => {} } }));
  expect(markup.match(/<input /g)).toHaveLength(1);
  expect(markup.match(/<textarea /g)).toHaveLength(1);
  expect(() => questionForm({ title: 'Invalid', questions: [{ id: 'name', type: 'text', prompt: 'Name?', multiline: 'yes' }] })).toThrow('Multiline');
});
