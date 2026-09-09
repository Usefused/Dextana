import { Button, EmptyState, Modal, Switch, TextArea, TextInput, Icon } from './ui';
import { useEffect, useState } from 'react';
import type { PersonalSkill, PersonalSkillInput } from '../shared/types';

const emptySkill: PersonalSkillInput = { name: '', description: '', instructions: '', enabled: true };
export function SkillsSettings() {
  const [skills, setSkills] = useState<PersonalSkill[]>();
  const [editing, setEditing] = useState<PersonalSkillInput>();
  const [removing, setRemoving] = useState<PersonalSkill>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => setSkills(await window.dextana.skills());
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function toggle(skill: PersonalSkill, enabled: boolean) {
    setSkills(items => items?.map(item => item.id === skill.id ? { ...item, enabled } : item));
    void run(async () => {
      try { await window.dextana.saveSkill({ ...skill, enabled }); }
      catch (error) { setSkills(items => items?.map(item => item.id === skill.id ? skill : item)); throw error; }
    });
  }
  return <div className="personal-skills">
    <div className="settings-section-heading"><div><h2>Your skills</h2><p>Teach Dextana how you like work done. Enabled skills are available immediately.</p></div>
      <div className="settings-actions"><Button icon={<Icon name="upload" />} variant="secondary" disabled={busy} onClick={() => void run(async () => { const skill = await window.dextana.importSkill(); if (skill) setEditing(skill); })}>Import SKILL.md</Button><Button icon={<Icon name="plus" />} variant="primary" onClick={() => { setError(''); setEditing({ ...emptySkill }); }}>Add skill</Button></div>
    </div>
    {error && !editing && !removing && <p role="alert" className="settings-error">{error}</p>}
    {!skills ? <p className="settings-empty">Loading skills…</p> : !skills.length ? <EmptyState title="A little guidance goes a long way" description="Add reusable instructions for writing, research, or your everyday workflows." /> : skills.map(skill => <div className="settings-row skill-row" key={skill.id}>
      <div className="settings-row-copy"><h3>{skill.name}</h3><p>{skill.description}</p><span className="settings-caption">{skill.enabled ? 'Enabled' : 'Disabled'} · Personal skill</span></div>
      <div className="settings-actions"><Button icon={<Icon name="edit" />} variant="ghost" aria-label={`Edit ${skill.name}`} disabled={busy} onClick={() => { setError(''); setEditing(skill); }}>Edit</Button><Button icon={<Icon name="trash" />} variant="ghost" aria-label={`Delete ${skill.name}`} disabled={busy} onClick={() => { setError(''); setRemoving(skill); }}>Delete</Button>
        <Switch aria-label={`Enable ${skill.name}`} checked={skill.enabled} disabled={busy} onChange={e => toggle(skill, e.target.checked)}/>
      </div>
    </div>)}
    <p className="settings-footnote">Dextana also includes built-in skills for browser work, documents, planning, and connected tools. Skills provide instructions; existing tool permissions still apply.</p>
    {editing && <Modal title={editing.id ? 'Edit skill' : 'Add skill'} closeLabel="Close skill editor" busy={busy} close={() => setEditing(undefined)}>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { await window.dextana.saveSkill(editing); setEditing(undefined); }); }}>

        <label>Name<TextInput autoFocus required maxLength={64} placeholder="weekly-review" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label>
        <label>Description<TextInput required maxLength={1024} placeholder="When should Dextana use this skill?" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })}/></label>
        <label>Instructions<TextArea aria-label="Instructions" required rows={9} placeholder="Describe the steps, preferences, and expected result." value={editing.instructions} onChange={e => setEditing({ ...editing, instructions: e.target.value })}/></label>
        <p className="settings-caption">Text instructions only. Linked files and scripts are not imported.</p>
        {error && <p role="alert" className="settings-error">{error}</p>}
        <div className="settings-dialog-actions"><Button icon={<Icon name="close" />} variant="secondary" type="button" disabled={busy} onClick={() => setEditing(undefined)}>Cancel</Button><Button icon={<Icon name="check" />} type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save skill'}</Button></div>
      </form>
    </Modal>}
    {removing && <Modal title="Delete skill?" busy={busy} close={() => setRemoving(undefined)}>
      <p>Remove <strong>{removing.name}</strong> from your skills.</p>
      {error && <p role="alert" className="settings-error">{error}</p>}
      <div className="settings-dialog-actions"><Button icon={<Icon name="close" />} variant="secondary" disabled={busy} onClick={() => setRemoving(undefined)}>Cancel</Button><Button icon={<Icon name="trash" />} variant="danger" disabled={busy} onClick={() => void run(async () => { await window.dextana.deleteSkill(removing.id); setRemoving(undefined); })}>Delete skill</Button></div>
    </Modal>}
  </div>;
}
