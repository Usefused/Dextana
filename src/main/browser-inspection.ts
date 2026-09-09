import type { WebContents } from 'electron';

type Frame = { id: string; key: string; session?: string; context?: number; parent?: string; url: string };
/** A tab-scoped DevTools connection. It never attaches to other tabs or the app UI. */
export class BrowserInspection {
  private sessions = new Set<string>();
  private frames = new Map<string, Frame>();
  private roots = new Map<string, string>();
  private ready?: Promise<void>;
  private serial = 0;
  private focusedKey = '';
  constructor(private contents: WebContents) {}
  private send(method: string, params: Record<string, unknown> = {}, session?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Browser inspection timed out during ${method}. Read the page again.`)), 15000);
      this.contents.debugger.sendCommand(method, params, session).then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }
  async connect() {
    if (!this.ready) this.ready = (async () => {
      if (!this.contents.debugger.isAttached()) this.contents.debugger.attach('1.3');
      this.contents.debugger.on('message', (_event, method, params) => {
        if (method === 'Target.attachedToTarget' && params.targetInfo.type === 'iframe') {
          this.sessions.add(params.sessionId);
          void this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, params.sessionId).catch(() => {});
        }
        if (method === 'Target.detachedFromTarget') this.sessions.delete(params.sessionId);
      });
      this.contents.debugger.on('detach', () => { this.ready = undefined; this.sessions.clear(); this.frames.clear(); });
      await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    })();
    await this.ready;
  }
  private async refresh() {
    await this.connect();
    const seen = new Set<string>();
    for (const session of [undefined, ...this.sessions]) {
      try {
        const { frameTree } = await this.send('Page.getFrameTree', {}, session);
        this.roots.set(session ?? '', frameTree.frame.id);
        const walk = (tree: any, parent?: string) => {
          const item = tree.frame;
          const old = this.frames.get(item.id);
          // The child target owns an out-of-process frame's execution context.
          if (!old?.session || session || !this.sessions.has(old.session)) {
            this.frames.set(item.id, { id: item.id, key: old?.key ?? (session === undefined && !parent ? '' : `f${++this.serial}`), session, parent: parent ?? item.parentId ?? old?.parent, url: item.url });
          }
          seen.add(item.id);
          for (const child of tree.childFrames ?? []) walk(child, item.id);
        };
        walk(frameTree);
      } catch (error) { if (!session) throw error; }
    }
    for (const id of this.frames.keys()) if (!seen.has(id)) this.frames.delete(id);
  }
  frame(ref?: string, preserveFocus = false): Frame {
    if (ref) this.focusedKey = ref.includes(':') ? ref.split(':')[0] : '';
    const key = !ref && preserveFocus ? this.focusedKey : ref?.includes(':') ? ref.split(':')[0] : '';
    const frame = [...this.frames.values()].find(frame => frame.key === key);
    if (!frame) throw new Error('This frame is stale. Read the page again.');
    return frame;
  }
  index(ref: unknown) {
    if (typeof ref !== 'string' || !/^(?:f\d+:)?[1-9]\d*$/.test(ref) || ref.length > 40)
      throw new Error('Use an element reference from the latest browser result.');
    const index = Number(ref.split(':').at(-1)) - 1;
    if (!Number.isSafeInteger(index)) throw new Error('Invalid element reference.');
    return index;
  }
  private async context(frame: Frame) {
    if (!frame.context) {
      const result = await this.send('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'dextana-inspection' }, frame.session);
      frame.context = result.executionContextId;
    }
    return frame.context;
  }
  async run(frame: Frame, code: string): Promise<any> {
    const result = await this.send('Runtime.evaluate', {
      contextId: await this.context(frame),
      expression: `(() => { try { return {ok:true,value:${code}}; } catch(error) { return {ok:false,error:String(error?.message || error).slice(0,500)}; } })()`,
      returnByValue: true, awaitPromise: true,
    }, frame.session);
    if (result.exceptionDetails || !result.result?.value) throw new Error('The page changed before it could be inspected. Read it again before repeating an action.');
    const value = result.result.value;
    if (!value.ok) throw new Error(value.error);
    return value.value;
  }
  /** Includes closed shadow roots using DevTools, without changing their page-facing mode. */
  private async shadowRoots() {
    const roots = new Map<string, number[]>();
    for (const session of [undefined, ...this.sessions]) {
      const { root } = await this.send('DOM.getDocument', { depth: -1, pierce: true }, session);
      const walk = (node: any, owner: string) => {
        if (node.nodeName === '#document' && node.frameId) owner = node.frameId;
        for (const shadow of node.shadowRoots ?? []) {
          if (shadow.shadowRootType !== 'user-agent') {
            const list = roots.get(owner) ?? []; list.push(shadow.backendNodeId); roots.set(owner, list);
          }
          walk(shadow, owner);
        }
        for (const child of node.children ?? []) walk(child, owner);
        if (node.contentDocument) walk(node.contentDocument, node.contentDocument.frameId ?? node.frameId ?? owner);
      };
      walk(root, this.roots.get(session ?? '')!);
    }
    return roots;
  }
  async snapshot(code: string, args: Record<string, unknown>) {
    await this.refresh();
    const roots = await this.shadowRoots();
    const elements: any[] = [], overlays: any[] = [], frames: any[] = [], texts: string[] = [];
    let focused: string | null = null;
    for (const frame of this.frames.values()) {
      try {
        const context = await this.context(frame);
        const objects = [];
        for (const backendNodeId of roots.get(frame.id) ?? []) {
          const { object } = await this.send('DOM.resolveNode', { backendNodeId, executionContextId: context }, frame.session);
          if (object.objectId) objects.push(object.objectId);
        }
        try {
          await this.send('Runtime.callFunctionOn', {
            executionContextId: context,
            functionDeclaration: 'function(...roots) { globalThis.__dextanaShadowRoots = roots; }',
            arguments: objects.map(objectId => ({ objectId })), returnByValue: true,
          }, frame.session);
        } finally {
          for (const objectId of objects) await this.send('Runtime.releaseObject', { objectId }, frame.session);
        }
        const page = await this.run(frame, code);
        const prefix = (ref: string) => frame.key ? `${frame.key}:${ref}` : ref;
        elements.push(...page.elements.map((element: any) => ({ ...element, ref: prefix(element.ref), frame: frame.key || 'main' })));
        overlays.push(...page.overlays.map((overlay: any) => ({ ...overlay, ref: prefix(overlay.ref) })));
        if (page.focused_ref) focused = prefix(page.focused_ref);
        frames.push({ id: frame.key || 'main', url: frame.url, title: page.title, viewport: page.viewport });
        texts.push(frame.key ? `\n[Frame ${frame.key}: ${frame.url}]\n${page.text}` : page.text);
      } catch (error) {
        frames.push({ id: frame.key || 'main', url: frame.url, error: (error as Error).message });
      }
    }
    const offset = this.integer(args.offset, 0), limit = this.integer(args.limit, 250, 1000);
    const textOffset = this.integer(args.text_offset, 0);
    const text = texts.join('\n');
    return {
      title: this.contents.getTitle(), url: this.contents.getURL(),
      text: text.slice(textOffset, textOffset + 24000), text_offset: textOffset,
      text_total: text.length, next_text_offset: textOffset + 24000 < text.length ? textOffset + 24000 : null,
      elements: elements.slice(offset, offset + limit), total_elements: elements.length,
      offset, next_offset: offset + limit < elements.length ? offset + limit : null,
      frames, overlays, focused_ref: focused,
    };
  }
  private integer(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max || (max === 1000 && value === 0)) throw new Error('Invalid browser read offset or limit.');
    return value;
  }
  async input(event: Electron.MouseInputEvent | Electron.MouseWheelInputEvent | Electron.KeyboardInputEvent) {
    const e = event as any;
    const zoom = this.contents.getZoomFactor();
    if (e.type.startsWith('mouse')) {
      const type = ({mouseMove:'mouseMoved',mouseDown:'mousePressed',mouseUp:'mouseReleased',mouseWheel:'mouseWheel'} as Record<string,string>)[e.type];
      await this.send('Input.dispatchMouseEvent', {type, x:e.x/zoom, y:e.y/zoom, button:e.button ?? 'none', clickCount:e.clickCount ?? 0, ...(e.type==='mouseWheel'?{deltaX:-(e.deltaX ?? 0),deltaY:-(e.deltaY ?? 0)}:{})});
      return;
    }
    const key = (e.keyCode === '\r' || e.keyCode === 'Return') ? 'Enter' : e.keyCode === ' ' ? 'Space' : e.keyCode;
    const codes: Record<string,number> = {Enter:13,Escape:27,Space:32,Tab:9,Backspace:8,Delete:46,Left:37,Up:38,Right:39,Down:40,Home:36,End:35,PageUp:33,PageDown:34};
    const names: Record<string,string> = {Left:'ArrowLeft',Right:'ArrowRight',Up:'ArrowUp',Down:'ArrowDown',Space:' '};
    await this.send('Input.dispatchKeyEvent', {type:e.type==='char'?'char':e.type==='keyDown'?'rawKeyDown':'keyUp', key:names[key]??key, code:key==='Space'?'Space':names[key]??key, windowsVirtualKeyCode:codes[key]??0, modifiers:e.modifiers?.includes('shift')?8:0, ...(e.type==='char'?{text:e.keyCode,unmodifiedText:e.keyCode}:{})});
  }
  async clickPoint(frame: Frame, local: {x:number;y:number}) {
    const point = await this.point(frame, local);
    if (frame.parent) {
      const hit = await this.send('DOM.getNodeForLocation', { x:Math.round(point.x), y:Math.round(point.y) });
      if (hit.frameId !== frame.id) throw new Error('This embedded frame is covered or clipped. Reveal it before interacting with its contents. '+JSON.stringify({point,local,frame:frame.id,hit:hit.frameId}));
    }
    return point;
  }
  async insertText(frame: Frame, text: string) {
    await this.send('Input.insertText', { text });
  }
  /** DevTools box models are in the owning target's viewport; compose OOP frame transforms. */
  async point(frame: Frame, point: {x: number; y: number}): Promise<{x:number;y:number}> {
    const root = this.roots.get(frame.session ?? '');
    if (frame.id === root && !frame.session) return point;
    const parent = frame.parent && this.frames.get(frame.parent);
    if (!parent) throw new Error('This frame moved. Read the page again.');
    const { backendNodeId } = await this.send('DOM.getFrameOwner', { frameId: frame.id }, parent.session);
    await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }, parent.session);
    const { model } = await this.send('DOM.getBoxModel', { backendNodeId }, parent.session);
    const viewport = await this.run(frame, '({width:innerWidth,height:innerHeight})');
    const q = model.content;
    const x = q[0] + (q[2]-q[0])*point.x/viewport.width + (q[6]-q[0])*point.y/viewport.height;
    const y = q[1] + (q[3]-q[1])*point.x/viewport.width + (q[7]-q[1])*point.y/viewport.height;
    const parentRoot = this.frames.get(this.roots.get(parent.session ?? '')!)!;
    return this.point(parentRoot, {x,y});
  }
}
