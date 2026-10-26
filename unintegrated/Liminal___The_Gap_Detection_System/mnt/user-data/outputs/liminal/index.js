/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  @spatial/liminal  ·  index.js  ·  v1.0.0                             ║
 * ║  UUID: lim-pkg-0000-0000-1000-0000-000000000001                       ║
 * ║                                                                        ║
 * ║  The Liminal System — gap detection across all domains.               ║
 * ║  Modular. Isolated. Event-driven.                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Quick start:
 *
 *   import { createLiminal, LIM } from '@spatial/liminal';
 *
 *   const kernel = createLiminal({ debug: false });
 *
 *   // Subscribe to all gap events
 *   kernel.on('lim.gap.*', gap => {
 *     console.log(`[${gap.type}/${gap.subtype}] ${gap.description} score=${gap.score}`);
 *   });
 *
 *   // Process messages
 *   kernel.process({ text: "That never happened.", author: 'alex', ts: Date.now() });
 *   kernel.process({ text: "I'm fine. It doesn't matter.", author: 'alex' });
 *   kernel.process({ text: "Everyone always does this.", author: 'alex' });
 *
 *   // Query gaps
 *   const top = kernel.topGaps(5);
 *   const assumptionGaps = kernel.query({ type: 'assumption', minScore: 0.5 });
 *   const summary = kernel.summary();
 *
 * Module gap channels (each module is isolated, communicates only via bus):
 *   LIM.GAP_ASSUMPTION      — load-bearing assumptions treated as facts
 *   LIM.GAP_SHADOW          — present-but-unspoken content
 *   LIM.GAP_CONTRASTIVE     — word/behavior/body divergence
 *   LIM.GAP_NEGATIVE_SPACE  — systematic avoidance, circling without landing
 *   LIM.GAP_STRUCTURAL      — frame, presupposition, power geometry
 *   LIM.GAP_REVERSAL        — meaning inversions, "fine" meaning not fine
 *   LIM.GAP_FIELD           — oscillation, edges, plateaus, field geometry
 *   LIM.GAP_RELATIONAL      — gaslighting, manipulation, control, communication
 *   LIM.GAP_OSCILLATORY     — sigma regime, pendulum, intermittent reinforcement
 *   LIM.GAP_MUSIC           — harmonic, lyric, rhythm, structural song gaps
 *   LIM.GAP_CODE            — code domain, language-specific, architectural
 *   LIM.GAP_EXISTENTIAL     — identity, values, meaning, purpose, shadow
 *   LIM.GAP_COMPOSITE       — aggregated window: pressure + dominant type
 */

'use strict';

// Kernel (primary entry point)
export { LiminalKernel, createLiminal, KERNEL_VERSION, KERNEL_UUID } from './kernel/index.js';

// Bus (channels + factory)
export { LiminalBus, createBus, LIM, MODULE, BUS_VERSION } from './bus/index.js';

// Core (taxonomy, types, utilities)
export {
  GAP_TYPE,
  GAP_TYPE_CRITICALITY,
  GAP_REASON,
  GAP_REASON_DESCRIPTION,
  DOMAIN,
  FIELD_GAP_SUBTYPE,
  SIGMA_REGIME,
  classifySigma,
  GapSignal,
  SlidingWindow,
  tokenize,
  INVARIANTS,
  AS_ABOVE_SO_BELOW,
} from './core/index.js';

// Modules (for direct instantiation if needed outside kernel)
export { AssumptionModule }              from './modules/assumption/index.js';
export { ShadowFieldModule }             from './modules/shadow/index.js';
export { ContrastiveModule }             from './modules/contrastive/index.js';
export { NegativeSpaceModule }           from './modules/negative-space/index.js';
export { StructuralAssumptionModule }    from './modules/structural/index.js';
export { ReversalModule }                from './modules/reversal/index.js';
export { FieldModule }                   from './modules/field/index.js';
export { RelationalModule }              from './modules/relational/index.js';
export { OscillatoryModule }             from './modules/oscillatory/index.js';
export { MusicModule }                   from './modules/music/index.js';
export { CodeModule }                    from './modules/code/index.js';
export { ExistentialModule }             from './modules/existential/index.js';
