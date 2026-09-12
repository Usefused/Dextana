import type { Activity } from '../../shared/types';
type Surface = 'user' | 'in-app';
type Arguments = Record<string, unknown>;

/** Recognize explicit owner corrections, never page text, tool output or generated prompts. */
export function ownerBrowserChoice(content: string): Surface | undefined {
  const text = content
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*>.*$/gm, '');
  if (/\b(?:not|never|don['’]?t|do not)\s+(?:use\s+)?(?:the\s+)?in[ -]?app\b/.test(text))
    return 'user';
  if (
    /\b(?:use|switch to|open)\s+(?:dext(?:ana)?['’]?s\s+|the\s+)?in[ -]?app(?:\s+browser)?\b/.test(
      text,
    )
  )
    return 'in-app';
  if (/\b(?:don['’]?t|do not|never)\s+use\s+(?:my|the external)\s+browser\b/.test(text))
    return 'in-app';
  if (
    /\b(?:my|own|external|actual|real)\s+(?:(?:external|chrome|edge|computer use)\s+)*browser\b/.test(
      text,
    )
  )
    return 'user';
  if (/\b(?:use|using)\s+(?:my\s+)?(?:chrome|edge|browser use)\b/.test(text)) return 'user';
}

export function requestedBrowser(activity: Activity): Surface | undefined {
  const choice = activity.browserChoice;
  for (const message of [...activity.messages].reverse()) {
    if (message.id === choice?.afterMessageId) return choice.surface;
    if (message.role !== 'user' || message.generated) continue;
    const surface = ownerBrowserChoice(message.content);
    if (surface) return surface;
  }
  return choice?.surface;
}

export function selectBrowser(activity: Activity, surface: Surface) {
  activity.browserChoice = { surface, afterMessageId: activity.messages.at(-1)?.id };
}

/** A wrong model call may request a connection, but cannot execute against another browser. */
export function prepareBrowserAction(
  activity: Activity,
  args: Arguments,
  prepare: (args: Arguments) => Arguments,
) {
  if (['connect_user', 'disconnect_user'].includes(String(args.action))) return prepare(args);
  if (requestedBrowser(activity) === 'user') {
    const inventory = prepare({ action: 'list_tabs' });
    if (!inventory._userConnection) return prepare({ action: 'connect_user' });
  }
  return prepare(args);
}

export function assertBrowserDestination(activity: Activity, args: Arguments) {
  if (requestedBrowser(activity) === 'user' && !args._userConnection)
    throw new Error(
      'The owner selected their external browser. Request its connection before continuing; this in-app action was not executed.',
    );
}
