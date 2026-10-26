// ============================================================
// API ROUTES — v2
// Original resonance endpoints + IDL + Feed
// ============================================================

import { Router, Request, Response } from 'express';
import { extract } from '../extraction/extractor';
import { TrajectoryStore } from '../trajectory/store';
import { computeOscillation } from '../trajectory/oscillation';
import { computeResonance } from '../resonance/scoring';
import { AuthorshipSignatureEngine } from '../ase/signature';
import { computeIntimacyVector } from '../idl/axes';
import { classifyIntimacyMode } from '../idl/modes';
import { computeRelationalDynamic } from '../idl/dynamics';
import { IDLStore } from '../idl/store';
import { FeedGenerator } from '../feed/generator';
import type { FeedWeightPreset } from '../feed/types';

interface RouterConfig {
  store: TrajectoryStore;
  ase: AuthorshipSignatureEngine;
  idlStore: IDLStore;
  feedGenerator: FeedGenerator;
  extractorConfig?: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    llmThreshold?: number;
  };
}

export function createRouter(config: RouterConfig): Router {
  const router = Router();
  const { store, ase, idlStore, feedGenerator, extractorConfig } = config;

  // ── POST /signal/ingest ──────────────────────────────────────
  router.post('/signal/ingest', async (req: Request, res: Response) => {
    const { userId, text, forceLLM } = req.body;
    if (!userId || typeof userId !== 'string')
      return res.status(400).json({ error: 'userId required' });
    if (!text || typeof text !== 'string' || text.trim().length < 5)
      return res.status(400).json({ error: 'text required (min 5 chars)' });

    try {
      const signal = await extract(userId, text.trim(), {
        ...extractorConfig,
        forceLLM: forceLLM === true
      });
      store.append(signal);
      const signature = ase.ingest(signal);

      const allSignals = store.getAll(userId);
      let idlVector = null;
      if (allSignals.length >= 3) {
        idlVector = computeIntimacyVector(userId, allSignals);
        idlStore.save(idlVector);
      }

      res.json({ signal, signature, idlVector, trusted: ase.isTrusted(userId), sampleCount: store.count(userId) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /trajectory/:userId ──────────────────────────────────
  router.get('/trajectory/:userId', (req: Request, res: Response) => {
    const { userId } = req.params;
    const window = req.query.window ? parseInt(req.query.window as string) : undefined;
    const signals = window ? store.getWindow(userId, window) : store.getAll(userId);
    if (!signals.length) return res.status(404).json({ error: 'No signals found' });
    res.json({ userId, signals, oscillation: computeOscillation(userId, signals, window), signature: ase.get(userId), count: store.count(userId) });
  });

  // ── GET /oscillation/:userId ─────────────────────────────────
  router.get('/oscillation/:userId', (req: Request, res: Response) => {
    const { userId } = req.params;
    const window = req.query.window ? parseInt(req.query.window as string) : undefined;
    const signals = window ? store.getWindow(userId, window) : store.getAll(userId);
    if (!signals.length) return res.status(404).json({ error: 'No signals found' });
    res.json(computeOscillation(userId, signals, window));
  });

  // ── POST /resonance/query ────────────────────────────────────
  router.post('/resonance/query', (req: Request, res: Response) => {
    const { userA, userB, window } = req.body;
    if (!userA || !userB) return res.status(400).json({ error: 'userA and userB required' });
    const win = window ?? 20;
    const sA = store.getWindow(userA, win);
    const sB = store.getWindow(userB, win);
    if (!sA.length) return res.status(404).json({ error: `No signals for ${userA}` });
    if (!sB.length) return res.status(404).json({ error: `No signals for ${userB}` });
    res.json(computeResonance({ userA, signalsA: sA, oscA: computeOscillation(userA, sA), userB, signalsB: sB, oscB: computeOscillation(userB, sB), windowSize: win }));
  });

  // ── POST /resonance/batch ────────────────────────────────────
  router.post('/resonance/batch', (req: Request, res: Response) => {
    const { userId, targets, window } = req.body;
    if (!userId || !Array.isArray(targets)) return res.status(400).json({ error: 'userId and targets[] required' });
    const win = window ?? 20;
    const sA = store.getWindow(userId, win);
    if (!sA.length) return res.status(404).json({ error: `No signals for ${userId}` });
    const oscA = computeOscillation(userId, sA);
    const results = targets
      .map((tid: string) => {
        const sB = store.getWindow(tid, win);
        if (!sB.length) return null;
        return computeResonance({ userA: userId, signalsA: sA, oscA, userB: tid, signalsB: sB, oscB: computeOscillation(tid, sB), windowSize: win });
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.total - a.total);
    res.json({ userId, results });
  });

  // ── GET /signature/:userId ───────────────────────────────────
  router.get('/signature/:userId', (req: Request, res: Response) => {
    const sig = ase.get(req.params.userId);
    if (!sig) return res.status(404).json({ error: 'No signature. Ingest signals first.' });
    res.json(sig);
  });

  // ── GET /signature/distance/:a/:b ────────────────────────────
  router.get('/signature/distance/:a/:b', (req: Request, res: Response) => {
    const dist = ase.distance(req.params.a, req.params.b);
    if (dist === null) return res.status(404).json({ error: 'Signature missing for one or both users' });
    res.json({ userA: req.params.a, userB: req.params.b, distance: dist, similarity: 1 - dist });
  });

  // ── GET /idl/:userId ─────────────────────────────────────────
  router.get('/idl/:userId', (req: Request, res: Response) => {
    const { userId } = req.params;
    const signals = store.getAll(userId);
    if (signals.length < 3) return res.status(400).json({ error: 'Need at least 3 signals to compute IDL' });
    const vector = computeIntimacyVector(userId, signals);
    idlStore.save(vector);
    res.json({ userId, vector, mode: classifyIntimacyMode(vector) });
  });

  // ── POST /idl/dynamic ────────────────────────────────────────
  router.post('/idl/dynamic', (req: Request, res: Response) => {
    const { userA, userB } = req.body;
    if (!userA || !userB) return res.status(400).json({ error: 'userA and userB required' });
    const sA = store.getAll(userA);
    const sB = store.getAll(userB);
    if (sA.length < 3) return res.status(400).json({ error: `Need 3+ signals for ${userA}` });
    if (sB.length < 3) return res.status(400).json({ error: `Need 3+ signals for ${userB}` });
    const vA = computeIntimacyVector(userA, sA);
    const vB = computeIntimacyVector(userB, sB);
    idlStore.save(vA); idlStore.save(vB);
    const modeA = classifyIntimacyMode(vA);
    const modeB = classifyIntimacyMode(vB);
    res.json({ dynamic: computeRelationalDynamic(vA, modeA, vB, modeB), modeA, modeB });
  });

  // ── POST /idl/batch ──────────────────────────────────────────
  router.post('/idl/batch', (req: Request, res: Response) => {
    const { userId, targets } = req.body;
    if (!userId || !Array.isArray(targets)) return res.status(400).json({ error: 'userId and targets[] required' });
    const sA = store.getAll(userId);
    if (sA.length < 3) return res.status(400).json({ error: 'Need 3+ signals for viewer' });
    const vA = computeIntimacyVector(userId, sA);
    const modeA = classifyIntimacyMode(vA);
    idlStore.save(vA);
    const results = targets
      .map((tid: string) => {
        const sB = store.getAll(tid);
        if (sB.length < 3) return null;
        const vB = computeIntimacyVector(tid, sB);
        const modeB = classifyIntimacyMode(vB);
        return { targetId: tid, dynamic: computeRelationalDynamic(vA, modeA, vB, modeB), modeB };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.dynamic.overallFit - a.dynamic.overallFit);
    res.json({ userId, modeA, results });
  });

  // ── POST /feed/generate ──────────────────────────────────────
  router.post('/feed/generate', async (req: Request, res: Response) => {
    const { userId, limit, excludeUserIds, freshWindowHours, weightPreset } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const result = await feedGenerator.generate({
        viewerId: userId,
        requestedAt: Date.now(),
        limit: limit ?? 20,
        excludeUserIds: excludeUserIds ?? [],
        freshWindowMs: freshWindowHours ? freshWindowHours * 3600000 : undefined,
        weightPreset: (weightPreset as FeedWeightPreset) ?? 'balanced'
      });
      res.json({
        viewerId: result.viewerId,
        generatedAt: result.generatedAt,
        totalCandidates: result.totalCandidates,
        returned: result.items.length,
        weights: result.weights,
        items: result.items.map(item => ({
          targetUserId: item.targetUserId,
          targetSignalTimestamp: item.targetSignalTimestamp,
          targetTextPreview: item.targetTextPreview,
          score: item.score,
          resonanceMatchType: item.resonance.matchType,
          resonanceTotal: item.resonance.total,
          resonanceInsights: item.resonance.insights,
          dynamicType: item.dynamic?.type ?? null,
          dynamicDescription: item.dynamic?.description ?? null,
          dynamicWarnings: item.dynamic?.warnings ?? [],
          modeA: item.modeA,
          modeB: item.modeB
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /feed/full ──────────────────────────────────────────
  router.post('/feed/full', async (req: Request, res: Response) => {
    const { userId, limit, excludeUserIds, freshWindowHours, weightPreset } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const result = await feedGenerator.generate({
        viewerId: userId,
        requestedAt: Date.now(),
        limit: limit ?? 20,
        excludeUserIds: excludeUserIds ?? [],
        freshWindowMs: freshWindowHours ? freshWindowHours * 3600000 : undefined,
        weightPreset: (weightPreset as FeedWeightPreset) ?? 'balanced'
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /health ──────────────────────────────────────────────
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', users: store.listUsers().length, idlProfiles: idlStore.listUsers().length, timestamp: Date.now() });
  });

  return router;
}
