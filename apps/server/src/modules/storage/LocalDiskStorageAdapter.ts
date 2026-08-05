import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import type { StorageAdapter, StoredObjectMeta } from './StorageAdapter.js';

export class LocalDiskStorageAdapter implements StorageAdapter {
  private root: string;

  constructor(root = env.STORAGE_ROOT) {
    this.root = path.resolve(root);
  }

  private resolvePath(storageKey: string): string {
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(this.root)) {
      throw new Error('Invalid storage key');
    }
    return resolved;
  }

  async save(buffer: Buffer, _meta: StoredObjectMeta): Promise<{ storageKey: string; sizeBytes: number }> {
    const storageKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.bin`;
    const fullPath = this.resolvePath(storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { storageKey, sizeBytes: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await fs.rm(this.resolvePath(storageKey), { force: true });
  }
}

export const storageAdapter = new LocalDiskStorageAdapter();
