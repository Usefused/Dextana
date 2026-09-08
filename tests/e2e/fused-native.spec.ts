import { mcpServer } from './mcp-fixture';
import { expect } from '@playwright/test';
import { writeFile, readFile, mkdir, chmod, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { test, start, reply } from './fixture';

test('Fused CLI browser onboarding isolates login and gates native MCP token creation and real tool use', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const endpoint = await mcpServer();
  const engine = new URL(endpoint.url).origin;
  let serverId = '';
  const work = await workspace((body, res) => {
    const last = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(last + 1).filter((message: any) => message.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'mcp',
            arguments: {
              action: 'call',
              server_id: serverId,
              tool_name: body.messages[last].content.includes('Read tasks') ? 'read_tasks' : 'connect',
              arguments_json: '{}',
            },
          },
        },
      ]);
    else reply(body, res, 'Connection result: ' + results.at(-1).content);
    return true;
  });
  const bin = join(work.directory, 'bin');
  await mkdir(bin);
  const shim = join(bin, 'fused-cli');
  await writeFile(
    shim,
    `#!${process.execPath}
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2), root=process.env.XDG_CONFIG_HOME, dir=path.join(root,'fused'), config=path.join(dir,'config.json');
fs.appendFileSync(path.join(process.cwd(),'calls.jsonl'),JSON.stringify({args,root,ambient:!!process.env.FUSED_API_KEY})+'\\n');
if(args[0]==='login'){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(config,JSON.stringify({'api-key':'synthetic-browser-login'}));}
else if(args[0]==='whoami'){console.log(JSON.stringify({subject_id:'owner'}));}
else if(args[0]==='mcp' && args[1]==='list'){console.log(JSON.stringify({items:[{status:'active',app_family_id:'family',app_id:'version',name:'Mail',version:'1.0',transport_urls:{versioned_streamable_http:${JSON.stringify(endpoint.url)}}}],total:1}));}
else if(args[0]==='mcp' && args[1]==='token' && args[2]==='generate'){console.log(JSON.stringify({id:'token-id',app_family_id:args[3],name:args[4],allow:['mail.send'],expires_at:new Date(Date.now()+86400000).toISOString(),token:'synthetic-mcp-token'}));}
else if(args[0]==='mcp' && args[1]==='token' && args[2]==='revoke'){}
else if(args[0]==='logout'){fs.unlinkSync(config);}
else process.exit(2);
`,
  );
  await chmod(shim, 0o700);
  const previousPath = await work.app().evaluate(({}, bin) => {
    const previous = process.env.PATH;
    process.env.PATH = bin + ':' + previous;
    return previous;
  }, bin);
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'MCP connections' })
      .click();
    await work.page
      .getByRole('group', { name: 'MCP setup options' })
      .getByRole('button', { name: 'Fused' })
      .click();
    const panel = work.page.getByRole('region', { name: 'Fused workspace', exact: true });
    await panel.getByLabel('Fused Engine URL').fill(engine);
    await panel.getByRole('button', { name: 'Sign in with Fused' }).click();
    await expect(panel.getByRole('status')).toContainText('Connected to');
    const server = panel.getByRole('region', { name: 'Fused server Mail 1.0' });
    await server.getByLabel('Automatically create agent tokens').check();
    await server.getByLabel('Allowed operation IDs').fill('mail.send');
    await server.getByRole('button', { name: 'Add MCP server' }).click();
    await expect(server.getByRole('status')).toContainText('selection saved');
    serverId = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).mcpConnections!.find((c) => c.fusedNative)!.id,
    );
    const root = join(work.directory, 'fused-workspace');
    expect(
      (await readFile(join(root, 'login.enc'))).includes(Buffer.from('synthetic-browser-login')),
    ).toBe(false);
    expect(await readFile(join(work.directory, 'state.json'), 'utf8')).not.toContain(
      'synthetic-browser-login',
    );
    expect((await readdir(root)).some((file) => file.startsWith('.cli-'))).toBe(false);
    await start(work.page, 'Use the Fused Mail server');
    let gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('Create agent token', { timeout: 60_000 });
    await expect(gate).toContainText('mail.send');
    await expect(gate).toContainText('24h');
    await gate.getByRole('button', { name: 'Deny action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await start(work.page, 'Request the Fused Mail server again');
    gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('Create agent token', { timeout: 30_000 });
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'MCP tools discovered',
      { timeout: 30_000 },
    );
    const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls.every((call) => call.root.startsWith(root) && !call.ambient)).toBe(true);
    expect(calls.filter((call) => call.args.includes('generate'))).toHaveLength(1);
    expect(calls.find((call) => call.args.includes('generate')).args).toEqual(expect.arrayContaining(['--json', '--allow', 'mail.send', '--expires-in', '24h']));
    expect(await readFile(join(work.directory, 'state.json'), 'utf8')).not.toContain('synthetic-mcp-token');
    expect(JSON.stringify(work.calls)).not.toContain('synthetic-mcp-token');
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'MCP connections' })
      .click();
    const connection = work.page.getByRole('region', { name: 'MCP connection Mail · 1.0', exact: true });
    await expect(connection.getByLabel('Policy for read_tasks')).toHaveValue('disabled');
    await connection.getByLabel('Policy for read_tasks').selectOption('ask');
    await connection.getByRole('button', { name: 'Save tool permissions' }).click();
    await expect(connection.getByRole('status')).toContainText('Tool permissions saved');
    await work.page.getByRole('button', { name: 'Back to chats' }).click();
    await work.page.getByLabel('Describe your work').fill('Read tasks using Fused');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate).toContainText('read_tasks', { timeout: 30_000 });
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Connection result', { timeout: 30_000 });
    expect(endpoint.calls).toContain('read_tasks');
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'MCP connections' }).click();
    await work.page.getByRole('button', { name: 'Add another connection', exact: true }).click();
    await work.page
      .getByRole('group', { name: 'MCP setup options' })
      .getByRole('button', { name: 'Fused' })
      .click();
    await work.page.getByRole('button', { name: 'Disconnect workspace', exact: true }).click();
    await expect(
      work.page.getByText('Connected to ' + engine, { exact: true }),
    ).toHaveCount(0);
    await expect(readFile(join(root, 'login.enc'))).rejects.toThrow();
    expect(await readFile(join(root, 'calls.jsonl'), 'utf8')).toContain('revoke');
  } finally {
    await work.app().evaluate(({}, value) => {
      process.env.PATH = value;
    }, previousPath);
    if (serverId) await work.page.evaluate(id => window.dextana.removeMCP(id), serverId);
    await work.close();
    await endpoint.close();
  }
});
