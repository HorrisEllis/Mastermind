/**
 * @module       runtime
 * @uuid         ru9t0000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * TelemetryRuntime — top-level wiring. One object. One event.
 *
 * Analog to NexusRuntime in codec-v2.js — wires all engines together
 * and emits a unified ServiceFrame on every tick.
 *
 * USAGE:
 *   const rt = new TelemetryRuntime({ serviceId: 'payments-api' });
 *
 *   // Feed metrics (call as often as you like between ticks)
 *   rt.observe('cpu_util',   0.72);
 *   rt.observe('p99',        245);
 *   rt.observe('error_rate', 0.003);
 *
 *   // Tick once per interval (1Hz recommended)
 *   const frame = rt.tick();
 *   // frame = { health, state, topology, drift, frame, ts }
 *
 *   // Subscribe to frames
 *   rt.on('frame', frame => console.log(frame));
 *
 *   // Subscribe to incidents (topology composite events above threshold)
 *   rt.on('incident', ev => alert(ev));
 *
 * SERVICEFRAME SCHEMA:
 *   {
 *     serviceId    string
 *     frame        number
 *     ts           number
 *     health       number [0,1]    composite health score
 *     state        {                5D Kalman posterior
 *       momentum   [-1,+1]         trending healthy vs degrading
 *       load       [0,1]           how hard is it working?
 *       debt       [0,1]           hidden instability?
 *       coherence  [0,1]           signals telling same story?
 *       capacity   [-1,+1]         can take more (+1) or shedding (-1)?
 *     }
 *     topology     {
 *       dominant   string|null     highest-scoring composite state
 *       active     Map             all active composites above threshold
 *     }
 *     drift        {
 *       signals    signal[]        active sub-threshold precursor signals
 *       cluster    boolean         3+ co-occurring signals
 *       magnitude  number          cumulative baseline deviation
 *     }
 *     confidence   {
 *       load       number
 *       momentum   number
 *       overall    number
 *     }
 *     snapshot     object          raw normalized metric values
 *   }
 */

'use strict';

import { TelemetryBus }        from './bus.js';
import { TelemetryAdapter }    from './adapter.js';
import { ServiceLatentModel }  from './latent-model.js';
import { ServiceTopology }     from './topology.js';
import { ServiceDriftEngine }  from './drift-engine.js';
import { ConfidencePropagator } from './engines.js';

export const RUNTIME_UUID    = 'ru9t0000-0000-4000-9000-000000000001';
export const RUNTIME_VERSION = '1.0.0';

export class TelemetryRuntime {
  /**
   * @param {object} opts
   * @param {string} opts.serviceId
   * @param {object} [opts.bus]           — provide your own TelemetryBus, or one is created
   * @param {object} [opts.metricConfig]  — passed to TelemetryAdapter
   * @param {number} [opts.incidentThreshold=0.55] — topology score above which incident fires
   */
  constructor({ serviceId, bus, metricConfig = {}, incidentThreshold = 0.55 } = {}) {
    if (!serviceId) throw new Error('[TelemetryRuntime] serviceId required');

    this._serviceId          = serviceId;
    this._incidentThreshold  = incidentThreshold;
    this._frameIdx           = 0;
    this._handlers           = new Map(); // event type → Set<fn>

    // Bus (shared across all sub-engines)
    this._bus = bus ?? new TelemetryBus();

    // Engine stack
    this._adapter  = new TelemetryAdapter({ bus: this._bus, serviceId, metricConfig });
    this._latent   = new ServiceLatentModel({ bus: this._bus, serviceId });
    this._topology = new ServiceTopology({ bus: this._bus, serviceId });
    this._drift    = new ServiceDriftEngine({ bus: this._bus, serviceIds: [serviceId] });
    this._conf     = new ConfidencePropagator(2000); // 2s confidence window

    // State cache for frame assembly
    this._lastLatentState  = null;
    this._lastTopology     = { dominant: null, active: new Map() };
    this._lastDriftSignals = [];
    this._lastDriftCluster = false;
    this._lastDriftMag     = 0;

    this._wireBus();
  }

  _wireBus() {
    const b = this._bus;

    b.on('tc.latent.update', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._lastLatentState = ev.state;
      this._conf.observe('latent', 0.8 - (ev.state.debt ?? 0) * 0.3);
    });

