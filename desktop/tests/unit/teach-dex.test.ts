import { describe, expect, test, vi } from 'vitest';
import {
  inferTeachStep,
  sanitizeTeachElement,
  type TeachingCapture,
} from '../../src/main/teach-capture';
import { supervisedPrompt, TeachDex } from '../../src/main/teach-dex';
import type { TaughtSkillDraft } from '../../src/shared/teach-dex';

const observation = (application: string, elements: Record<string, unknown>[]) => ({
  application,
  window: `${application} window`,
  elements: elements.map(sanitizeTeachElement),
  screenshot: 'data:image/png;base64,c2NyZWVu',
});

test('sensitive fields never retain their value or screenshot', () => {
  const password = sanitizeTeachElement({
    element_index: 4,
    role: 'AXSecureTextField',
    label: 'Account password',
    value: 'never-store-this',
    focused: true,
  });
  expect(password).toMatchObject({ value: '[REDACTED]', sensitive: true });
  expect(JSON.stringify(password)).not.toContain('never-store-this');
  const step = inferTeachStep(
    undefined,
    observation('Browser', [
      { element_index: 0, role: 'AXWindow' },
      {
        element_index: 4,
        parent_index: 0,
        role: 'AXSecureTextField',
        label: 'Account password',
        value: 'never-store-this',
        focused: true,
      },
    ]),
  );
  expect(step).toMatchObject({ kind: 'app_change', value: '[REDACTED]', redacted: true });
  expect(step?.screenshot).toBeUndefined();
  expect(JSON.stringify(step)).not.toContain('never-store-this');
});

test('semantic capture tolerates moved windows and changed row positions', () => {
  const previous = observation('CRM', [
    { element_index: 0, role: 'AXWindow' },
    { element_index: 7, parent_index: 0, role: 'AXCell', label: 'Customer Acme', focused: true },
  ]);
  const moved = observation('CRM', [
    { element_index: 0, role: 'AXWindow' },
    { element_index: 41, parent_index: 0, role: 'AXCell', label: 'Customer Acme', focused: true },
  ]);
  expect(inferTeachStep(previous, moved)).toMatchObject({ kind: 'click', label: 'Customer Acme' });
  const prompt = supervisedPrompt(draft(), { customer: 'Acme' });
  expect(prompt).toContain('locate controls afresh');
  expect(prompt).toContain('Do not rely on recorded coordinates, window positions, or row numbers');
  expect(prompt).toContain('screen differs materially');
  expect(prompt).toContain('stop and ask me for guidance');
});

function draft(): TaughtSkillDraft {
  return {
    name: 'copy-customer',
    description: 'Copy a customer',
    objective: 'Copy a customer from browser to CRM',
    applications: ['Browser', 'CRM'],
    inputs: [{ id: 'customer', name: 'Customer', description: 'Customer name', required: true }],
    steps: [
      {
        id: 'step',
        intent: 'Find the customer and add it to the CRM.',
        method: 'computer',
        evidenceIds: [],
      },
    ],
    decisions: ['Ask when ambiguous.'],
    completionChecks: ['Customer is visible in CRM.'],
    questions: [],
  };
}

describe('teaching session lifecycle', () => {
  test('records only after explicit start, supports review, corrections, and test status', async () => {
    let emit: ((step: any) => void) | undefined;
    const capture: TeachingCapture = {
      start: vi.fn(async (record) => {
        emit = record;
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(async () => {}),
    };
    const requests: { path: string; data?: any }[] = [];
    const request = vi.fn(async (path: string, _method?: string, data?: any) => {
      requests.push({ path, data });
      if (path.endsWith('/draft')) return draft();
      if (path === '/teaching/skills') {
        if (!data)
          return [
            {
              ...draft(),
              id: 'skill',
              version: 'v1',
              versionNumber: 1,
              updatedAt: new Date().toISOString(),
              status: 'draft',
              archived: false,
            },
          ];
        return {
          ...data,
          id: 'skill',
          version: 'v1',
          versionNumber: 1,
          updatedAt: new Date().toISOString(),
          status: 'draft',
          archived: false,
        };
      }
      return {};
    });
    const changed = vi.fn();
    const service = new TeachDex(undefined, () => capture, request, changed);
    await service.command({ action: 'prepare', objective: 'Copy customer into CRM' });
    expect(service.snapshot().session?.steps).toHaveLength(0);
    await service.command({ action: 'start' });
    emit?.({ kind: 'app_change', application: 'Browser', label: 'Customer Acme' });
    await service.command({ action: 'explain', explanation: 'Use the selected customer.' });
    await service.command({ action: 'pause' });
    expect(capture.pause).toHaveBeenCalledOnce();
    await service.command({ action: 'resume' });
    await service.command({ action: 'finish' });
    expect(requests.find((item) => item.path.endsWith('/draft'))?.data.evidence).toHaveLength(2);
    expect(service.snapshot().session?.status).toBe('review');
    await service.command({
      action: 'bind_run',
      skillId: 'skill',
      activityId: 'activity',
      inputNames: ['Customer'],
    });
    await service.command({ action: 'correct', correction: 'Choose the active customer row.' });
    expect(service.snapshot().session?.draft?.pendingCorrections).toEqual([
      'Choose the active customer row.',
    ]);
    await service.observeActivities([
      {
        id: 'activity',
        title: 'Run',
        model: 'm',
        ollamaUrl: '',
        status: 'completed',
        messages: [],
        events: [],
      },
    ]);
    expect(
      requests.some(
        (item) =>
          item.path.endsWith('/test') &&
          item.data.outcome === 'needs_attention' &&
          item.data.inputNames[0] === 'Customer',
      ),
    ).toBe(true);
  });
});
