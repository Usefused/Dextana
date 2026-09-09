import { createContext, useRef, useState } from 'react';
import { Button, Card, CheckboxCard, Field, Icon, Notice, Select, TextArea, TextInput } from './ui';
import { questionReply, type QuestionForm, type QuestionAnswers } from './a2ui-questions';

export type UIReply = {
  send?: (prompt: string) => Promise<void>;
  answered?: boolean;
  closed?: 'continued' | 'cancelled';
};
export const QuestionReplyContext = createContext<UIReply | undefined>(undefined);

export function A2UIQuestions({ form, reply }: { form: QuestionForm; reply?: UIReply }) {
  const [answers, setAnswers] = useState<QuestionAnswers>({});
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const answered = sent || reply?.answered;
  const disabled = !reply?.send || sending || answered;
  if (answered || reply?.closed) {
    return (
      <Card as="section" className="ui-question-card" aria-label={form.title}>
        <h3>{form.title}</h3>
        <p role="status" className="settings-caption">
          {answered
            ? 'Answered in your reply below.'
            : reply?.closed === 'cancelled'
              ? 'Question closed.'
              : 'Continued in chat.'}
        </p>
      </Card>
    );
  }
  return (
    <Card as="section" className="ui-question-card" aria-label={form.title}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (disabled || inFlight.current) return;
          setError('');
          try {
            const prompt = questionReply(form, answers);
            inFlight.current = true;
            setSending(true);
            await reply!.send!(prompt);
            setSent(true);
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            inFlight.current = false;
            setSending(false);
          }
        }}
      >
        <h3>{form.title}</h3>
        {form.questions.map((question) => {
          const answer = answers[question.id] ?? { selected: [], text: '' };
          const change = (patch: Partial<typeof answer>) =>
            setAnswers((current) => ({
              ...current,
              [question.id]: { ...(current[question.id] ?? { selected: [], text: '' }), ...patch },
            }));
          return (
            <fieldset key={question.id} disabled={disabled}>
              <legend>
                {question.prompt}
                {!question.required && <span className="settings-caption"> · Optional</span>}
              </legend>
              {question.type === 'single' && (
                <Field label="Choose an option">
                  {(props) => (
                    <Select
                      {...props}
                      value={answer.selected[0] ?? ''}
                      onChange={(event) =>
                        change({ selected: event.target.value ? [event.target.value] : [] })
                      }
                    >
                      <option value="">Choose an option or write your answer below</option>
                      {question.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              {question.type === 'single' &&
                question.options.find((option) => option.id === answer.selected[0])
                  ?.description && (
                  <p className="settings-caption">
                    {
                      question.options.find((option) => option.id === answer.selected[0])
                        ?.description
                    }
                  </p>
                )}
              {question.type === 'multiple' && (
                <div className="ui-question-options">
                  {question.options.map((option) => (
                    <CheckboxCard
                      compact
                      key={option.id}
                      label={option.label}
                      description={option.description}
                      disabled={disabled}
                      checked={answer.selected.includes(option.id)}
                      onChange={(event) =>
                        change({
                          selected: event.target.checked
                            ? [...answer.selected, option.id]
                            : answer.selected.filter((id) => id !== option.id),
                        })
                      }
                    />
                  ))}
                </div>
              )}
              <Field
                label={
                  question.type === 'text' ? 'Your answer' : 'Your own answer or extra details'
                }
              >
                {(props) =>
                  question.multiline ? (
                    <TextArea
                      {...props}
                      value={answer.text}
                      maxLength={2000}
                      rows={2}
                      onChange={(event) => change({ text: event.target.value })}
                    />
                  ) : (
                    <TextInput
                      {...props}
                      value={answer.text}
                      maxLength={2000}
                      onChange={(event) => change({ text: event.target.value })}
                    />
                  )
                }
              </Field>
            </fieldset>
          );
        })}
        {error && <Notice tone="danger">{error}</Notice>}
        {!reply?.send && (
          <p className="settings-caption">
            {reply
              ? 'Reply from the chat composer, or wait for the current response to finish.'
              : 'This question card is read-only.'}
          </p>
        )}
        <Button type="submit" icon={<Icon name="arrow" />} disabled={disabled}>
          {sending ? 'Sending…' : 'Send reply'}
        </Button>
      </form>
    </Card>
  );
}
