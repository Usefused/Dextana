import { useEffect, useState } from 'react';
import type {
  TeachSnapshot,
  TaughtSkill,
  TaughtSkillDraft,
  TaughtSkillInput,
} from '../shared/teach-dex';
import { Badge, Button, Card, EmptyState, TextArea, TextInput, Icon } from './ui';

const id = () => crypto.randomUUID();

export function SkillRunInputs({
  skill,
  cancel,
  run,
}: {
  skill: TaughtSkillDraft;
  cancel: () => void;
  run: (inputs: Record<string, string>) => Promise<void>;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Card className="teach-run-inputs" aria-label={`Run ${skill.name}`}>
      <h3>Run {skill.name}</h3>
      <p>Enter values for this run. They are not stored in the skill.</p>
      {skill.inputs.map((input) => (
        <label key={input.id}>
          {input.name}
          <TextInput
            required={input.required}
            value={inputs[input.id] ?? ''}
            placeholder={input.description}
            onChange={(event) => setInputs({ ...inputs, [input.id]: event.target.value })}
          />
        </label>
      ))}
      {!skill.inputs.length && (
        <p className="settings-caption">This skill has no variable inputs.</p>
      )}
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      <div className="dx-actions">
        <Button variant="secondary" disabled={busy} onClick={cancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          busy={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void run(inputs)
              .catch((failure) => setError(failure.message))
              .finally(() => setBusy(false));
          }}
        >
          Start supervised run
        </Button>
      </div>
    </Card>
  );
}

function InputEditor({
  input,
  change,
  remove,
}: {
  input: TaughtSkillInput;
  change: (input: TaughtSkillInput) => void;
  remove: () => void;
}) {
  return (
    <div className="teach-input-row">
      <TextInput
        aria-label="Input name"
        value={input.name}
        placeholder="Customer name"
        onChange={(event) => change({ ...input, name: event.target.value })}
      />
      <TextInput
        aria-label="Input description"
        value={input.description}
        placeholder="What should Dex ask for?"
        onChange={(event) => change({ ...input, description: event.target.value })}
      />
      <label>
        <input
          type="checkbox"
          checked={input.required}
          onChange={(event) => change({ ...input, required: event.target.checked })}
        />{' '}
        Required
      </label>
      <Button
        variant="ghost"
        aria-label={`Remove input ${input.name || 'unnamed'}`}
        onClick={remove}
      >
        Remove
      </Button>
    </div>
  );
}

