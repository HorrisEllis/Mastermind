// ============================================================
// IDL STORE
// Persists IntimacyVectors per user. JSON files, swappable.
// ============================================================

import fs from 'fs';
import path from 'path';
import type { IntimacyVector } from './types';

export class IDLStore {
  private dataDir: string;
  private cache: Map<string, IntimacyVector> = new Map();

  constructor(dataDir = './data/idl') {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
  }

  private filePath(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safe}.json`);
  }

  save(vector: IntimacyVector): void {
    this.cache.set(vector.userId, vector);
    fs.writeFileSync(this.filePath(vector.userId), JSON.stringify(vector, null, 2));
  }

  get(userId: string): IntimacyVector | null {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    const fp = this.filePath(userId);
    if (!fs.existsSync(fp)) return null;
    try {
      const v = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      this.cache.set(userId, v);
      return v;
    } catch {
      return null;
    }
  }

  listUsers(): string[] {
    return fs.readdirSync(this.dataDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }
}
