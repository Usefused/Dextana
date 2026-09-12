/* Runs only in this extension's isolated world; page scripts cannot mint element references. */
function dextanaControlPage(command, describeBrowserElements) {
  const key = '__dextanaUserBrowser';
  function visible(element) {
    return (
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      element.getClientRects().length > 0
    );
  }
  function label(element) {
    return describeBrowserElements([element], [''], false).elements[0].label;
  }
  function nodes(root) {
    const values = [...root.querySelectorAll('*')];
    const result = [];
    for (const element of values) {
      result.push(element);
      if (element.shadowRoot) result.push(...nodes(element.shadowRoot));
    }
    return result;
  }
  function read() {
    const all = nodes(document);
    const controls = all.filter(
      (element) =>
        element.matches('a,button,input,textarea,select,[role],[contenteditable="true"]') &&
        visible(element),
    );
    const snapshot = {
      id: crypto.randomUUID(),
      url: location.href,
      at: Date.now(),
      elements: [...new Set([...controls, ...all])],
    };
    const described = describeBrowserElements(
      snapshot.elements,
      snapshot.elements.map((_, index) => `${snapshot.id}:${index}`),
      false,
    );
    snapshot.labels = [];
    for (const element of described.elements)
      snapshot.labels[Number(element.ref.split(':').at(-1))] = element.label;
    globalThis[key] = snapshot;
    const offset = command.offset ?? 0,
      limit = command.limit ?? 100,
      textOffset = command.text_offset ?? 0;
    const text = document.body?.innerText || '';
    return {
      title: document.title,
      url: location.href,
      text: text.slice(textOffset, textOffset + 24000),
      text_offset: textOffset,
      text_total: text.length,
      next_text_offset: textOffset + 24000 < text.length ? textOffset + 24000 : null,
      elements: described.elements.slice(offset, offset + limit),
      forms: described.forms,
      offset,
      total_elements: snapshot.elements.length,
      next_offset: offset + limit < snapshot.elements.length ? offset + limit : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }
  function element() {
    const snapshot = globalThis[key];
    if (!snapshot || snapshot.url !== location.href || Date.now() - snapshot.at > 60000)
      throw new Error('Read this page again before acting.');
    const prefix = `${snapshot.id}:`;
    if (typeof command.ref !== 'string' || !command.ref.startsWith(prefix))
      throw new Error('This element reference is stale. Read the page again.');
    const index = Number(command.ref.slice(prefix.length));
    if (!Number.isSafeInteger(index)) throw new Error('Invalid element reference.');
    const target = snapshot.elements[index];
    if (!target?.isConnected) throw new Error('This element disappeared. Read the page again.');
    if (label(target) !== snapshot.labels[index])
      throw new Error('This control changed. Read the page again.');
    return target;
  }
  function point(target) {
    if (
      !visible(target) ||
      target.matches(':disabled') ||
      target.getAttribute('aria-disabled') === 'true'
    )
      throw new Error('The control is hidden or disabled.');
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = target.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, rect.x + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.y + rect.height / 2));
    let hit = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const next = hit.shadowRoot.elementFromPoint(x, y);
      if (!next || next === hit) break;
      hit = next;
    }
    if (hit !== target && !target.contains(hit))
      throw new Error('Another element covers this control.');
    return { x, y };
  }
  function selectText(target) {
    if (!target.matches('input,textarea,[contenteditable="true"]') || target.readOnly)
      throw new Error('Choose an editable text control.');
    const types = ['text', 'search', 'email', 'url', 'tel', 'password'];
    if (target.tagName === 'INPUT' && !types.includes(target.type))
      throw new Error('This input needs a different control.');
    target.focus();
    if (!target.isContentEditable) {
      target.select();
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function inspect() {
    const target = element();
    const text = target.innerText || target.textContent || '';
    const offset = command.text_offset ?? 0;
    return {
      url: location.href,
      title: document.title,
      text: text.slice(offset, offset + 24000),
      text_offset: offset,
      text_total: text.length,
      next_text_offset: offset + 24000 < text.length ? offset + 24000 : null,
    };
  }
  function prepare() {
    const target = element();
    const position = point(target);
    if (command.action === 'fill') selectText(target);
    globalThis[key] = undefined;
    return { ...position, url: location.href, title: document.title };
  }
  try {
    if (command.action === 'read') return read();
    if (command.action === 'inspect') return inspect();
    if (command.action === 'invalidate') {
      globalThis[key] = undefined;
      return { url: location.href, viewport: { width: innerWidth, height: innerHeight } };
    }
    return prepare();
  } catch (error) {
    return { error: error.message };
  }
}