export function TeachDexView({
  state,
  failed,
  runSkill,
}: {
  state?: TeachSnapshot;
  failed: (message: string) => void;
  runSkill: (skill: TaughtSkillDraft, inputs: Record<string, string>) => Promise<void>;
}) {
  const session = state?.session;
  const [objective, setObjective] = useState('');
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TaughtSkillDraft>();
  const [trying, setTrying] = useState(false);
  useEffect(() => {
    if (session?.draft) setDraft(structuredClone(session.draft));
  }, [session?.draft]);
  async function command(action: Parameters<typeof window.dextana.teach>[0]) {
    setBusy(true);
    try {
      return await window.dextana.teach(action);
    } catch (error) {
      failed((error as Error).message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <section className="teach-page">
        <div className="teach-intro">
          <Badge tone="success">Local recording</Badge>
          <h1>Teach Dex by showing it once</h1>
          <p>
            Describe the outcome, then demonstrate the workflow. Recording starts only when you
            choose Start recording.
          </p>
          <label>
            What should this skill accomplish?
            <TextArea
              autoFocus
              rows={4}
              maxLength={8000}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Read the customer name from the browser and add it to the desktop CRM."
            />
          </label>
          <Button
            icon={<Icon name="play" />}
            variant="primary"
            busy={busy}
            disabled={!objective.trim()}
            onClick={() =>
              void command({ action: 'prepare', objective }).then(() =>
                command({ action: 'start' }),
              )
            }
          >
            Start recording
          </Button>
          <p className="teach-privacy">
            Password values are excluded. Captured evidence stays local until you finish, when only
            the evidence needed to draft the skill is sent to your configured server.
          </p>
        </div>
      </section>
    );
  if (session.status !== 'review' || !draft)
    return (
      <section className="teach-page">
        <div className="teach-heading">
          <div>
            <Badge tone={session.status === 'paused' ? 'warning' : 'success'}>
              {session.status === 'processing' ? 'Creating draft' : session.status}
            </Badge>
            <h1>{session.objective}</h1>
            <p>
              Demonstrate naturally across apps. Add context when the reason for an action is not
              obvious.
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void command({ action: 'discard' })}
          >
            Discard
          </Button>
          {session.status === 'ready' && (
            <Button variant="primary" busy={busy} onClick={() => void command({ action: 'start' })}>
              Start recording
            </Button>
          )}
        </div>
        {session.message && (
          <p role="status" className="teach-message">
            {session.message}
          </p>
        )}
        <Card className="teach-explanation">
          <label>
            Add explanation
            <TextArea
              rows={2}
              value={explanation}
              placeholder="Explain why this step matters or what should vary next time."
              onChange={(event) => setExplanation(event.target.value)}
            />
          </label>
          <Button
            disabled={!explanation.trim() || busy || session.status === 'processing'}
            onClick={() =>
              void command({ action: 'explain', explanation }).then(() => setExplanation(''))
            }
          >
            Attach explanation
          </Button>
        </Card>
        <div className="teach-evidence" aria-label="Captured steps">
          {!session.steps.length ? (
            <EmptyState
              title="Watching for meaningful changes"
              description="Switch to the first app and begin the demonstration."
            />
          ) : (
            session.steps.map((step, index) => (
              <Card className="teach-evidence-step" key={step.id}>
                {step.screenshot && (
                  <img src={step.screenshot} alt={`Supporting screenshot for step ${index + 1}`} />
                )}
                <div>
                  <span className="teach-step-number">{index + 1}</span>
                  <strong>{step.kind.replace('_', ' ')}</strong>
                  <p>
                    {step.explanation ??
                      [step.application, step.label ?? step.window].filter(Boolean).join(' · ')}
                  </p>
                  {step.redacted && <Badge tone="warning">Sensitive values redacted</Badge>}
                </div>
                <Button
                  variant="ghost"
                  disabled={busy || session.status === 'processing'}
                  onClick={() => void command({ action: 'remove_step', stepId: step.id })}
                >
                  Remove
                </Button>
              </Card>
            ))
          )}
        </div>
      </section>
    );
  return (
    <section className="teach-page teach-review">
      <div className="teach-heading">
        <div>
          <Badge tone="warning">Draft</Badge>
          <h1>Review the skill</h1>
          <p>
            Adjust the intent, inputs, and checks. Screenshots are supporting evidence, not replay
            coordinates.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void command({ action: 'discard' })}>
          Close
        </Button>
      </div>
      {session.message && (
        <p role="status" className="teach-message">
          {session.message}
        </p>
      )}
      <Card className="teach-review-card">
        <label>
          Skill name
          <TextInput
            value={draft.name}
            maxLength={64}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          Description
          <TextInput
            value={draft.description}
            maxLength={1024}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label>
          Objective
          <TextArea
            rows={3}
            value={draft.objective}
            onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
          />
        </label>
        <label>
          Required apps
          <TextInput
            value={draft.applications.join(', ')}
            onChange={(event) =>
              setDraft({
                ...draft,
                applications: event.target.value
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </Card>
      <div className="teach-section-heading">
        <h2>Variable inputs</h2>
        <Button
          icon={<Icon name="plus" />}
          variant="secondary"
          onClick={() =>
            setDraft({
              ...draft,
              inputs: [...draft.inputs, { id: id(), name: '', description: '', required: true }],
            })
          }
        >
          Add input
        </Button>
      </div>
      {draft.inputs.map((input, index) => (
        <InputEditor
          key={input.id}
          input={input}
          change={(value) =>
            setDraft({
              ...draft,
              inputs: draft.inputs.map((item) => (item.id === value.id ? value : item)),
            })
          }
          remove={() =>
            setDraft({
              ...draft,
              inputs: draft.inputs.filter((_, itemIndex) => itemIndex !== index),
            })
          }
        />
      ))}
      <div className="teach-section-heading">
        <h2>Steps and evidence</h2>
      </div>
      {draft.steps.map((step, index) => (
        <Card className="teach-review-step" key={step.id}>
          <div className="teach-review-step-copy">
            <span className="teach-step-number">{index + 1}</span>
            <TextArea
              aria-label={`Step ${index + 1}`}
              rows={3}
              value={step.intent}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  steps: draft.steps.map((item) =>
                    item.id === step.id ? { ...item, intent: event.target.value } : item,
                  ),
                })
              }
            />
            <Badge>
              {step.method === 'connector_or_browser'
                ? 'Connector or browser'
                : 'Computer interaction'}
            </Badge>
          </div>
          {step.screenshot && (
            <img src={step.screenshot} alt={`Evidence for skill step ${index + 1}`} />
          )}
          <Button
            variant="ghost"
            onClick={() =>
              setDraft({ ...draft, steps: draft.steps.filter((item) => item.id !== step.id) })
            }
          >
            Remove step
          </Button>
        </Card>
      ))}
      {!!draft.questions.length && (
        <>
          <div className="teach-section-heading">
            <h2>Questions to resolve</h2>
          </div>
          {draft.questions.map((question) => (
            <Card key={question.id}>
              <label>
                {question.prompt}
                <TextArea
                  rows={2}
                  value={question.answer ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      questions: draft.questions.map((item) =>
                        item.id === question.id ? { ...item, answer: event.target.value } : item,
                      ),
                    })
                  }
                />
              </label>
            </Card>
          ))}
        </>
      )}
      {!!draft.pendingCorrections?.length && (
        <Card>
          <h2>Proposed corrections</h2>
          {draft.pendingCorrections.map((correction) => (
            <p key={correction}>{correction}</p>
          ))}
        </Card>
      )}
      {trying ? (
        <SkillRunInputs
          skill={draft}
          cancel={() => setTrying(false)}
          run={(inputs) => runSkill(draft, inputs)}
        />
      ) : (
        <div className="teach-review-actions">
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void command({ action: 'save', draft })}
          >
            Save draft
          </Button>
          <Button
            icon={<Icon name="play" />}
            variant="primary"
            disabled={!draft.steps.length}
            onClick={() => setTrying(true)}
          >
            Try this skill
          </Button>
        </div>
      )}
    </section>
  );
}

