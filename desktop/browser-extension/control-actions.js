importScripts(
  'control-page.js',
  'page-semantics.js',
  'control-screenshot.js',
  'screenshot-targeting.js',
);
const controlKeys = {
  Enter: ['Enter', 13],
  Escape: ['Escape', 27],
  Tab: ['Tab', 9],
  Backspace: ['Backspace', 8],
  Delete: ['Delete', 46],
  ArrowUp: ['ArrowUp', 38],
  ArrowDown: ['ArrowDown', 40],
  ArrowLeft: ['ArrowLeft', 37],
  ArrowRight: ['ArrowRight', 39],
  Home: ['Home', 36],
  End: ['End', 35],
  Space: [' ', 32],
};
// Recheck the desktop lease before every input dispatch, including an in-flight sequence.
async function controlActive(session) {
  if (session.stopped) throw new Error('Browser control stopped.');
  const active = await DextanaTransfer.request(
    session.target,
    `/active?requestId=${session.commandId}`,
  );
  if (active.requestId !== session.commandId) throw new Error('Browser action authority ended.');
}
async function controlEvaluate(session, expression) {
  await controlActive(session);
  await controlCurrent(session, session.commandURL);
  const tree = await controlCDP(session, 'Page.getFrameTree', {});
  const world = await controlCDP(session, 'Page.createIsolatedWorld', {
    frameId: tree.frameTree.frame.id,
    worldName: 'Dextana browser control',
    grantUniveralAccess: false,
  });
  // Only this authored function and JSON data can enter the isolated context.
  const evaluated = await controlCDP(session, 'Runtime.evaluate', {
    contextId: world.executionContextId,
    expression,
    returnByValue: true,
  });
  if (evaluated.exceptionDetails || !evaluated.result?.value)
    throw new Error('The page could not be inspected.');
  const result = evaluated.result.value;
  if (result.error) throw new Error(result.error);
  await controlCurrent(session, result.url);
  return result;
}
async function controlPage(session, args) {
  return controlEvaluate(
    session,
    `(${dextanaControlPage.toString()})(${JSON.stringify(args)}, ${DextanaPage.describeBrowserElements.toString()})`,
  );
}
async function controlCurrent(session, expectedURL) {
  if (session.stopped) throw new Error('Browser control stopped.');
  const tab = controlWebTab(await chrome.tabs.get(session.tabId));
  if (expectedURL && tab.url !== expectedURL)
    throw new Error('The page changed. Read it again before acting.');
  return tab;
}
async function controlCDP(session, method, params) {
  await controlActive(session);
  await controlCurrent(session, session.commandURL);
  return chrome.debugger.sendCommand({ tabId: session.tabId }, method, params);
}
async function controlPointer(session, action, point) {
  await controlCDP(session, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
  });
  if (action === 'hover') return;
  await controlCDP(session, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
  await controlCDP(session, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1,
  });
}
async function controlKey(session, args) {
  const key = controlKeys[args.key];
  if (!key)
    throw new Error('Use Enter, Escape, Tab, arrows, Home, End, Space, Backspace or Delete.');
  const fields = { key: key[0], windowsVirtualKeyCode: key[1], nativeVirtualKeyCode: key[1] };
  await controlCDP(session, 'Input.dispatchKeyEvent', { type: 'keyDown', ...fields });
  if (args.key === 'Enter' || args.key === 'Space')
    await controlCDP(session, 'Input.dispatchKeyEvent', {
      type: 'char',
      text: args.key === 'Enter' ? '\r' : ' ',
      ...fields,
    });
  await controlCDP(session, 'Input.dispatchKeyEvent', { type: 'keyUp', ...fields });
}
async function controlInput(session, args) {
  if (args.screenshot_id) return controlScreenshotInput(session, args);
  if (['click', 'hover'].includes(args.action) && !args.ref) {
    await controlPage(session, { action: 'invalidate' });
    return controlPointer(session, args.action, args);
  }
  return controlRefInput(session, args);
}
async function controlRefInput(session, args) {
  if (args.action === 'scroll') {
    const page = await controlPage(session, { action: 'invalidate' });
    if (args.x >= page.viewport.width || args.y >= page.viewport.height)
      throw new Error('Read the viewport before scrolling.');
    await controlCDP(session, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: args.x,
      y: args.y,
      deltaX: args.delta_x || 0,
      deltaY: -(args.delta_y || 0),
    });
    return;
  }
  if (args.action === 'press' && !args.ref) {
    await controlPage(session, { action: 'invalidate' });
    await controlKey(session, args);
    return;
  }
  const point = await controlPage(session, args);
  await controlCurrent(session, point.url);
  if (args.action === 'fill') await controlCDP(session, 'Input.insertText', { text: args.text });
  else if (args.action === 'press') {
    await controlPointer(session, 'click', point);
    await controlKey(session, args);
  } else await controlPointer(session, args.action, point);
}
async function controlExecute(session, command) {
  session.commandId = command.requestId;
  await controlActive(session);
  const observe = ['read', 'screenshot'].includes(command.action);
  const current = await controlCurrent(session, observe ? undefined : command.expectedURL);
  session.commandURL = current.url;
  const args = command.arguments;
  if (command.action === 'close_tab') return controlCloseTab(session);
  if (command.action === 'read')
    return controlPage(session, { ...args, action: args.ref ? 'inspect' : 'read' });
  if (command.action === 'screenshot') return controlScreenshot(session);
  if (!args.screenshot_id) session.tab.screenshots?.invalidate(String(session.tabId));
  if (command.action === 'open') {
    await controlPage(session, { action: 'invalidate' });
    await controlCurrent(session, command.expectedURL);
    await controlActive(session);
    await chrome.tabs.update(session.tabId, { url: args.url });
    return { url: args.url, message: 'Navigation requested. Read the page to verify it loaded.' };
  }
  if (!['click', 'fill', 'hover', 'press', 'scroll'].includes(command.action))
    throw new Error('Unsupported attached-browser action.');
  await controlInput(session, args);
  session.commandURL = (await controlCurrent(session)).url;
  return {
    ...(await controlPage(session, { action: 'read' })),
    message:
      'Input delivered. Inspect this fresh page result to verify the outcome before reporting success.',
  };
}
