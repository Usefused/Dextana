import type { Activity } from '../shared/types';
import { A2UIQuestions } from './A2UIQuestions';
import { questionForm } from './a2ui-questions';
import { Notice } from './ui';

export function LiveQuestions({ activity, replied }: { activity: Activity; replied: () => void }) {
  return (
    <>
      {activity.questions
        ?.filter((question) => question.status === 'pending')
        .map((question) => {
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
                    ? 'Dextana has a question'
                    : `Agent question · ${question.sourceTitle}`}
                </p>
                <A2UIQuestions
                  form={form}
                  reply={{
                    send: !activity.archived
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