    b.on('tc.latent.shift', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._emit('shift', { serviceId: this._serviceId, shifts: ev.shifts, state: ev.state, ts: ev.ts });
    });

    b.on('tc.topology.composite', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._conf.observe(`topology.${ev.label}`, ev.score);
      if (ev.score >= this._incidentThreshold) {
        this._emit('incident', { serviceId: this._serviceId, composite: ev.label, score: ev.score, confidence: ev.confidence, ts: ev.ts });
      }
    });

    b.on('tc.topology.transition', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._emit('transition', ev);
    });

    b.on('tc.drift.signal', ev => {
      if (ev.serviceId !== this._serviceId) return;
      // Update lastDriftSignals (rolling list of active signals)
      this._lastDriftSignals = this._lastDriftSignals.filter(s => s.signal !== ev.signal);
      this._lastDriftSignals.push({ signal: ev.signal, confidence: ev.confidence, ts: ev.ts });
      if (this._lastDriftSignals.length > 10) this._lastDriftSignals = this._lastDriftSignals.slice(-10);
      this._conf.observe(`drift.${ev.signal}`, ev.confidence);
    });

    b.on('tc.drift.cluster', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._lastDriftCluster = true;
      this._lastDriftMag     = ev.magnitude;
      this._emit('precursor', { serviceId: this._serviceId, signals: ev.signals, magnitude: ev.magnitude, ts: ev.ts });
    });

    b.on('tc.drift.calibrated', ev => {
      if (ev.serviceId !== this._serviceId) return;
      this._emit('calibrated', { serviceId: this._serviceId, ts: ev.ts });
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // Feed a metric observation (call any time before tick())
  observe(metric, value) {
    this._adapter.observe(metric, value);
    return this;
  }

  // Advance one tick. Returns the full ServiceFrame.
  tick() {
    this._frameIdx++;

    // 1. Adapter flushes pending observations through slope/stability/osc engines
    this._adapter.tick();

    // 2. Latent model advances Kalman filter (consumes bus events from step 1)
    const latentState = this._latent.step();

    // 3. Topology checks composite composites (consumes bus events from steps 1-2)
    const topResult   = this._topology.step();
    this._lastTopology = topResult;

    // Expire stale drift cluster flag
    this._lastDriftCluster = this._lastDriftSignals.filter(s => Date.now() - s.ts < 10000).length >= 3;

    // 4. Build unified ServiceFrame
    const frame = this._buildFrame(latentState);

    this._emit('frame', frame);
    return frame;
  }

  _buildFrame(latentState) {
    const state = latentState ?? this._lastLatentState ?? { momentum:0, load:0, debt:0, coherence:0, capacity:0 };
    return {
      serviceId:   this._serviceId,
      frame:       this._frameIdx,
      ts:          Date.now(),

      health:      this._latent.healthScore(),
      state,

      topology: {
        dominant: this._lastTopology.dominant,
        active:   Object.fromEntries(this._lastTopology.active ?? new Map()),
      },

      drift: {
        signals:   this._lastDriftSignals.filter(s => Date.now() - s.ts < 10000),
        cluster:   this._lastDriftCluster,
        magnitude: r4(this._lastDriftMag),
      },

      confidence: {
        load:     r4(this._conf.propagated('latent')),
        momentum: r4(this._conf.propagated('topology.DEGRADED') > 0.3 ? 1 - this._conf.propagated('topology.DEGRADED') : 0.7),
        overall:  r4(this._conf.joint(['latent'])),
      },

      snapshot: this._adapter.snapshot().metrics,
    };
  }

  // ── Event emitter ───────────────────────────────────────────────────────────

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this._handlers.get(event)?.delete(fn);
  }

  _emit(event, data) {
    const handlers = this._handlers.get(event);
    if (!handlers?.size) return;
    for (const fn of handlers) { try { fn(data); } catch (e) { console.error(`[TelemetryRuntime] handler error (${event}):`, e); } }
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  diagnostic() {
    return {
      uuid:      RUNTIME_UUID,
      version:   RUNTIME_VERSION,
      serviceId: this._serviceId,
      frame:     this._frameIdx,
      latent:    this._latent.diagnostic(),
      adapter:   this._adapter.health(),
      topology:  this._topology.health(),
      drift:     this._drift.health(),
      bus:       this._bus.health(),
    };
  }

  get bus() { return this._bus; }
}

function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
