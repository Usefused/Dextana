export type TeachCaptureKind = 'click' | 'scroll' | 'keyboard' | 'app_change' | 'explanation';

export interface TeachEvidenceStep {
  id: string;
  kind: TeachCaptureKind;
  at: string;
  application?: string;
  window?: string;
  role?: string;
  label?: string;
  value?: string;
  structure?: string[];
  explanation?: string;
  screenshot?: string;
  redacted?: boolean;
}

export interface TaughtSkillInput {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

export interface TaughtSkillStep {
  id: string;
  intent: string;
  application?: string;
  element?: { role?: string; label?: string; structure?: string[] };
  method: 'connector_or_browser' | 'computer';
  evidenceIds: string[];
  screenshot?: string;
}

export interface TaughtSkillQuestion {
  id: string;
  prompt: string;
  answer?: string;
}

export interface TaughtSkillDraft {
  id?: string;
  name: string;
  description: string;
  objective: string;
  applications: string[];
  inputs: TaughtSkillInput[];
  steps: TaughtSkillStep[];
  decisions: string[];
  completionChecks: string[];
  questions: TaughtSkillQuestion[];
  pendingCorrections?: string[];
}

export type TaughtSkillStatus = 'draft' | 'tested_successfully' | 'needs_attention';

export interface TaughtSkill extends TaughtSkillDraft {
  id: string;
  version: string;
  versionNumber: number;
  updatedAt: string;
  status: TaughtSkillStatus;
  archived: boolean;
  tested?: {
    at: string;
    activityId: string;
    inputs: string[];
    outcome: 'completed' | 'needs_attention';
  };
}

export interface TeachSession {
  id: string;
  objective: string;
  status: 'ready' | 'recording' | 'paused' | 'processing' | 'review';
  startedAt?: string;
  steps: TeachEvidenceStep[];
  draft?: TaughtSkillDraft;
  message?: string;
}

export interface TeachRun {
  skillId: string;
  activityId: string;
  state: 'running' | 'paused' | 'stopped';
  inputNames: string[];
  corrections: string[];
}

export interface TeachSnapshot {
  session?: TeachSession;
  run?: TeachRun;
}

export type TeachCommand =
  | { action: 'prepare'; objective: string }
  | { action: 'start' }
  | { action: 'pause' | 'resume' | 'finish' | 'discard' }
  | { action: 'explain'; explanation: string }
  | { action: 'remove_step'; stepId: string }
  | { action: 'review'; skill: TaughtSkill }
  | { action: 'save'; draft: TaughtSkillDraft; status?: TaughtSkillStatus }
  | { action: 'archive'; skillId: string; archived: boolean }
  | { action: 'run_prompt'; skill: TaughtSkillDraft; inputs: Record<string, string> }
  | {
      action: 'bind_run';
      skillId: string;
      activityId: string;
      inputNames: string[];
    }
  | { action: 'pause_run' | 'resume_run' | 'stop_run' }
  | { action: 'correct'; correction: string }
  | { action: 'record_test_event'; event: Omit<TeachEvidenceStep, 'id' | 'at'> };

export type TeachResult = TeachSnapshot | TaughtSkill | TaughtSkill[] | { prompt: string };
