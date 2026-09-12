import type { WebContents, WebFrameMain } from 'electron';

// Self-contained page code: returns only detection flags and frame positions.
// It never reads input values, cookies, or storage.
function inspectLoginFrame() {
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    let ancestor: Element | null = element;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        Number(style.opacity) === 0
      )
        return false;
      ancestor = ancestor.parentElement ?? (ancestor.getRootNode() as ShadowRoot).host ?? null;
    }
    return true;
  };
  const roots: (Document | ShadowRoot)[] = [document];
  const elements: Element[] = [];
  for (let i = 0; i < roots.length && i < 64; i++) {
    for (const element of Array.from(roots[i].querySelectorAll('*')).slice(0, 6000)) {
      elements.push(element);
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  const auth = /\b(?:sign[\s-]?in|log[\s-]?in|welcome back)\b/i;
  const text = (element: Element) => (element.textContent ?? '').slice(0, 3000);
  const controls = elements.filter(
    (element) =>
      element.matches('input:not([disabled]),[role="textbox"],textarea') && visible(element),
  );
  const headings = elements.filter(
    (element) => element.matches('h1,h2,[role="heading"]') && visible(element),
  );
  const actions = elements.filter(
    (element) => element.matches('button,[role="button"],input[type="submit"]') && visible(element),
  );
  const actionText = (element: Element) =>
    text(element) + ' ' + (element.getAttribute('aria-label') ?? '');
  const password = controls.some(
    (element) =>
      element.matches('input[type="password"]') &&
      !/(?:^|\s)new-password(?:\s|$)/i.test(element.getAttribute('autocomplete') ?? ''),
  );
  const identity = controls.some((element) => {
    if (
      element.matches(
        'input[type="hidden"],input[type="checkbox"],input[type="radio"],input[type="password"]',
      )
    )
      return false;
    const autocomplete = element.getAttribute('autocomplete') ?? '';
    if (/(?:^|\s)username(?:\s|$)/i.test(autocomplete)) return true;
    const label =
      ['type', 'name', 'id', 'placeholder', 'aria-label']
        .map((name) => element.getAttribute(name) ?? '')
        .join(' ') +
      ' ' +
      Array.from((element as HTMLInputElement).labels ?? [])
        .map(text)
        .join(' ');
    if (!/user.?name|e.?mail|phone|identifier|login/i.test(label)) return false;
    const form = element.closest('form,[role="form"],[role="dialog"]');
    return form
      ? auth.test(text(form)) ||
          actions.some((action) => form.contains(action) && auth.test(actionText(action)))
      : auth.test(document.title) ||
          headings.some((element) => auth.test(text(element))) ||
          actions.some((element) => auth.test(actionText(element)));
  });
  const sso =
    elements.some(
      (element) =>
        element.matches('[role="dialog"],dialog,form,[role="form"]') &&
        visible(element) &&
        auth.test(text(element)) &&
        actions.some(
          (action) =>
            element.contains(action) &&
            /continue|sign[\s-]?in|log[\s-]?in/i.test(actionText(action)),
        ),
    ) ||
    (headings.some((element) => auth.test(text(element))) &&
      actions.some((element) =>
        /continue with|sign[\s-]?in|log[\s-]?in/i.test(actionText(element)),
      ));
  // WindowProxy identity comparisons work across origins without reading their DOM.
  let index = -1;
  if (window !== parent)
    for (let i = 0; i < parent.length; i++)
      if (parent.frames[i] === window) {
        index = i;
        break;
      }
  const visibleFrames: number[] = [];
  for (const element of elements.filter(
    (element) => element.matches('iframe,frame') && visible(element),
  )) {
    for (let i = 0; i < window.length; i++)
      if (window.frames[i] === (element as HTMLIFrameElement).contentWindow) visibleFrames.push(i);
  }
  return { needed: password || identity || sso, index, visibleFrames };
}

const script = `(${inspectLoginFrame.toString()})()`;
type Detection = ReturnType<typeof inspectLoginFrame>;

export async function hasLoginForm(contents: WebContents) {
  const root = contents.mainFrame;
  const frames = root.framesInSubtree.slice(0, 40);
  const results = new Map<WebFrameMain, Detection>();
  await Promise.all(
    frames.map(async (frame) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          frame === root
            ? contents.executeJavaScriptInIsolatedWorld(998, [{ code: script }])
            : frame.executeJavaScript(script),
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), 800);
          }),
        ]);
        if (result && typeof result.needed === 'boolean' && Array.isArray(result.visibleFrames))
          results.set(frame, result);
      } catch {
        /* Navigating/detached frames will be checked again on the next tick. */
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  for (const [frame, result] of results) {
    if (!result.needed) continue;
    try {
      let current = frame;
      while (current !== root) {
        const parent = current.parent;
        if (!parent || !results.get(parent)?.visibleFrames.includes(results.get(current)!.index))
          break;
        current = parent;
      }
      if (current === root) return true;
    } catch {
      /* A frame can detach between inspection and selection. */
    }
  }
  // An unresponsive/navigating frame is not evidence that a dismissed form disappeared.
  return results.size === frames.length ? false : undefined;
}
