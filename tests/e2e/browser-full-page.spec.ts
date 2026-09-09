import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

function result(value: any): any {
  if (typeof value === 'string') { try { return result(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if ('total_elements' in value || 'attributes' in value || 'screenshot_size' in value) return value;
  for (const child of Object.values(value)) { const found = result(child); if (found) return found; }
}

test('all page targets are reachable across pagination, closed shadow DOM, cross-origin frames and canvas', async ({ workspace }) => {
  test.setTimeout(150_000);
  let port = 0;
  const site = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url === '/frame') return res.end(`<span id="frame-target">Frame text target</span><form><input aria-label="Frame input"></form><p id="frame-result"></p><script>
      document.querySelector('span').onclick=e=>{if(e.isTrusted) document.querySelector('p').textContent='Frame clicked';};
      document.querySelector('form').onsubmit=e=>{e.preventDefault(); if(e.isTrusted) document.querySelector('p').textContent+=' Frame submitted '+document.querySelector('input').value;};
    </script>`);
    res.end(`<!doctype html><title>Whole page</title>
      <span id="plain">Ordinary text target</span><p hidden id="hidden-content">Hidden content remains inspectable.</p>
      <div id="closed"></div><canvas aria-label="Paint surface" width="100" height="50"></canvas>
      <svg width="100" height="50"><rect aria-label="Vector target" width="100" height="50" fill="green"/></svg>
      <p id="status"></p><iframe title="Embedded page" style="width:350px;height:150px" src="http://localhost:${port}/frame"></iframe>
      <div>${Array.from({length:1100},(_,i)=>`<span>Entry ${i}</span>`).join('')}</div><p>${'Long content. '.repeat(2300)}END OF LONG PAGE</p>
      <script>
        const status=document.querySelector('#status');
        document.querySelector('#plain').onclick=e=>{if(e.isTrusted) status.textContent+='Plain clicked. ';};
        const shadow=document.querySelector('#closed').attachShadow({mode:'closed'});
        shadow.innerHTML='<span>Closed shadow target</span><form><input aria-label="Shadow input"></form><p></p>';
        shadow.querySelector('span').onclick=e=>{if(e.isTrusted) shadow.querySelector('p').textContent='Shadow clicked';};
        shadow.querySelector('form').onsubmit=e=>{e.preventDefault();if(e.isTrusted) shadow.querySelector('p').textContent+=' Shadow submitted '+shadow.querySelector('input').value;};
        document.querySelector('canvas').onclick=e=>{if(e.isTrusted) status.textContent+='Canvas clicked. ';};
        document.querySelector('rect').ondblclick=e=>{if(e.isTrusted) status.textContent+='Vector double-clicked. ';};
      </script>`);
  });
  await new Promise<void>(resolve => site.listen(0, resolve));
  port = (site.address() as {port:number}).port;
  const url=`http://127.0.0.1:${port}/`;
  const collected = new Map<string, any>();
  const outputs: any[] = [];
  let scanning = true, step = 0, pages = 0;
  const work = await workspace((body,res) => {
    const results=body.messages.filter((m:any)=>m.role==='tool');
    if (!results.length) { reply(body,res,'',[{function:{name:'browser',arguments:{action:'open',url}}}]); return true; }
    const page=result(results.at(-1).content);
    console.log('Full-page step', {results:results.length,pages,step,total:page?.total_elements,next:page?.next_offset,frames:page?.frames,error:page ? undefined : String(results.at(-1).content).slice(0,200)});
    outputs.push(page ?? results.at(-1).content);
    if (page?.elements) {
      for (const e of page.elements) collected.set(`${e.frame}:${e.tag}:${e.label}`,e);
      if (scanning) pages++;
    }
    let action: any;
    const target=(label:string,tag?:string)=>[...collected.values()].find(e=>e.label===label && (!tag || e.tag===tag));
    const ref=(label:string,tag?:string)=>target(label,tag)?.ref ?? '999999';
    if (scanning && page?.next_offset !== null && page?.next_offset !== undefined) action={action:'read',offset:page.next_offset};
    else {
      scanning=false;
      const canvas=target('Paint surface')?.bounds;
      action=[
        {action:'read',ref:ref('Hidden content remains inspectable.','p')},
        {action:'click',ref:ref('Ordinary text target','span')},
        {action:'click',ref:ref('Closed shadow target','span')},
        {action:'fill',ref:ref('Shadow input'),text:'shadow value'},
        {action:'press',key:'Enter'},
        {action:'click',ref:ref('Frame text target','span')},
        {action:'fill',ref:ref('Frame input'),text:'frame value'},
        {action:'press',key:'Enter'},
        {action:'click',ref:ref('Vector target'),click_count:2},
        {action:'click',x:(canvas?.x??0)+25,y:(canvas?.y??0)+25},
        {action:'read',text_offset:24000},
        {action:'screenshot'},
      ][step++];
    }
    if (action) reply(body,res,'',[{function:{name:'browser',arguments:action}}]);
    else reply(body,res,'Whole-page interaction complete.');
    return true;
  });
  try {
    await start(work.page,'Interact with the complete test page');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Whole-page interaction complete.',{timeout:120_000});
    const native=work.app().windows().find(p=>p.url()===url)!;
    console.log('Frame geometry',await native.locator('iframe').boundingBox(), await native.frames().find(f=>f.url().includes('/frame'))!.locator('#frame-target').boundingBox(),await native.frames().find(f=>f.url().includes('/frame'))!.locator('input').inputValue());
    expect(pages).toBeGreaterThan(4);
    expect([...collected.values()].some(e=>e.label==='Entry 1099' && e.tag==='span')).toBe(true);
    expect(outputs.some(p=>p?.attributes?.id==='hidden-content' && p.text.includes('Hidden content remains inspectable'))).toBe(true);
    const texts=outputs.map(p=>p?.text??'').join('\n');
    for (const value of ['Plain clicked.','Shadow clicked','Shadow submitted shadow value','Frame clicked','Frame submitted frame value','Vector double-clicked.','Canvas clicked.','END OF LONG PAGE']) expect(texts.includes(value), value).toBe(true);
    expect(outputs.some(p=>p?.screenshot_size?.width>0)).toBe(true);
    expect(outputs.flatMap(p=>p?.frames??[]).some(f=>f.url.includes('localhost') && !f.error)).toBe(true);
  } finally { console.log('Full-page diagnostics', {calls:work.calls.length,pages,step,outputs:outputs.length}); await work.close(); site.closeAllConnections(); await new Promise<void>(resolve=>site.close(()=>resolve())); }
});
