/**
 * Phase 7 — loader context integration tests
 * hotReloadContext: replay guard + live routing
 *
 * LC-1  null context returns error LoadResult
 * LC-2  ReplayContext refused with loud error citing CI-1
 * LC-3  unknown context type refused
 * LC-4  LiveContext routes patch to liveContext.kernel
 * LC-5  patched gates do not affect replay instances (structural proof)
 * LC-6  live context with null kernel returns error
 */

'use strict';

import { suite, test, assert, assertEqual, report } from '../runner.js';
import { createKernel }      from '../../src/kernel/index.js';
import { createLiveContext, CONTEXT_LIVE, CONTEXT_REPLAY } from '../../src/context/index.js';
import { hotReloadContext }  from '../../src/loader/index.js';

const SIMPLE_SRC = `
export const MODULE_VERSION = '5.0.0';
export function activate(kernel) {
  kernel.ingest('test:activated', { module: 'test' }, { source: 'test' });
}
`;

function hasEventOfType(kernel, type) {
  const ids = kernel._typeIndex?.get(type);
  return ids && ids.size > 0;
}

// ── Run async tests at module top-level, capture into sync results ────────────

const _results = {};

async function _runAsyncTests() {

  // LC-1
  try {
    const r = await hotReloadContext('test', SIMPLE_SRC, null);
    _results['LC-1'] = { ok: !r.ok && r.error instanceof Error && r.error.message.includes('liveContext is required'), error: null };
  } catch (e) { _results['LC-1'] = { ok: false, error: e.message }; }

  // LC-2
  try {
    const replayStub = Object.freeze({ type: CONTEXT_REPLAY, kernel: null });
    const r = await hotReloadContext('test', SIMPLE_SRC, replayStub);
    _results['LC-2'] = {
      ok: !r.ok && r.error.message.includes('ReplayContext') && r.error.message.includes('CI-1'),
      error: null,
    };
  } catch (e) { _results['LC-2'] = { ok: false, error: e.message }; }

  // LC-3
  try {
    const unknownCtx = Object.freeze({ type: 'unknown', kernel: null });
    const r = await hotReloadContext('test', SIMPLE_SRC, unknownCtx);
    _results['LC-3'] = { ok: !r.ok && r.error.message.includes("'unknown'"), error: null };
  } catch (e) { _results['LC-3'] = { ok: false, error: e.message }; }

  // LC-4
  try {
    const kernel  = createKernel({ ringCap: 64 });
    const liveCtx = createLiveContext(kernel);
    const r = await hotReloadContext('test-module', SIMPLE_SRC, liveCtx);
    _results['LC-4'] = {
      ok: r.ok && liveCtx.type === CONTEXT_LIVE && hasEventOfType(kernel, 'test:activated'),
      error: r.error?.message || null,
    };
  } catch (e) { _results['LC-4'] = { ok: false, error: e.message }; }

  // LC-5
  try {
    const liveKernel = createKernel({ ringCap: 64 });
    const liveCtx    = createLiveContext(liveKernel);
    liveKernel.ingest('baseline:event', { v: 1 }, { source: 'test' });
    const r = await hotReloadContext('test-module', SIMPLE_SRC, liveCtx);
    _results['LC-5'] = {
      ok: r.ok && hasEventOfType(liveKernel, 'test:activated') && liveCtx.kernel === liveKernel,
      error: r.error?.message || null,
    };
  } catch (e) { _results['LC-5'] = { ok: false, error: e.message }; }

  // LC-6
  try {
    const badLiveCtx = Object.freeze({ type: CONTEXT_LIVE, kernel: null });
    const r = await hotReloadContext('test', SIMPLE_SRC, badLiveCtx);
    _results['LC-6'] = { ok: !r.ok && r.error.message.includes('kernel'), error: null };
  } catch (e) { _results['LC-6'] = { ok: false, error: e.message }; }
}

await _runAsyncTests();

// ── Sync suite wrapping async results ─────────────────────────────────────────

suite('loader-context', () => {
  test('LC-1 null context returns error LoadResult', () => {
    assert(_results['LC-1']?.ok, _results['LC-1']?.error || 'LC-1 failed');
  });
  test('LC-2 ReplayContext refused with loud error citing CI-1', () => {
    assert(_results['LC-2']?.ok, _results['LC-2']?.error || 'LC-2 failed');
  });
  test('LC-3 unknown context type refused', () => {
    assert(_results['LC-3']?.ok, _results['LC-3']?.error || 'LC-3 failed');
  });
  test('LC-4 LiveContext routes patch to liveContext.kernel', () => {
    assert(_results['LC-4']?.ok, _results['LC-4']?.error || 'LC-4 failed');
  });
  test('LC-5 patched gates do not affect replay instances (structural)', () => {
    assert(_results['LC-5']?.ok, _results['LC-5']?.error || 'LC-5 failed');
  });
  test('LC-6 live context with null kernel returns error', () => {
    assert(_results['LC-6']?.ok, _results['LC-6']?.error || 'LC-6 failed');
  });
});

export const result = report('loader-context');
