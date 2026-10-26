import { SlopeEngine, StabilityEngine, OscillationEngine, ConfidencePropagator } from '../src/engines.js';

describe('SlopeEngine', () => {
  test('flat for single value', () => { const e = new SlopeEngine(); expect(e.feed(0.5).direction).toBe('flat'); });
  test('detects rising', () => {
    const e = new SlopeEngine(8);
    [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8].forEach(v => e.feed(v));
    const r = e.feed(0.9);
    expect(r.direction).toBe('rising'); expect(r.r2).toBeGreaterThan(0.95);
  });
  test('detects falling', () => {
    const e = new SlopeEngine(8);
    [0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2].forEach(v => e.feed(v));
    expect(e.feed(0.1).direction).toBe('falling');
  });
  test('detects regime change (rising→falling)', () => {
    const e = new SlopeEngine(8);
    [0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8].forEach(v => e.feed(v));
    e.feed(0.9); // establishes prevDir=rising
    // Feed falling values; collect all regimeChange flags
    const results = [0.75,0.65,0.55,0.45,0.35,0.25,0.15,0.05].map(v => e.feed(v));
    // At least one sample must have triggered regimeChange
    expect(results.some(r => r.regimeChange === true)).toBe(true);
  });
  test('final direction is falling after full falling window', () => {
    const e = new SlopeEngine(8);
    [0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2].forEach(v => e.feed(v));
    expect(e.feed(0.1).direction).toBe('falling');
  });
  test('reset clears state', () => {
    const e = new SlopeEngine(8);
    [0.1,0.2,0.3,0.4,0.5].forEach(v => e.feed(v));
    e.reset(); expect(e.feed(0.5).direction).toBe('flat');
  });
});

describe('StabilityEngine', () => {
  test('collapses on constant signal', () => {
    const e = new StabilityEngine(20);
    for (let i = 0; i < 25; i++) e.feed(0.5);
    expect(e.feed(0.5).regime).toBe('collapsed');
  });
  test('volatile on alternating signal', () => {
    const e = new StabilityEngine(20);
    for (let i = 0; i < 21; i++) e.feed(i%2===0?0.9:0.1);
    expect(e.feed(0.9).regime).toBe('volatile');
  });
  test('stabilityScore=1 for constant', () => {
    const e = new StabilityEngine(20);
    for (let i = 0; i < 25; i++) e.feed(0.5);
    expect(e.feed(0.5).stabilityScore).toBe(1);
  });
  test('entropy=0 for constant', () => {
    const e = new StabilityEngine(20);
    for (let i = 0; i < 20; i++) e.feed(0.5);
    expect(e.feed(0.5).entropy).toBe(0);
  });
});

describe('OscillationEngine', () => {
  test('not oscillating on constant', () => {
    const e = new OscillationEngine(60);
    for (let i = 0; i < 60; i++) e.feed(0.5);
    expect(e.feed(0.5).oscillating).toBe(false);
  });
  test('detects sinusoidal oscillation', () => {
    const e = new OscillationEngine(60);
    for (let i = 0; i < 60; i++) e.feed(0.5 + 0.3*Math.sin(i*Math.PI/5));
    const r = e.feed(0.5);
    expect(r.oscillating).toBe(true);
    expect(r.regularity).toBeGreaterThan(0.5);
  });
});

describe('ConfidencePropagator', () => {
  test('returns 0 for unknown', () => { expect(new ConfidencePropagator().propagated('x')).toBe(0); });
  test('amplifies with corroborators', () => {
    const c = new ConfidencePropagator(5000);
    c.observe('cpu',0.5); c.observe('lat',0.9); c.observe('err',0.8);
    expect(c.propagated('cpu')).toBeGreaterThan(0.5);
  });
  test('joint returns 0 if type missing', () => {
    const c = new ConfidencePropagator(5000);
    c.observe('cpu',0.8);
    expect(c.joint(['cpu','latency'])).toBe(0);
  });
  test('joint returns weakest link', () => {
    const c = new ConfidencePropagator(5000);
    c.observe('cpu',0.9); c.observe('latency',0.4);
    expect(c.joint(['cpu','latency'])).toBeCloseTo(0.4,1);
  });
});
