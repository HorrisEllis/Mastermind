// ============================================================
// AUTHORSHIP SIGNATURE ENGINE (ASE)
// Builds a stable, evolving model of who someone is as an
// expressive system — not personality, but cognitive fingerprint.
// Tracks drift over time: when does someone's voice shift?
// ============================================================

import fs from 'fs';
import path from 'path';
import type { SignalVector, AuthorshipSignature } from '../types';

interface ASEConfig {
  dataDir?: string;
  emaAlpha?: number;      // EMA weight for new signals (default 0.15 — slow drift)
  driftThreshold?: number; // magnitude of shift before flagged as drift (default 0.12)
  minSamples?: number;     // minimum signals before signature is trusted (default 5)
}

// ─── EMA updater ────────────────────────────────────────────
// Exponential moving average — stable core resists single-event noise.

function ema(current: number, newValue: number, alpha: number): number {
  return current * (1 - alpha) + newValue * alpha;
}

function emaGroup(
  current: Record<string, number>,
  newValues: Record<string, number>,
  alpha: number
): Record<string, number> {
  const result: Record<string, number> = {};
  Object.keys(current).forEach(k => {
    result[k] = ema(current[k], newValues[k] ?? current[k], alpha);
  });
  return result;
}

// ─── Fingerprint analysis ─────────────────────────────────────

function computeFingerprint(
  core: AuthorshipSignature['core'],
  history: Record<string, number[]>
): AuthorshipSignature['fingerprint'] {
  // Find which axes vary most / least across history
  const varianceMap: Record<string, number> = {};

  if (Object.keys(history).length > 0) {
    Object.entries(history).forEach(([key, values]) => {
      if (values.length < 2) return;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      varianceMap[key] = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    });
  }

  const sorted = Object.entries(varianceMap).sort((a, b) => b[1] - a[1]);
  const highVariance = sorted.slice(0, 3).map(([k]) => k);
  const lowVariance = sorted.slice(-3).map(([k]) => k);

  // Dominant mode from core values
  const dominantMode = inferMode(core);
  const secondaryMode = inferSecondaryMode(core, dominantMode);

  return { highVarianceAxes: highVariance, lowVarianceAxes: lowVariance, dominantMode, secondaryMode };
}

function inferMode(core: AuthorshipSignature['core']): string {
  const c = core.cognition;
  const a = core.affect;
  const l = core.language;

  if (c.abstractionLevel > 0.7 && c.systemThinking > 0.6) return 'systems-architect';
  if (l.poeticness > 0.65 && l.symbolicUsage > 0.55) return 'symbolic-poet';
  if (c.recursionDepth > 0.65 && a.attachmentLoad < 0.4) return 'deep-internal-processor';
  if (a.volatility > 0.6 && a.somaticDensity > 0.5) return 'somatic-emotive';
  if (l.analyticalness > 0.65 && c.linearity > 0.6) return 'analytical-structured';
  if (a.attachmentLoad > 0.65 && l.narrativeStructure > 0.55) return 'relational-narrator';
  if (core.entropy > 0.65 && c.compression > 0.6) return 'high-entropy-synthesizer';
  if (a.urgency > 0.6 && core.intensity > 0.65) return 'high-intensity-driver';
  return 'adaptive-generalist';
}

function inferSecondaryMode(core: AuthorshipSignature['core'], primary: string): string {
  const modes = [
    'systems-architect', 'symbolic-poet', 'deep-internal-processor',
    'somatic-emotive', 'analytical-structured', 'relational-narrator',
    'high-entropy-synthesizer', 'high-intensity-driver', 'adaptive-generalist'
  ];

  // Run with slightly lower thresholds to find second candidate
  const c = core.cognition;
  const a = core.affect;
  const l = core.language;

  const candidates: string[] = [];
  if (c.abstractionLevel > 0.55 && c.systemThinking > 0.5 && primary !== 'systems-architect') candidates.push('systems-architect');
  if (l.poeticness > 0.5 && primary !== 'symbolic-poet') candidates.push('symbolic-poet');
  if (c.recursionDepth > 0.5 && primary !== 'deep-internal-processor') candidates.push('deep-internal-processor');
  if (a.somaticDensity > 0.4 && primary !== 'somatic-emotive') candidates.push('somatic-emotive');
  if (l.analyticalness > 0.5 && primary !== 'analytical-structured') candidates.push('analytical-structured');
  if (a.attachmentLoad > 0.5 && primary !== 'relational-narrator') candidates.push('relational-narrator');

  return candidates[0] || 'adaptive-generalist';
}

// ─── Drift detection ─────────────────────────────────────────

function computeDrift(
  oldCore: AuthorshipSignature['core'],
  newCore: AuthorshipSignature['core'],
  threshold: number
): AuthorshipSignature['drift'] {
  const groups = ['cognition', 'affect', 'language'] as const;
  const movingAxes: string[] = [];
  let totalDelta = 0;
  let count = 0;

  groups.forEach(group => {
    Object.entries(oldCore[group]).forEach(([key, oldVal]) => {
      const newVal = (newCore[group] as any)[key];
      const delta = Math.abs(newVal - oldVal);
      totalDelta += delta;
      count++;
      if (delta > 0.08) movingAxes.push(`${group}.${key}`);
    });
  });

  const entropyDelta = Math.abs(newCore.entropy - oldCore.entropy);
  const intensityDelta = Math.abs(newCore.intensity - oldCore.intensity);
  totalDelta += entropyDelta + intensityDelta;
  count += 2;

  const magnitude = totalDelta / count;
  const isShifting = magnitude > threshold;

  return {
    magnitude: Math.min(1, magnitude * 5),
    direction: movingAxes,
    lastShiftAt: isShifting ? Date.now() : null,
    isShifting
  };
}

