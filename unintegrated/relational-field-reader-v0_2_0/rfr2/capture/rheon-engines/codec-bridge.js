/**
 * RHEON KERNEL — CODEC BRIDGE
 *
 * Wires codec-node.js NodeRuntime into the kernel's two data paths:
 *
 *   1. PCM path:  mic.js emits 'audio:metrics' → but more importantly,
 *                 ring buffer pushes PCM buffers → NodeRuntime.pushPCM()
 *                 NodeRuntime.pushPCM() → PCMAnalyzer → FFTEngine → PitchEngine
 *                 → bus emits 'codec:audio:frame' with full acoustic analysis
 *
 *   2. Text path: kernel.commitNode() calls codec.pushText(text, ...)
 *                 NodeRuntime.pushText() → FrictionAnalyzer + AssociationEngine
 *                 + TopologyEngine + SlopeEngine etc.
 *                 → bus emits 'codec:batch' + 'codec:frame'
 *
 * The bridge also maps codec bus events to the kernel schema events so
 * the UI receives them in the existing schema shape without modification.
 *
 * §LAW: Bridge is purely additive. Removing it does not break the kernel.
 *       The voice-engines.js path continues to work independently.
 *       The codec enriches — it does not replace.
 */

import { NodeRuntime } from './codec-node.js';
import { KernelEvents } from '../schema/kernel.schema.js';

export class CodecBridge {
  constructor(bus, sampleRate) {
    this._bus     = bus;
    this._runtime = new NodeRuntime({ bus, sampleRate: sampleRate || 16000 });
    this._wired   = false;
  }

  init(sessionId) {
    this._runtime.start(sessionId);
    this._wireEvents();
    this._wired = true;
    return this;
  }

  stop() {
    this._runtime.stop();
  }

  // Called from kernel.commitNode() with the text after Whisper/recognition
  pushText(text, node) {
    if (!text?.trim()) return null;
    return this._runtime.pushText(text, {
      nodeId:    node?.id,
      threadId:  node?.threadId,
      domain:    node?.domain,
    });
  }

  // Called from mic.js PCM chunk handler (or ring buffer replay)
  pushPCM(pcmBuffer) {
    this._runtime.pushPCM(pcmBuffer);
  }

  stats() {
    return this._runtime.stats();
  }

  // Map codec bus events → kernel schema events for UI consumption
  _wireEvents() {
    // codec:audio:frame → kernel schema audio:metrics (enriched)
    this._bus.on('codec:audio:frame', evt => {
      const { audio, trajectory, confidence } = evt.payload;
      if (!audio) return;
      // Emit enriched audio metrics — UI gets pitch, slope, stability on top of RMS/ZCR
      this._bus.emit(KernelEvents.AUDIO_METRICS, {
        // Core (same as mic.js emits)
        rms:              audio.energy,
        zcr:              audio.zcr,
        pitch:            audio.pitch?.f0 ?? 0,
        silenceMs:        0,
        // Codec additions
        spectralCentroid: audio.spectralCentroid,
        cadence:          audio.cadence,
        energyAnomaly:    audio.energyAnomaly,
        energyZ:          audio.energyZ,
        // Pitch quality (PitchEngine)
        f0:               audio.pitch?.f0,
        jitter:           audio.pitch?.jitter,
        shimmer:          audio.pitch?.shimmer,
        hnr:              audio.pitch?.hnr,
        prosodyTag:       audio.pitch?.prosodyTag,
        voiced:           audio.pitch?.voiced,
        // Trajectory
        energySlope:      trajectory?.energy?.slope?.direction,
        energyMomentum:   trajectory?.energy?.slope?.momentum,
        energyRegime:     trajectory?.energy?.stability?.regime,
        // Confidence
        audioConfidence:  confidence?.audio,
        ts:               Date.now(),
        source:           'codec',
      }, 'CODEC_BRIDGE');
    });

    // codec:batch → BEP context enrichment via sigma:update
    this._bus.on('codec:batch', evt => {
      const batch = evt.payload;
      if (!batch) return;
      // Push topology state as sigma update (BEP reads this)
      this._bus.emit(KernelEvents.SIGMA_UPDATE, {
        regime:       batch.topology?.composite?.state ?? 'CALIBRATING',
        sentiment:    batch.sentiment?.score,
        friction:     batch.friction?.score,
        topologyState:batch.topology?.composite?.state,
        polarityArc:  batch.topology?.polarity?.sessionArc,
        compositeZ:   batch.topology?.baseline?.compositeZ,
        baselineAlert:batch.topology?.baseline?.alert,
        sentSlope:    batch.trajectory?.sentiment?.slope?.direction,
        sentRegime:   batch.trajectory?.sentiment?.stability?.regime,
        prosodyTag:   this._runtime._lastAudioFrame?.pitch?.prosodyTag,
        ts:           Date.now(),
        source:       'codec',
      }, 'CODEC_BRIDGE');
    });

    // codec:escalation → forward as kernel error with context
    this._bus.on('codec:escalation', evt => {
      this._bus.emit('codec:escalation:detected', evt.payload, 'CODEC_BRIDGE');
    });
  }
}
