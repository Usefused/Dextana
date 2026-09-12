import { Button, EmptyState, Modal, Switch, TextArea, TextInput, Icon, IconButton } from './ui';
import { useEffect, useState } from 'react';
import type { PersonalSkill, PersonalSkillInput } from '../shared/types';
import type { TaughtSkill } from '../shared/teach-dex';
import { SkillRunInputs } from './TeachDex';

const emptySkill: PersonalSkillInput = {
  name: '',
  description: '',
  instructions: '',
  enabled: true,
};
export function SkillsSettings({
  teach,
  runTaught,
  editTaught,
}: {
  teach: () => void;
  runTaught: (skill: TaughtSkill, inputs: Record<string, string>) => Promise<void>;
  editTaught: (skill: TaughtSkill) => void;
}) {
  const [skills, setSkills] = useState<PersonalSkill[]>();
  const [taught, setTaught] = useState<TaughtSkill[]>();
  const [running, setRunning] = useState<TaughtSkill>();
  const [editing, setEditing] = useState<PersonalSkillInput>();
  const [removing, setRemoving] = useState<PersonalSkill>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    const [personal, demonstrated] = await Promise.all([
      window.dextana.skills(),
      window.dextana.taughtSkills(),
    ]);
    const taughtIds = new Set(demonstrated.map((item) => item.id));
    setSkills(personal.filter((item) => !taughtIds.has(item.id)));
    setTaught(demonstrated);
  };
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function toggle(skill: PersonalSkill, enabled: boolean) {
    setSkills((items) =>
      items?.map((item) => (item.id === skill.id ? { ...item, enabled } : item)),
    );
    void run(async () => {
      try {
        await window.dextana.saveSkill({ ...skill, enabled });
      } catch (error) {
        setSkills((items) => items?.map((item) => (item.id === skill.id ? skill : item)));
        throw error;
      }
    });
  }
  return (
    <div className="personal-skills">
      <div className="settings-section-heading">
        <div>
          <h2>Your skills</h2>
          <p>Teach Dextana how you like work done. Enabled skills are available immediately.</p>
        </div>
        <div className="settings-actions">
          <Button
            icon={<Icon name="upload" />}
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const skill = await window.dextana.importSkill();
                if (skill) setEditing(skill);
              })
            }
          >
            Import SKILL.md
          </Button>
          <Button
            icon={<Icon name="plus" />}
            variant="primary"
            onClick={() => {
              setError('');
              setEditing({ ...emptySkill });
            }}
          >
            Add skill
          </Button>
        </div>
      </div>
      <section aria-label="Taught skills">
          <div className="settings-section-heading">
            <div>
              <h2>Taught workflows</h2>
              <p>Demonstrated skills retain versions and supervised test history.</p>
            </div>
          <Button icon={<Icon name="desktop" />} variant="secondary" onClick={teach}>Teach Dex</Button>

          </div>
          {taught?.map((skill) => (
            <div className="settings-row skill-row" key={skill.id}>
              <div className="settings-row-copy">
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
                <span className="settings-caption">
                  <strong className="skill-status">
                    {skill.status === 'tested_successfully'
                      ? 'Tested successfully'
                      : skill.status === 'needs_attention'
                        ? 'Needs attention'
                        : 'Draft'}
                  </strong>{' '}
                  · Version {skill.versionNumber}
                  {skill.tested
                    ? ` · Last tested ${new Date(skill.tested.at).toLocaleDateString()}${skill.tested.inputs.length ? ` with ${skill.tested.inputs.join(', ')}` : ''}`
                    : ''}
                  {skill.archived ? ' · Archived' : ''}
                </span>
              </div>
              <div className="settings-actions">
                <IconButton
                  label="Run"
                  icon="play"
                  variant="primary"
                  disabled={busy || skill.archived}
                  onClick={() => setRunning(skill)}
                />
                <IconButton
                  label="Edit"
                  icon="edit"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => editTaught(skill)}
                />
                <IconButton
                  label={skill.archived ? 'Restore' : 'Archive'}
                  icon={skill.archived ? 'refresh' : 'archive'}
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await window.dextana.teach({
                        action: 'archive',
                        skillId: skill.id,
                        archived: !skill.archived,
                      });
                    })
                  }
                />
              </div>
            </div>
          ))}
          {running && (
            <SkillRunInputs
              skill={running}
              cancel={() => setRunning(undefined)}
              run={(inputs) => runTaught(running, inputs)}
            />
          )}
        </section>
      {error && !editing && !removing && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      {!skills || !taught ? (
        <p className="settings-empty">Loading skills…</p>
      ) : !skills.length && !taught.length ? (
        <EmptyState
          title="A little guidance goes a long way"
          description="Add reusable instructions or teach Dex by demonstrating a workflow."
        />
      ) : (
        skills.map((skill) => (
          <div className="settings-row skill-row" key={skill.id}>
            <div className="settings-row-copy">
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <span className="settings-caption">
                {skill.enabled ? 'Enabled' : 'Disabled'} · Personal skill
              </span>
            </div>
            <div className="settings-actions">
              <Button
                icon={<Icon name="edit" />}
                variant="ghost"
                aria-label={`Edit ${skill.name}`}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setEditing(skill);
                }}
              >
                Edit
              </Button>
              <Button
                icon={<Icon name="trash" />}
                variant="ghost"
                aria-label={`Delete ${skill.name}`}
                disabled={busy}
                onClick={() => {
                  setError('');
                  setRemoving(skill);
                }}
              >
                Delete
              </Button>
              <Switch
                aria-label={`Enable ${skill.name}`}
                checked={skill.enabled}
                disabled={busy}
                onChange={(e) => toggle(skill, e.target.checked)}
              />
            </div>
          </div>
        ))
      )}
      <p className="settings-footnote">
        Dextana also includes built-in skills for browser work, documents, planning, and connected
        tools. Skills provide instructions; existing tool permissions still apply.
      </p>
      {editing && (
        <Modal
          title={editing.id ? 'Edit skill' : 'Add skill'}
          closeLabel="Close skill editor"
          busy={busy}
          close={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await window.dextana.saveSkill(editing);
                setEditing(undefined);
              });
            }}
          >
            <label>
              Name
              <TextInput
                autoFocus
                required
                maxLength={64}
                placeholder="weekly-review"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              Description
              <TextInput
                required
                maxLength={1024}
                placeholder="When should Dextana use this skill?"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </label>
            <label>
              Instructions
              <TextArea
                aria-label="Instructions"
                required
                rows={9}
                placeholder="Describe the steps, preferences, and expected result."
                value={editing.instructions}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              />
            </label>
            <p className="settings-caption">
              Text instructions only. Linked files and scripts are not imported.
            </p>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <div className="settings-dialog-actions">
              <Button
                icon={<Icon name="close" />}
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </Button>
              <Button icon={<Icon name="check" />} type="submit" variant="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save skill'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal title="Delete skill?" busy={busy} close={() => setRemoving(undefined)}>
          <p>
            Remove <strong>{removing.name}</strong> from your skills.
          </p>
          {error && (
            <p role="alert" className="settings-error">
              {error}
            </p>
          )}
          <div className="settings-dialog-actions">
            <Button
              icon={<Icon name="close" />}
              variant="secondary"
              disabled={busy}
              onClick={() => setRemoving(undefined)}
            >
              Cancel
            </Button>
            <Button
              icon={<Icon name="trash" />}
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await window.dextana.deleteSkill(removing.id);
                  setRemoving(undefined);
                })
              }
            >
              Delete skill
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