// ─── Persistence ─────────────────────────────────────────────

export class AuthorshipSignatureEngine {
  private dataDir: string;
  private alpha: number;
  private driftThreshold: number;
  private minSamples: number;
  private historyBuffer: Map<string, Record<string, number[]>> = new Map();

  constructor(config: ASEConfig = {}) {
    this.dataDir = config.dataDir || './data/signatures';
    this.alpha = config.emaAlpha ?? 0.15;
    this.driftThreshold = config.driftThreshold ?? 0.12;
    this.minSamples = config.minSamples ?? 5;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private filePath(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `${safe}.json`);
  }

  private load(userId: string): AuthorshipSignature | null {
    const fp = this.filePath(userId);
    if (!fs.existsSync(fp)) return null;
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    } catch {
      return null;
    }
  }

  private save(sig: AuthorshipSignature): void {
    fs.writeFileSync(this.filePath(sig.userId), JSON.stringify(sig, null, 2), 'utf-8');
  }

  private initHistory(userId: string): Record<string, number[]> {
    if (!this.historyBuffer.has(userId)) {
      this.historyBuffer.set(userId, {});
    }
    return this.historyBuffer.get(userId)!;
  }

  private trackHistory(userId: string, signal: SignalVector): void {
    const hist = this.initHistory(userId);
    const groups = ['cognition', 'affect', 'language'] as const;
    groups.forEach(group => {
      Object.entries(signal[group]).forEach(([key, val]) => {
        const k = `${group}.${key}`;
        if (!hist[k]) hist[k] = [];
        hist[k].push(val as number);
        if (hist[k].length > 50) hist[k].shift(); // rolling 50-sample window
      });
    });
  }

  // ─── Public API ───────────────────────────────────────────

  ingest(signal: SignalVector): AuthorshipSignature {
    this.trackHistory(signal.userId, signal);
    const existing = this.load(signal.userId);
    const history = this.initHistory(signal.userId);

    if (!existing) {
      // First signal — bootstrap signature
      const sig: AuthorshipSignature = {
        userId: signal.userId,
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sampleSize: 1,
        core: {
          cognition: { ...signal.cognition } as any,
          affect: { ...signal.affect } as any,
          language: { ...signal.language } as any,
          entropy: signal.entropy,
          intensity: signal.intensity
        },
        fingerprint: computeFingerprint(
          {
            cognition: { ...signal.cognition } as any,
            affect: { ...signal.affect } as any,
            language: { ...signal.language } as any,
            entropy: signal.entropy,
            intensity: signal.intensity
          },
          history
        ),
        drift: {
          magnitude: 0,
          direction: [],
          lastShiftAt: null,
          isShifting: false
        }
      };
      this.save(sig);
      return sig;
    }

    // Update with EMA
    const oldCore = existing.core;
    const newCore: AuthorshipSignature['core'] = {
      cognition: emaGroup(existing.core.cognition, signal.cognition as any, this.alpha),
      affect: emaGroup(existing.core.affect, signal.affect as any, this.alpha),
      language: emaGroup(existing.core.language, signal.language as any, this.alpha),
      entropy: ema(existing.core.entropy, signal.entropy, this.alpha),
      intensity: ema(existing.core.intensity, signal.intensity, this.alpha)
    };

    const drift = computeDrift(oldCore, newCore, this.driftThreshold);
    const fingerprint = computeFingerprint(newCore, history);

    const updated: AuthorshipSignature = {
      ...existing,
      version: existing.version + 1,
      updatedAt: Date.now(),
      sampleSize: existing.sampleSize + 1,
      core: newCore,
      fingerprint,
      drift: {
        ...drift,
        lastShiftAt: drift.isShifting ? Date.now() : existing.drift.lastShiftAt
      }
    };

    this.save(updated);
    return updated;
  }

  get(userId: string): AuthorshipSignature | null {
    return this.load(userId);
  }

  isTrusted(userId: string): boolean {
    const sig = this.load(userId);
    return sig !== null && sig.sampleSize >= this.minSamples;
  }

  // Signature distance — used for ASE-level resonance comparison
  distance(userA: string, userB: string): number | null {
    const a = this.load(userA);
    const b = this.load(userB);
    if (!a || !b) return null;

    const groups = ['cognition', 'affect', 'language'] as const;
    let total = 0;
    let count = 0;

    groups.forEach(group => {
      Object.keys(a.core[group]).forEach(key => {
        const av = (a.core[group] as any)[key];
        const bv = (b.core[group] as any)[key];
        total += Math.abs(av - bv);
        count++;
      });
    });

    total += Math.abs(a.core.entropy - b.core.entropy);
    total += Math.abs(a.core.intensity - b.core.intensity);
    count += 2;

    return total / count; // 0 = identical, 1 = maximally different
  }
}
