import type { Reasoning, ReasoningSupport } from './types';

const efforts: Reasoning[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/** Use provider metadata, never a model-name guess, for compatible endpoints. */
export function compatibleReasoning(model: Record<string, any> | undefined, openRouter: boolean): ReasoningSupport {
  if (!model) return 'unknown';
  const info = model.reasoning;
  const parameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
  if (info && typeof info === 'object') {
    const accepted = info.supported_efforts;
    const levels = accepted === null ? efforts : Array.isArray(accepted) ? efforts.filter(value => accepted.includes(value)) : [];
    const off = info.mandatory !== true && (info.mandatory === false || accepted === null || (Array.isArray(accepted) && accepted.includes('none')));
    return { kind: 'effort', choices: ['default', ...(off ? ['off' as const] : []), ...levels, ...(!levels.length && info.mandatory !== true ? ['on' as const] : [])] };
  }
  if (parameters.includes('reasoning') || parameters.includes('reasoning_effort'))
    return { kind: 'effort', choices: ['default', 'low', 'medium', 'high'] };
  return openRouter || Array.isArray(model.supported_parameters) ? 'none' : 'unknown';
}
