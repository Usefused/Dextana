import { randomUUID } from 'node:crypto';
import type { Activity } from '../shared/types';
import type {
  TeachCommand,
  TeachEvidenceStep,
  TeachResult,
  TeachSnapshot,
  TaughtSkill,
  TaughtSkillDraft,
} from '../shared/teach-dex';
import type { CapturedStep, TeachingCapture } from './teach-capture';

type Request = (path: string, method?: string, data?: unknown) => Promise<any>;

function clean(value: unknown, label: string, maximum = 8000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new Error(`Add ${label}.`);
  return value.trim();
}

export function supervisedPrompt(skill: TaughtSkillDraft, inputs: Record<string, string>) {
  const required = skill.inputs.filter((item) => item.required);
  for (const item of required) if (!inputs[item.id]?.trim()) throw new Error(`Add ${item.name}.`);
  const values = skill.inputs
    .map((item) => `- ${item.name}: ${inputs[item.id]?.trim() || '(not provided)'}`)
    .join('\n');
  return `Run the personal skill "${skill.name}" for this supervised test.\n\nObjective: ${skill.objective}\n\nInputs:\n${values || '- None'}\n\nInspect the current screen before every step and locate controls afresh by accessibility label and surrounding UI. Do not rely on recorded coordinates, window positions, or row numbers. Prefer an available connector when it reliably accomplishes the same intent. Existing action permissions still apply. If the screen differs materially, more than one target matches, or completion cannot be verified, stop and ask me for guidance.`;
}

