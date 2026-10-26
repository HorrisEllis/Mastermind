import { TelemetryRuntime, TelemetryBus } from '../src/index.js';

describe('TelemetryRuntime', () => {
  test('throws without serviceId', () => {
    expect(() => new TelemetryRuntime({})).toThrow('serviceId required');
  });
  test('constructs cleanly', () => {
    const rt = new TelemetryRuntime({ serviceId: 'test-svc' });
    const d = rt.diagnostic();
    expect(d.serviceId).toBe('test-svc');
    expect(d.latent).toBeDefined();
  });
  test('observe+tick returns a ServiceFrame', () => {
    const rt = new TelemetryRuntime({ serviceId: 'test-svc' });
    rt.observe('cpu_util', 0.5); rt.observe('p99', 120); rt.observe('error_rate', 0.001);
    const frame = rt.tick();
    expect(frame.serviceId).toBe('test-svc');
    expect(frame.frame).toBe(1);
    expect(typeof frame.health).toBe('number');
    expect(frame.health).toBeGreaterThanOrEqual(0);
    expect(frame.health).toBeLessThanOrEqual(1);
  });
  test('emits frame events', done => {
    const rt = new TelemetryRuntime({ serviceId: 'test-svc2' });
    rt.on('frame', f => { expect(f.frame).toBe(1); done(); });
    rt.observe('cpu_util', 0.3); rt.tick();
  });
  test('health score degrades under sustained high load', () => {
    const rt = new TelemetryRuntime({ serviceId: 'load-test' });
    rt.observe('cpu_util', 0.1); rt.tick();
    const baseline = rt.tick().health;
    for (let i = 0; i < 25; i++) {
      rt.observe('cpu_util', 0.95); rt.observe('p99', 4500);
      rt.observe('error_rate', 0.08); rt.observe('retry_rate', 0.15); rt.tick();
    }
    const degraded = rt.tick().health;
    // Degraded health should not exceed baseline by more than 0.1
    expect(degraded).toBeLessThan(baseline + 0.1);
  });
  test('topology field present in frame', () => {
    const rt = new TelemetryRuntime({ serviceId: 'topo-test' });
    rt.observe('cpu_util', 0.5); rt.tick();
    const frame = rt.tick();
    expect(frame.topology).toBeDefined();
    expect('dominant' in frame.topology).toBe(true);
  });
  test('drift field present in frame', () => {
    const rt = new TelemetryRuntime({ serviceId: 'drift-test' });
    rt.observe('cpu_util', 0.5); rt.tick();
    const frame = rt.tick();
    expect(frame.drift).toBeDefined();
    expect(Array.isArray(frame.drift.signals)).toBe(true);
  });
  test('incident fires when topology score exceeds threshold', done => {
    const rt = new TelemetryRuntime({ serviceId: 'incident-test', incidentThreshold: 0.3 });
    const unsub = rt.on('incident', ev => {
      unsub(); // unsubscribe immediately — only want first fire
      expect(ev.serviceId).toBe('incident-test');
      expect(ev.composite).toBeDefined();
      done();
    });
    for (let i = 0; i < 50; i++) {
      rt.observe('cpu_util', 0.92); rt.observe('queue_depth', 800); rt.observe('p99', 3000); rt.tick();
    }
  });
  test('shared bus across multiple runtimes', () => {
    const bus = new TelemetryBus();
    const rt1 = new TelemetryRuntime({ serviceId: 'svc-a', bus });
    const rt2 = new TelemetryRuntime({ serviceId: 'svc-b', bus });
    rt1.observe('cpu_util', 0.5); rt1.tick();
    rt2.observe('cpu_util', 0.7); rt2.tick();
    expect(rt1.diagnostic().serviceId).toBe('svc-a');
    expect(rt2.diagnostic().serviceId).toBe('svc-b');
  });
});
