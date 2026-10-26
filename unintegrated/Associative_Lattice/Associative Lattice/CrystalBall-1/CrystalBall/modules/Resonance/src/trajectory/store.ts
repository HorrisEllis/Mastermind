// ============================================================
// TRAJECTORY STORE
// Stores per-user signal history as time-series.
// Default persistence: JSON files (swap for DB as needed).
// ============================================================

import fs from 'fs';
import path from 'path';
import type { SignalVector } from '../types';

interface StoreConfig {
  dataDir?: string;
  maxSignalsPerUser?: number;  // rolling window cap (default 500)
}

export class TrajectoryStore {
  private dataDir: string;
  private maxSignals: number;
  private cache: Map<string, SignalVector[]> = new Map();

  constructor(config: StoreConfig = {}) {
    this.dataDir = config.dataDir || './data/trajectories';
    this.maxSignals = config.maxSignalsPerUser || 500;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  // ─── I/O ─────────────────────────────────────────────────

  private filePath(userId: string): string {
    // Sanitize userId for filesystem
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safe}.json`);
  }

  private load(userId: string): SignalVector[] {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    const fp = this.filePath(userId);
    if (!fs.existsSync(fp)) return [];
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const signals: SignalVector[] = JSON.parse(raw);
      this.cache.set(userId, signals);
      return signals;
    } catch {
      return [];
    }
  }

  private save(userId: string, signals: SignalVector[]): void {
    this.cache.set(userId, signals);
    const fp = this.filePath(userId);
    fs.writeFileSync(fp, JSON.stringify(signals, null, 2), 'utf-8');
  }

  // ─── Public API ──────────────────────────────────────────

  append(signal: SignalVector): void {
    const signals = this.load(signal.userId);
    signals.push(signal);

    // Rolling window — drop oldest if over cap
    const trimmed = signals.length > this.maxSignals
      ? signals.slice(signals.length - this.maxSignals)
      : signals;

    this.save(signal.userId, trimmed);
  }

  getAll(userId: string): SignalVector[] {
    return this.load(userId);
  }

  getWindow(userId: string, n: number): SignalVector[] {
    const all = this.load(userId);
    return all.slice(Math.max(0, all.length - n));
  }

  getRange(userId: string, from: number, to: number): SignalVector[] {
    return this.load(userId).filter(s => s.timestamp >= from && s.timestamp <= to);
  }

  count(userId: string): number {
    return this.load(userId).length;
  }

  listUsers(): string[] {
    return fs.readdirSync(this.dataDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  clearUser(userId: string): void {
    this.cache.delete(userId);
    const fp = this.filePath(userId);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