export class TeachDex {
  private state: TeachSnapshot;
  private capture?: TeachingCapture;
  private testedActivities = new Set<string>();
  constructor(
    initial: TeachSnapshot | undefined,
    private captureFactory: () => TeachingCapture,
    private request: Request,
    private changed: (snapshot: TeachSnapshot) => void,
  ) {
    this.state = structuredClone(initial ?? {});
    if (this.state.session && ['recording', 'processing'].includes(this.state.session.status)) {
      this.state.session.status = 'paused';
      this.state.session.message = 'Recording paused because Dext restarted.';
    }
    if (this.state.run) {
      this.state.run.inputNames ??= [];
      delete (this.state.run as TeachSnapshot['run'] & { inputs?: Record<string, string> }).inputs;
      if (this.state.run.state === 'running') this.state.run.state = 'paused';
    }
  }
  snapshot() {
    return structuredClone(this.state);
  }
  private publish() {
    this.changed(this.snapshot());
  }
  private session() {
    if (!this.state.session) throw new Error('Start a teaching session first.');
    return this.state.session;
  }
  private recording() {
    const session = this.session();
    if (!['recording', 'paused'].includes(session.status))
      throw new Error('This teaching session is not recording.');
    return session;
  }
  private record(step: CapturedStep) {
    const session = this.state.session;
    if (!session || session.status !== 'recording' || session.steps.length >= 200) return;
    const safe: TeachEvidenceStep = { ...step, id: randomUUID(), at: new Date().toISOString() };
    if (safe.redacted) safe.value = safe.value ? '[REDACTED]' : undefined;
    session.steps.push(safe);
    this.publish();
  }
  async list() {
    return this.request('/teaching/skills') as Promise<TaughtSkill[]>;
  }
  async command(command: TeachCommand): Promise<TeachResult> {
    switch (command.action) {
      case 'prepare': {
        const objective = clean(command.objective, 'the outcome you will demonstrate');
        await this.capture?.stop();
        this.capture = undefined;
        this.state.session = { id: randomUUID(), objective, status: 'ready', steps: [] };
        this.publish();
        return this.snapshot();
      }
      case 'start': {
        const session = this.session();
        if (session.status !== 'ready') throw new Error('This teaching session already started.');
        this.capture = this.captureFactory();
        session.status = 'recording';
        session.startedAt = new Date().toISOString();
        delete session.message;
        this.publish();
        try {
          await this.capture.start((step) => this.record(step));
        } catch (error) {
          session.status = 'ready';
          session.message = error instanceof Error ? error.message : String(error);
          this.capture = undefined;
          this.publish();
          throw error;
        }
        return this.snapshot();
      }
      case 'pause':
        this.recording().status = 'paused';
        this.capture?.pause();
        this.publish();
        return this.snapshot();
      case 'resume': {
        const session = this.recording();
        session.status = 'recording';
        if (this.capture) this.capture.resume();
        else {
          this.capture = this.captureFactory();
          try {
            await this.capture.start((step) => this.record(step));
          } catch (error) {
            session.status = 'paused';
            session.message = error instanceof Error ? error.message : String(error);
            this.capture = undefined;
            this.publish();
            throw error;
          }
        }
        this.publish();
        return this.snapshot();
      }
      case 'explain':
        {
          const previous = this.recording().steps.at(-1);
          this.record({
            kind: 'explanation',
            explanation: clean(command.explanation, 'an explanation', 4000),
            application: previous?.application,
            window: previous?.window,
            structure: previous?.structure,
          });
        }
        return this.snapshot();
      case 'remove_step': {
        const session = this.recording();
        session.steps = session.steps.filter((step) => step.id !== command.stepId);
        this.publish();
        return this.snapshot();
      }
      case 'finish': {
        const session = this.recording();
        if (!session.steps.length)
          throw new Error('Capture at least one step or explanation before finishing.');
        session.status = 'processing';
        this.publish();
        await this.capture?.stop();
        this.capture = undefined;
        try {
          session.draft = await this.request('/teaching/draft', 'POST', {
            objective: session.objective,
            evidence: session.steps,
          });
          session.status = 'review';
          this.publish();
          return this.snapshot();
        } catch (error) {
          session.status = 'paused';
          session.message = error instanceof Error ? error.message : String(error);
          this.publish();
          throw error;
        }
      }
      case 'discard':
        await this.capture?.stop();
        this.capture = undefined;
        delete this.state.session;
        this.publish();
        return this.snapshot();
      case 'review':
        this.state.session = {
          id: randomUUID(),
          objective: command.skill.objective,
          status: 'review',
          steps: [],
          draft: structuredClone(command.skill),
        };
        this.publish();
        return this.snapshot();
      case 'save': {
        const saved = (await this.request('/teaching/skills', 'POST', {
          ...command.draft,
          status: command.status ?? 'draft',
        })) as TaughtSkill;
        if (this.state.session) this.state.session.draft = structuredClone(saved);
        this.publish();
        return saved;
      }
      case 'archive':
        return this.request(
          `/teaching/skills/${encodeURIComponent(command.skillId)}/archive`,
          'POST',
          { archived: command.archived },
        );
      case 'run_prompt':
        return { prompt: supervisedPrompt(command.skill, command.inputs) };
      case 'bind_run':
        this.state.run = {
          skillId: command.skillId,
          activityId: command.activityId,
          state: 'running',
          inputNames: command.inputNames,
          corrections: [],
        };
        this.publish();
        return this.snapshot();
      case 'pause_run':
      case 'resume_run':
      case 'stop_run': {
        if (!this.state.run) throw new Error('No supervised skill is running.');
        this.state.run.state =
          command.action === 'pause_run'
            ? 'paused'
            : command.action === 'resume_run'
              ? 'running'
              : 'stopped';
        this.publish();
        return this.snapshot();
      }
      case 'correct': {
        const correction = clean(command.correction, 'a correction', 4000);
        if (!this.state.run) throw new Error('No supervised skill is running.');
        this.state.run.corrections.push(correction);
        const skills = await this.list();
        const skill = skills.find((item) => item.id === this.state.run?.skillId);
        if (!skill) throw new Error('The running skill is no longer available.');
        this.state.session = {
          id: randomUUID(),
          objective: skill.objective,
          status: 'review',
          steps: [],
          draft: {
            ...skill,
            pendingCorrections: [...(skill.pendingCorrections ?? []), correction],
          },
          message: 'Review the proposed correction before saving a new version.',
        };
        this.publish();
        return this.snapshot();
      }
      case 'record_test_event':
        if (!process.env.DEXTANA_TEACH_CAPTURE_FIXTURE)
          throw new Error('Test capture is unavailable.');
        this.record(command.event);
        return this.snapshot();
    }
  }
  async observeActivities(activities: Activity[]) {
    const run = this.state.run;
    if (!run || this.testedActivities.has(run.activityId)) return;
    const activity = activities.find((item) => item.id === run.activityId);
    if (!activity || ['starting', 'running'].includes(activity.status)) return;
    if (activity.status === 'cancelled' && run.state === 'paused') return;
    this.testedActivities.add(run.activityId);
    const completed = activity.status === 'completed' && !run.corrections.length;
    await this.request(`/teaching/skills/${encodeURIComponent(run.skillId)}/test`, 'POST', {
      activityId: run.activityId,
      inputNames: run.inputNames,
      outcome: completed ? 'completed' : 'needs_attention',
    }).catch(() => {});
    run.state = 'stopped';
    this.publish();
  }
  async dispose() {
    await this.capture?.stop();
  }
}
