import type { Activity } from '../shared/types';
import { A2UIQuestions } from './A2UIQuestions';
import { questionForm } from './a2ui-questions';
import { Notice } from './ui';

export function LiveQuestions({ activity, replied }: { activity: Activity; replied: () => void }) {
  return (
    <>
      {activity.questions?.map((question) => {
        try {
          const form = questionForm(question.form);
          return (
            <section
              className="live-agent-question"
              key={question.id}
              aria-label={`Question from ${question.sourceTitle}`}
            >
              <p className="settings-caption">
                {question.activityId === activity.id
                  ? question.status === 'pending'
                    ? 'Dextana has a question'
                    : 'Dextana’s question'
                  : `Agent question · ${question.sourceTitle}`}
              </p>
              <A2UIQuestions
                form={form}
                reply={{
                  answered: question.status === 'answered',
                  closed: question.status === 'cancelled' ? 'cancelled' : undefined,
                  send:
                    question.status === 'pending' && !activity.archived
                      ? async (prompt) => {
                          await window.dextana.answerQuestions({
                            activityId: activity.id,
                            questionId: question.id,
                            prompt,
                          });
                          replied();
                        }
                      : undefined,
                }}
              />
              {question.answer && (
                <div className="live-question-answer">
                  <strong>You replied</strong>
                  <p>{question.answer}</p>
                </div>
              )}
              {question.status === 'cancelled' && (
                <p className="settings-caption">
                  This question closed when its agent stopped. Continue the chat to revisit it.
                </p>
              )}
            </section>
          );
        } catch {
          return (
            <Notice key={question.id} tone="danger">
              This question could not be displayed. Reply through the chat composer.
            </Notice>
          );
        }
      })}
    </>
  );
}
