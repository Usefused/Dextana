import { randomUUID } from 'node:crypto';
import { Store } from './store';

export class Folders {
  private pending = Promise.resolve();
  constructor(
    private store: Store,
    private publish: () => void,
  ) {}
  private change<T>(mutate: () => T): Promise<T> {
    const operation = this.pending.then(async () => {
      const folders = structuredClone(this.store.state.folders ?? []);
      const memberships = this.store.state.activities.map(
        (activity) => [activity.id, activity.folderId] as const,
      );
      try {
        const result = mutate();
        await this.store.save();
        this.publish();
        return result;
      } catch (error) {
        this.store.state.folders = folders;
        for (const [id, folderId] of memberships) {
          const activity = this.store.state.activities.find((item) => item.id === id);
          if (activity) activity.folderId = folderId;
        }
        this.publish();
        throw error;
      }
    });
    this.pending = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  private name(value: unknown, id?: string) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
      throw new Error('Enter a folder name up to 80 characters.');
    const name = value.trim();
    if (
      this.store.state.folders?.some(
        (folder) => folder.id !== id && folder.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error('A folder with this name already exists.');
    return name;
  }
  create(name: string) {
    return this.change(() => {
      const folder = { id: randomUUID(), name: this.name(name), collapsed: false };
      (this.store.state.folders ??= []).push(folder);
      return folder.id;
    });
  }
  update(id: string, changes: { name?: string; collapsed?: boolean }) {
    return this.change(() => {
      const folder = this.store.state.folders?.find((item) => item.id === id);
      if (!folder || !changes || typeof changes !== 'object') throw new Error('Folder not found.');
      if (changes.name !== undefined) folder.name = this.name(changes.name, id);
      if (changes.collapsed !== undefined) {
        if (typeof changes.collapsed !== 'boolean') throw new Error('Invalid folder state.');
        folder.collapsed = changes.collapsed;
      }
    });
  }
  remove(id: string) {
    return this.change(() => {
      if (!this.store.state.folders?.some((folder) => folder.id === id))
        throw new Error('Folder not found.');
      this.store.state.folders = this.store.state.folders.filter((folder) => folder.id !== id);
      for (const activity of this.store.state.activities)
        if (activity.folderId === id) delete activity.folderId;
    });
  }
  move(activityId: string, folderId: string | null) {
    return this.change(() => {
      const activity = this.store.state.activities.find((item) => item.id === activityId);
      if (!activity) throw new Error('Activity not found.');
      if (folderId !== null && !this.store.state.folders?.some((folder) => folder.id === folderId))
        throw new Error('Folder not found.');
      activity.folderId = folderId ?? undefined;
      const folder = this.store.state.folders?.find((item) => item.id === folderId);
      if (folder) folder.collapsed = false;
    });
  }
}