export function TeachControlBar({
  state,
  open,
  failed,
}: {
  state?: TeachSnapshot;
  open: () => void;
  failed: (message: string) => void;
}) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'explain' | 'correct'>();
  const session = state?.session;
  const run = state?.run;
  const recording = session && ['recording', 'paused', 'processing'].includes(session.status);
  if (!recording && (!run || run.state === 'stopped')) return null;
  const command = (action: Parameters<typeof window.dextana.teach>[0]) =>
    window.dextana.teach(action).catch((error) => failed(error.message));
  return (
    <aside
      className="teach-control-bar"
      aria-label={recording ? 'Teaching controls' : 'Supervised skill controls'}
    >
      <div>
        <span
          className={
            recording && session.status === 'recording' ? 'teach-recording-dot' : 'teach-paused-dot'
          }
        />
        <strong>
          {recording
            ? session.status === 'processing'
              ? 'Creating skill draft…'
              : session.status === 'paused'
                ? 'Teaching paused'
                : 'Teaching Dex'
            : run?.state === 'paused'
              ? 'Skill paused'
              : 'Supervised skill running'}
        </strong>
        {recording && <span>{session.steps.length} captured steps</span>}
      </div>
      {mode && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            void command(
              mode === 'explain'
                ? { action: 'explain', explanation: text }
                : { action: 'correct', correction: text },
            ).then(() => {
              setText('');
              setMode(undefined);
              if (mode === 'correct') open();
            });
          }}
        >
          <TextInput
            autoFocus
            aria-label={mode === 'explain' ? 'Explanation' : 'Correction'}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              mode === 'explain' ? 'Why did you do that?' : 'What should Dex do differently?'
            }
          />
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
      )}
      <div className="teach-control-actions">
        {recording ? (
          <>
            <Button
              variant="secondary"
              disabled={session.status === 'processing'}
              onClick={() =>
                void command({ action: session.status === 'paused' ? 'resume' : 'pause' })
              }
            >
              {session.status === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="secondary"
              disabled={session.status === 'processing'}
              onClick={() => setMode('explain')}
            >
              Add explanation
            </Button>
            <Button
              variant="primary"
              disabled={session.status === 'processing' || !session.steps.length}
              onClick={() => {
                open();
                void command({ action: 'finish' });
              }}
            >
              Finish
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() =>
                void command({ action: run?.state === 'paused' ? 'resume_run' : 'pause_run' })
              }
            >
              {run?.state === 'paused' ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="secondary" onClick={() => setMode('correct')}>
              Add correction
            </Button>
            <Button variant="danger" onClick={() => void command({ action: 'stop_run' })}>
              Stop
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={open}>
          Open details
        </Button>
      </div>
    </aside>
  );
}
