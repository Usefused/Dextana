import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

function pageResult(value: any): any {
  if (typeof value === 'string') {
    try {
      return pageResult(JSON.parse(value));
    } catch {
      return;
    }
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.forms)) return value;
  for (const child of Object.values(value)) {
    const result = pageResult(child);
    if (result) return result;
  }
}

test('form semantics identify fields and submission without extra reads', async ({ workspace }) => {
  test.setTimeout(90_000);
  const site = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Form controls</title>
      <form id="profile" aria-label="Contact profile">
        <label for="email">Email address</label><input id="email" type="email" required aria-describedby="hint"><small id="hint">Use your work email.</small>
        <label for="country">Country</label><select id="country"><option value="">Choose country</option><option value="GB">United Kingdom</option></select>
        <label><input type="checkbox" checked>Include receipt</label>
        <label>Account number<input readonly value="AC-42"></label>
        <fieldset disabled><button>Disabled action</button></fieldset>
        <input type="submit" value="Save profile">
      </form>
      <label for="name">Contact name</label><input id="name" form="profile" aria-required="true">
      <button aria-disabled="true">Unavailable action</button><div style="cursor:pointer" role="row">Open saved profile</div>
      <p id="result"></p>
      <script>document.querySelector('form').onsubmit=e=>{e.preventDefault();if(e.isTrusted)document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value+' in '+document.querySelector('#country').value;};</script>`);
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  let decisions = 0;
  const work = await workspace((body, response) => {
    const results = body.messages.filter((message: any) => message.role === 'tool');
    const page = results.length ? pageResult(results.at(-1).content) : undefined;
    const field = (label: string) => page?.elements.find((element: any) => element.label === label);
    if (results.length === 1) {
      const form = page.forms.find((form: any) => form.label === 'Contact profile');
      expect(field('Email address')).toMatchObject({
        role: 'textbox',
        required: true,
        invalid: true,
        description: 'Use your work email.',
        form_ref: form.ref,
        actions: ['click', 'fill'],
      });
      expect(field('Country')).toMatchObject({
        role: 'combobox',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'GB', label: 'United Kingdom' }),
        ]),
      });
      expect(field('Include receipt').checked).toBe(true);
      expect(field('Account number').actions).not.toContain('fill');
      expect(field('Disabled action').disabled).toBe(true);
      expect(field('Unavailable action').actions).toEqual([]);
      expect(field('Open saved profile').actions).toContain('click');
      expect(form.fields).toContain(field('Contact name').ref);
      expect(form.submit_refs).toEqual([field('Save profile').ref]);
    }
    const action = [
      { action: 'open', url },
      { action: 'fill', ref: field('Email address')?.ref, text: 'owner@example.com' },
      { action: 'fill', ref: field('Country')?.ref, text: 'GB' },
      { action: 'fill', ref: field('Contact name')?.ref, text: 'Alex' },
      {
        action: 'click',
        ref: page?.forms.find((form: any) => form.label === 'Contact profile')?.submit_refs[0],
      },
    ][results.length];
    if (action) {
      decisions++;
      reply(body, response, '', [{ function: { name: 'browser', arguments: action } }]);
    } else {
      expect(page.text).toContain('Saved Alex in GB');
      reply(body, response, 'Profile saved.');
    }
    return true;
  });
  try {
    await start(work.page, 'Complete the fixture contact form');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText('Profile saved.', {
      timeout: 60_000,
    });
    expect(decisions).toBe(5);
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
