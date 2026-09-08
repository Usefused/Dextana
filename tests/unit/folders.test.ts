import { expect, test, vi } from 'vitest';
import { Store } from '../../src/main/store';
import { Folders } from '../../src/main/folders';

function setup() {
  const store = new Store('/unused');
  store.state.activities.push({
    id: 'chat',
    title: 'Chat',
    model: 'test',
    ollamaUrl: '',
    status: 'completed',
    messages: [],
    events: [],
  });
  const save = vi.spyOn(store, 'save').mockResolvedValue();
  return { store, save, folders: new Folders(store, () => {}) };
}

test('folder removal ungroups chats without deleting or unarchiving them', async () => {
  const { store, folders } = setup();
  const id = await folders.create('Work');
  await folders.move('chat', id);
  store.state.activities[0].archived = true;
  await folders.update(id, { name: 'Projects', collapsed: true });
  expect(store.state.folders?.[0]).toMatchObject({ name: 'Projects', collapsed: true });
  await folders.remove(id);
  expect(store.state.folders).toEqual([]);
  expect(store.state.activities[0]).toMatchObject({ id: 'chat', archived: true });
  expect(store.state.activities[0].folderId).toBeUndefined();
});

test('folder changes reject duplicates and unknown destinations', async () => {
  const { folders } = setup();
  await folders.create('Work');
  await expect(folders.create(' work ')).rejects.toThrow('already exists');
  await expect(folders.create(' ')).rejects.toThrow('folder name');
  await expect(folders.move('chat', 'missing')).rejects.toThrow('Folder not found');
});

test('failed saves restore the folder and its memberships', async () => {
  const { store, save, folders } = setup();
  const id = await folders.create('Work');
  await folders.move('chat', id);
  save.mockRejectedValueOnce(new Error('Disk full'));
  await expect(folders.remove(id)).rejects.toThrow('Disk full');
  expect(store.state.folders?.[0].id).toBe(id);
  expect(store.state.activities[0].folderId).toBe(id);
});
