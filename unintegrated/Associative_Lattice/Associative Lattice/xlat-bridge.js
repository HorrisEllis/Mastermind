/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  XLAT-BRIDGE  ·  xlat-bridge.js  ·  v1.0.0                            ║
 * ║  UUID: alk-mod-xlatbridge-0000-3000-0000-000000000001                  ║
 * ║  HOOK: alk.module.xlatbridge:communication-translator:00001            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signals. Not diagnoses. Not verdicts.
 * §1.2 — All errors loud. Zero silent failures.
 * §3.1 — Bottom-up only. Data → structure → inference → action.
 * §5.1 — UUID + hook + bus registration.
 * §5.5 — No external runtime dependencies.
 * §5.7 — Zero direct module calls. All I/O via kernel bus.
 * §5.8 — Composable layers, not configured monolith.
 * §7.0 — Event ontology separation: observational vs authoritative.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS — AND WHY XLAT-11 ISN'T THIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * XLAT-11 (HumanTranslatorModule) translates ABOUT a person — it reads one
 * person's state and generates guidance for whoever is listening.
 * One direction. One moment. Text output. Observer-facing.
 *
 * XLAT-BRIDGE translates BETWEEN two expression systems in real time.
 * It does what a simultaneous interpreter does: work ~3 seconds behind the
 * speaker, process semantic intent ahead of literal words, render into
 * the target system's native grammar — while the transmission is still live.
 *
 * The distinction: XLAT-11 is a translation NOTE. This is a translation RELAY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CORE INSIGHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every communication failure is a translation failure.
 * Not a language barrier — a structural one.
 *
 * Two people in the same room speaking the same language can be operating
 * in entirely different expression systems:
 *
 *   — Different nervous system states (different processing bandwidths)
 *   — Different attachment grammars (different rules for what words mean)
 *   — Different emotional registers (different vocabularies for the same felt sense)
 *   — Different cognitive modes (one thinks-first, one feels-first)
 *   — Different framework assumptions (implicit models of what's happening)
 *   — Different ASE signatures (structural fingerprints — how they encode meaning)
 *   — Different temporal scales (one processes in real-time, one needs 20 minutes)
 *   — Different somatic vocabularies (body-primary vs word-primary expression)
 *   — Different symbolic grammars (what counts as a bid, repair, threat, care)
 *
 * A person saying "fine" in a FREEZE state, ANXIOUS attachment, GRIEF active,
 * THINK_FIRST processing, SCANDINAVIAN cultural frame is transmitting a complex
 * multi-dimensional signal. If the receiver is in HYPERAROUSAL, DISORGANIZED
 * attachment, RAGE active, FEEL_FIRST processing, ARABIC cultural frame —
 * the probability of accurate receipt is near zero without translation.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: FIVE LAYERS PER DIRECTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * For each person-pair (A→B and B→A), the pipeline is:
 *
 *   [1] RECEIVE     — ingest raw transmission (words + affect + body + silence)
 *   [2] DECODE      — extract actual signal (need, emotion, bid, assumption)
 *   [3] PROFILE     — read receiver's current capacity, grammar, mode
 *   [4] TRANSCODE   — convert signal into receiver's grammar at their bandwidth
 *   [5] RENDER      — output in the right modality, timing, and register
 *
 * Plus three cross-cutting systems:
 *
 *   [SHARED REFERENT ENGINE]
 *     Find what both people are actually pointing at that they don't know
 *     they share. Two people arguing about dishes are both pointing at
 *     "I don't feel seen." The shared referent is the bridge.
 *
 *   [TEMPORAL BUFFER]
 *     Hold transmissions being sent at wrong time. A repair bid during
 *     FLOODING is not receivable — hold it. Tag for delivery when the
 *     window opens. The content is real; the timing is wrong.
 *
 *   [IRRECOVERABLE SIGNAL DETECTOR]
 *     Some transmissions cannot be translated right now because the
 *     receiver's system is offline (DORSAL, FREEZE, deep FLOODING).
 *     Detect this and route to BUFFER instead of attempting translation.
 *     No translation is better than a failed translation that causes harm.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MODE CONVERSION — THE PHOTONICS INSIGHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * In optical fiber, a mode converter transforms energy from one propagation
 * mode to another without changing information content. The signal is preserved;
 * the transmission mode changes.
 *
 * The same signal ("I'm angry") can travel in different modes:
 *   RAGE mode:      "You never listen to me. You always do this."
 *   NEED mode:      "I need to feel heard right now."
 *   SOMATIC mode:   [voice tight, jaw set, volume climbing]
 *   NARRATIVE mode: "This is the third time this week and I'm exhausted."
 *   ATTACHMENT mode: "You're pulling away and it scares me."
 *
 * The underlying signal is identical. The mode determines receivability.
 * XLAT-BRIDGE converts transmission mode to match receiver grammar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ADAPTIVE BANDWIDTH — THE CODEC INSIGHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A video codec monitors receiver bandwidth and adjusts transmission
 * resolution dynamically. It never drops content — it adjusts resolution.
 *
 * When a person's processing capacity is low (hyper/hypo arousal), the
 * translator reduces "bitrate":
 *   100% capacity → full signal, all nuance, all layers
 *    60% capacity → core signal only, strip complexity
 *    30% capacity → single sentence maximum, presence over content
 *    10% capacity → no words — physical presence only
 *   OFFLINE        → buffer everything, attempt no transmission
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens (per person — prefix with person ID in dyadic mode):
 *   alk.htl.ns.state              nervous system + window zone
 *   alk.htl.emo.state             emotional system + dominant affect
 *   alk.htl.need.state            NVC needs + intent
 *   alk.htl.att.state             attachment pattern
 *   alk.htl.cog.profile           processing order, cognitive style
 *   alk.htl.lang.detected         cultural frame
 *   alk.htl.som.gap               somatic-semantic gap
 *   alk.htl.gap.detected          silence type + duration
 *   alk.htl.translation           XLAT-11 output (feeds our decoder)
 *   alk.verbal.transcript         raw text
 *   alk.verbal.analysis.tone      prosody, energy, cadence
 *   alk.rel.bid.detected          connection bid
 *   alk.rel.rupture.detected      relational break
 *   alk.rel.repair.attempt        repair bid
 *   irs.gap.detected              IRS gap event
 *   irs.inversion.triggered       epistemic inversion
 *   ase.signature.updated         ASE signature update
 *   resonance.result              resonance scoring result
 *   alk.session.capture.start/stop
 *
 * Emits:
 *   xlat.bridge.transmission      decoded + transcoded signal ready for render
 *   xlat.bridge.render.A          rendered output for Person A's reception
 *   xlat.bridge.render.B          rendered output for Person B's reception
 *   xlat.bridge.shared_referent   shared referent identified
 *   xlat.bridge.buffer.held       transmission held — receiver offline or wrong time
 *   xlat.bridge.buffer.released   buffered transmission now deliverable
 *   xlat.bridge.irrecoverable     transmission cannot be translated — system offline
 *   xlat.bridge.bandwidth.update  receiver capacity changed — bitrate adjusted
 *   xlat.bridge.mode.converted    transmission mode converted for receiver grammar
 *   xlat.bridge.window.open       receiver window opened — buffered items releasing
 *   xlat.bridge.error
 */

'use strict';

// ─── Identity §5.1 ────────────────────────────────────────────────────────────

export const XLATBRIDGE_UUID    = 'alk-mod-xlatbridge-0000-3000-0000-000000000001';
export const XLATBRIDGE_VERSION = '1.0.0';
export const XLATBRIDGE_HOOK    = 'alk.module.xlatbridge:communication-translator:00001';

// ─── Shared utilities ─────────────────────────────────────────────────────────

function r4(n)              { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)          { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }

function ts() { return Date.now(); }

class SlidingWindow {
  constructor(cap) { this._buf = []; this._cap = cap; }
  push(v)    { this._buf.push(v); if (this._buf.length > this._cap) this._buf.shift(); }
  get vals() { return [...this._buf]; }
  get len()  { return this._buf.length; }
  avg()      { return mean(this._buf); }
  last()     { return this._buf[this._buf.length - 1] ?? null; }
  clear()    { this._buf = []; }
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Processing bandwidth levels — how much signal can be received
const BANDWIDTH = Object.freeze({
  FULL:     'FULL',       // 80–100% capacity — all nuance receivable
  MODERATE: 'MODERATE',  // 50–80%  — core signal + limited nuance
  REDUCED:  'REDUCED',   // 25–50%  — single-layer signal only
  MINIMAL:  'MINIMAL',   // 10–25%  — presence only, one sentence max
  OFFLINE:  'OFFLINE',   // < 10%   — DORSAL or FREEZE — nothing receivable
});

// Transmission modes (the "fiber mode" of the signal)
const TX_MODE = Object.freeze({
  RAGE:      'RAGE',        // anger/frustration expressed as attack
  NEED:      'NEED',        // underlying need directly stated
  SOMATIC:   'SOMATIC',     // body-primary, pre-verbal
  NARRATIVE: 'NARRATIVE',   // story-form, past-referenced
  ATTACHMENT:'ATTACHMENT',  // relational safety/threat framing
  COGNITIVE: 'COGNITIVE',   // analytical/framework-based
  SYMBOLIC:  'SYMBOLIC',    // metaphor, imagery, indirect
  SILENCE:   'SILENCE',     // gap-based transmission
  REPAIR:    'REPAIR',      // explicit repair attempt
  BID:       'BID',         // connection bid
  MIXED:     'MIXED',       // multiple modes simultaneous
});

// Render modalities — how to deliver the transcoded signal
const RENDER_MOD = Object.freeze({
  WORDS:       'WORDS',      // specific words to say
  TONE:        'TONE',       // voice quality only — not what, how
  PRESENCE:    'PRESENCE',   // physical/attentive presence, no words
  SILENCE:     'SILENCE',    // deliberate silence as response
  TIMING:      'TIMING',     // wait — correct content, wrong moment
  BUFFER:      'BUFFER',     // hold — receiver not ready
});

// Receiver grammar types — how this person most naturally receives signal
const GRAMMAR = Object.freeze({
  SOMATIC_FIRST:    'SOMATIC_FIRST',   // body acknowledgment before words
  EMOTIONAL_FIRST:  'EMOTIONAL_FIRST', // emotion named before anything else
  LOGICAL_FIRST:    'LOGICAL_FIRST',   // frame/context before emotion
  NARRATIVE_FIRST:  'NARRATIVE_FIRST', // story context before core
  NEED_FIRST:       'NEED_FIRST',      // name the need directly, immediately
  SPACE_FIRST:      'SPACE_FIRST',     // avoidant — needs room before contact
  PRESENCE_FIRST:   'PRESENCE_FIRST',  // not-alone before any content
});

// Buffer reasons — why a transmission is being held
const BUFFER_REASON = Object.freeze({
  RECEIVER_OFFLINE:    'RECEIVER_OFFLINE',
  FLOODING:            'FLOODING',
  WRONG_TIMING:        'WRONG_TIMING',
  PURSUIT_RISK:        'PURSUIT_RISK',    // sending this will escalate pursuit
  RETRAUMATIZATION:    'RETRAUMATIZATION',
  WINDOW_CLOSING:      'WINDOW_CLOSING',
  INCOMPLETE_DECODE:   'INCOMPLETE_DECODE',
});

// ─── Person state model ───────────────────────────────────────────────────────
// The current receiving and transmitting profile of one person.

function blankPersonState(id) {
  return {
    id,
    ns:       null,   // nervous system state
    emo:      null,   // emotional system state
    need:     null,   // needs + intent
    att:      null,   // attachment pattern
    cog:      null,   // cognitive profile
    lang:     null,   // cultural frame
    som:      null,   // somatic-semantic gap
    gap:      null,   // silence type
    xlat:     null,   // latest XLAT-11 output
    ase:      null,   // authorship signature
    transcript: null, // latest text
    tone:     null,   // prosody/energy

    // Derived
    bandwidth: BANDWIDTH.FULL,
    grammar:   GRAMMAR.EMOTIONAL_FIRST,
    txMode:    TX_MODE.MIXED,
    capacity:  0.7,
  };
}

// ─── Layer 1: RECEIVE — ingest raw transmission ───────────────────────────────

function receive(person, events) {
  // Merge latest events into person state — most recent wins per type
  if (events.ns)         person.ns         = events.ns;
  if (events.emo)        person.emo        = events.emo;
  if (events.need)       person.need       = events.need;
  if (events.att)        person.att        = events.att;
  if (events.cog)        person.cog        = events.cog;
  if (events.lang)       person.lang       = events.lang;
  if (events.som)        person.som        = events.som;
  if (events.gap)        person.gap        = events.gap;
  if (events.xlat)       person.xlat       = events.xlat;
  if (events.ase)        person.ase        = events.ase;
  if (events.transcript) person.transcript = events.transcript;
  if (events.tone)       person.tone       = events.tone;
  return person;
}

// ─── Layer 2: DECODE — extract the actual signal ─────────────────────────────
// Returns a DecodedSignal: what is actually being transmitted beneath the words.

function decode(sender) {
  const ns      = sender.ns;
  const emo     = sender.emo;
  const need    = sender.need;
  const att     = sender.att;
  const gap     = sender.gap;
  const som     = sender.som;
  const xlat    = sender.xlat;
  const text    = sender.transcript?.text ?? '';

  // ── Primary need (what this person actually needs right now) ──────────────
  // Priority: explicit need > inferred from emotion > inferred from context
  const primaryNeed =
    need?.unmet?.[0] ??
    need?.active?.[0] ??
    inferNeedFromEmotion(emo?.dominant) ??
    'UNKNOWN';

  // ── Transmission mode detection ───────────────────────────────────────────
  const txMode = detectTransmissionMode(sender);

  // ── Core message (what this transmission is actually saying) ──────────────
  const coreMessage = extractCoreMessage(sender, txMode, primaryNeed);

  // ── Attachment bid type (if there is one) ─────────────────────────────────
  const bidType = detectBidType(sender);

  // ── Framework assumption (implicit model being asserted) ──────────────────
  const frameworkAssertion = detectFrameworkAssertion(text, emo);

  // ── Distress level 0–1 ────────────────────────────────────────────────────
  const distress = computeDistress(sender);

  // ── Signal integrity: how clearly is the actual signal readable? ──────────
  const signalIntegrity = computeSignalIntegrity(sender);

  return {
    sender:             sender.id,
    ts:                 ts(),
    txMode,
    primaryNeed,
    coreMessage,
    bidType,
    frameworkAssertion,
    distress,
    signalIntegrity,
    rawEmotion:         emo?.dominant ?? null,
    rawNsState:         ns?.polyvagalState ?? 'VENTRAL',
    rawGapType:         gap?.type ?? null,
    somaticGap:         som?.gap_type ?? 'CONGRUENT',
    attachmentPattern:  att?.pattern ?? null,
    intent:             need?.intent ?? null,
  };
}

function inferNeedFromEmotion(dominant) {
  const map = {
    GRIEF:   'CONNECTION',
    FEAR:    'SAFETY',
    RAGE:    'RESPECT',
    SHAME:   'ACCEPTANCE',
    SEEKING: 'UNDERSTANDING',
    CARE:    'INTERDEPENDENCE',
    PLAY:    'SPONTANEITY',
    LUST:    'INTIMACY',
    PANIC:   'REASSURANCE',
  };
  return dominant ? (map[dominant] ?? null) : null;
}

function detectTransmissionMode(sender) {
  const emo  = sender.emo;
  const ns   = sender.ns;
  const gap  = sender.gap;
  const som  = sender.som;
  const att  = sender.att;
  const text = sender.transcript?.text ?? '';
  const xlat = sender.xlat;

  // Silence modes
  if (gap?.type)                                       return TX_MODE.SILENCE;

  // Somatic-primary (body leading, words absent or mismatched)
  if (som?.gap_type === 'BODY_AHEAD' ||
      som?.gap_type === 'PREVERBAL')                   return TX_MODE.SOMATIC;

  // Rage/attack mode
  if (emo?.dominant === 'RAGE' &&
      (text.match(/\byou\s+(always|never|keep)/i) ||
       text.match(/\bwhy\s+do\s+you\b/i)))             return TX_MODE.RAGE;

  // Repair attempt
  if (xlat?.surface_signal?.includes('repair') ||
      text.match(/\bI('m|\s+am)\s+sorry\b/i) ||
      text.match(/\bI\s+want\s+to\s+(fix|repair|address)\b/i))
                                                       return TX_MODE.REPAIR;

  // Connection bid
  if (text.match(/\b(remember\s+when|I\s+miss|I\s+love|you\s+matter)\b/i) ||
      att?.bidDetected)                                return TX_MODE.BID;

  // Attachment-framed
  if (text.match(/\b(you('re|\s+are)\s+(leaving|pulling\s+away|not\s+here)|I\s+(need|want)\s+you)\b/i))
                                                       return TX_MODE.ATTACHMENT;

  // Need-direct
  if (text.match(/\bI\s+need\b/i) ||
      text.match(/\bwhat\s+I\s+need\s+is\b/i))        return TX_MODE.NEED;

  // Cognitive/analytical
  if (text.match(/\b(the\s+reason|therefore|which\s+means|logically|the\s+point\s+is)\b/i))
                                                       return TX_MODE.COGNITIVE;

  // Symbolic/metaphoric
  if (text.match(/\b(like\s+a|as\s+if|it('s|\s+is)\s+like|imagine)\b/i))
                                                       return TX_MODE.SYMBOLIC;

  // Narrative
  if (text.match(/\b(when\s+you|this\s+always|the\s+last\s+time|every\s+time)\b/i))
                                                       return TX_MODE.NARRATIVE;

  return TX_MODE.MIXED;
}

function extractCoreMessage(sender, txMode, primaryNeed) {
  const emo    = sender.emo;
  const ns     = sender.ns;
  const gap    = sender.gap;
  const att    = sender.att;
  const intent = sender.need?.intent;

  switch (txMode) {
    case TX_MODE.RAGE:
      return `"I feel disrespected/unseen and my need for ${primaryNeed?.toLowerCase() ?? 'respect'} is unmet — I'm transmitting in attack mode because direct expression feels unsafe or unavailable right now."`;

    case TX_MODE.SILENCE:
      return `"${gapCoreMessage(gap?.type, ns?.polyvagalState)}"`;

    case TX_MODE.SOMATIC:
      return `"Something is happening in my body that I cannot yet put into words. The felt sense is ${emo?.dominant?.toLowerCase() ?? 'present but unnamed'}. I need you to be with me here before I can speak it."`;

    case TX_MODE.REPAIR:
      return `"I want to reconnect. The distance between us is causing me pain. I'm reaching across it — I hope you can receive this."`;

    case TX_MODE.BID:
      return `"I am reaching toward you. This is a connection bid. My need is contact, not conversation."`;

    case TX_MODE.ATTACHMENT:
      return `"I'm experiencing a threat to our connection and my attachment system is activated. I need reassurance that we're okay and that you're not leaving."`;

    case TX_MODE.NEED:
      return `"I'm expressing a direct need: ${primaryNeed?.toLowerCase() ?? 'something I need from you right now'}.`;

    case TX_MODE.NARRATIVE:
      return `"I'm trying to show you a pattern I experience, not just this moment. The story is the signal. I need you to hear the pattern, not defend against the example."`;

    case TX_MODE.COGNITIVE:
      return `"I'm trying to build shared understanding through logic. The frame I'm offering is what matters — if you reject the frame without engaging it, I feel unheard."`;

    default:
      return `"${emo?.dominant ? `${emo.dominant} active` : 'signal present'} — ${primaryNeed ? `need: ${primaryNeed}` : 'need unclear'} — ${intent ? `intent: ${intent.replace(/_/g,' ').toLowerCase()}` : ''}"`;
  }
}

function gapCoreMessage(gapType, nsState) {
  const messages = {
    FREEZE:          'My nervous system has locked. I\'m not present in words. I need stillness and time — not pursuit.',
    FLOODING:        'I\'m overwhelmed. My system needs 20 minutes minimum to return. The content matters — the timing is wrong. Please hold.',
    NEEDING_SPACE:   'I need to be alone to process. This is regulation, not punishment. I will return.',
    PROCESSING_TIME: 'The answer is building. I\'m not stonewalling — I\'m computing. Don\'t fill the silence.',
    DISSOCIATION:    'I\'ve gone somewhere else. Gentle presence only. Wait for me to come back.',
    GRIEF_SILENCE:   'I\'m in grief. Words can\'t reach it right now. Just be here.',
    STONEWALLING:    'I\'m behind a wall. The contempt I\'m carrying is a signal — something has been unaddressed for too long.',
    SILENT_TREATMENT:'I\'m in a relational standoff. The silence is communicative — it means something went very wrong.',
    RHYTHMIC_PAUSE:  'This is just a thinking pause. It has no relational meaning.',
  };
  return messages[gapType] ?? (nsState === 'DORSAL' ? 'System is offline. Hold.' : 'Signal present in the silence.');
}

function detectBidType(sender) {
  const text = sender.transcript?.text ?? '';
  if (text.match(/\b(remember\s+when|do\s+you\s+remember)\b/i)) return 'NOSTALGIC_BID';
  if (text.match(/\b(I\s+love|you\s+matter|I\s+miss\s+you)\b/i))return 'AFFECTION_BID';
  if (text.match(/\b(can\s+we|let\'s|want\s+to)\b/i))           return 'ACTIVITY_BID';
  if (text.match(/\b(are\s+you\s+ok|how\s+are\s+you)\b/i))      return 'CARE_BID';
  if (text.match(/\b(I\s+need\s+(a\s+)?hug|hold\s+me)\b/i))     return 'PHYSICAL_BID';
  return null;
}

function detectFrameworkAssertion(text, emo) {
  // Detect implicit model assertions — the load-bearing assumptions
  if (text.match(/\byou\s+always\b/i))     return { type: 'TEMPORAL_PERMANENCE', text: '"you always" — asserts this is a permanent pattern, not an event' };
  if (text.match(/\byou\s+never\b/i))      return { type: 'TEMPORAL_PERMANENCE', text: '"you never" — asserts permanent absence of a behavior' };
  if (text.match(/\bno\s+one\s+ever\b/i))  return { type: 'SOCIAL_REALITY', text: '"no one ever" — generalizes relational failure to all people' };
  if (text.match(/\bnobody\s+cares\b/i))   return { type: 'WORTH', text: '"nobody cares" — framework assertion about own worth' };
  if (text.match(/\bthat\'s\s+just\s+how\s+(it|I|you)\s+(is|am|are)\b/i)) return { type: 'PERMANENCE', text: 'Permanence assertion — treating current state as fixed trait' };
  if (text.match(/\bif\s+you\s+really\s+(loved|cared)\b/i)) return { type: 'CONDITIONAL_LOVE', text: '"if you really loved" — framework asserts love must be proven by this action' };
  return null;
}

function computeDistress(sender) {
  const nsZone   = sender.ns?.windowZone ?? 'WINDOW';
  const arousal  = sender.tone?.energy   ?? 0.5;
  const emoVol   = sender.emo?.volatility?? 0.5;
  const gapType  = sender.gap?.type;

  let d = 0;
  if (nsZone === 'HYPER')                              d += 0.4;
  if (nsZone === 'HYPO')                               d += 0.5;
  if (sender.ns?.polyvagalState === 'FREEZE')          d += 0.6;
  if (sender.ns?.polyvagalState === 'DORSAL')          d += 0.7;
  if (gapType === 'FLOODING')                          d += 0.4;
  if (gapType === 'DISSOCIATION')                      d += 0.5;
  d += emoVol * 0.2;
  d += (arousal - 0.5) * 0.2;
  return r4(clamp(d));
}

function computeSignalIntegrity(sender) {
  // How clearly is the actual signal readable from the transmission?
  // High integrity = signal and transmission mode match
  // Low integrity = lots of noise, mode mismatch, somatic-verbal gap
  let clarity = 0.7; // baseline
  if (sender.som?.gap_type === 'CONGRUENT')            clarity += 0.15;
  if (sender.som?.gap_type === 'BODY_CONTRADICTS')     clarity -= 0.30;
  if (sender.emo?.confidence === 'HIGH')               clarity += 0.10;
  if (sender.emo?.confidence === 'LOW')                clarity -= 0.15;
  if (sender.ns)                                       clarity += 0.05;
  if (!sender.emo)                                     clarity -= 0.20;
  return r4(clamp(clarity));
}

// ─── Layer 3: PROFILE RECEIVER — what is their current receiving capacity ─────

function profileReceiver(receiver) {
  const ns       = receiver.ns;
  const emo      = receiver.emo;
  const att      = receiver.att;
  const cog      = receiver.cog;
  const xlat     = receiver.xlat;

  // Bandwidth from NS + capacity
  // §1.2 — explicit grouping to avoid ?? vs ?: precedence confusion
  const rawCapacity = ns?.capacity != null
    ? ns.capacity
    : xlat?.processing_capacity != null
      ? parseFloat(String(xlat.processing_capacity).replace('%','')) / 100
      : 0.7;

  receiver.capacity = rawCapacity;
  receiver.bandwidth = capacityToBandwidth(rawCapacity, ns?.polyvagalState, ns?.windowZone);

  // Receiver grammar from ATT + COG + NS
  receiver.grammar = inferReceiverGrammar(att, cog, ns);

  return receiver;
}

function capacityToBandwidth(capacity, nsState, zone) {
  if (nsState === 'DORSAL' || nsState === 'FREEZE') return BANDWIDTH.OFFLINE;
  if (capacity < 0.15)                              return BANDWIDTH.OFFLINE;
  if (capacity < 0.30 || zone === 'HYPO')           return BANDWIDTH.MINIMAL;
  if (capacity < 0.50 || zone === 'HYPER')          return BANDWIDTH.REDUCED;
  if (capacity < 0.75)                              return BANDWIDTH.MODERATE;
  return BANDWIDTH.FULL;
}

function inferReceiverGrammar(att, cog, ns) {
  // Derive the receiver's native grammar for incoming signal
  const pattern = att?.pattern;
  const process = cog?.processOrder;
  const nsState = ns?.polyvagalState ?? 'VENTRAL';

  // NS state overrides attachment when dysregulated
  if (nsState === 'DORSAL' || nsState === 'FREEZE') return GRAMMAR.PRESENCE_FIRST;
  if (ns?.windowZone === 'HYPO')                    return GRAMMAR.SOMATIC_FIRST;

  // Attachment grammar
  if (pattern === 'ANXIOUS')      return GRAMMAR.PRESENCE_FIRST;
  if (pattern === 'AVOIDANT')     return GRAMMAR.SPACE_FIRST;
  if (pattern === 'DISORGANIZED') return GRAMMAR.SOMATIC_FIRST;

  // Cognitive processing order
  if (process === 'FEEL_FIRST')   return GRAMMAR.EMOTIONAL_FIRST;
  if (process === 'THINK_FIRST')  return GRAMMAR.LOGICAL_FIRST;
  if (process === 'BODY_FIRST')   return GRAMMAR.SOMATIC_FIRST;

  return GRAMMAR.EMOTIONAL_FIRST; // default
}

// ─── Layer 4: TRANSCODE — convert signal into receiver's grammar ──────────────

function transcode(decoded, receiver) {
  const bw      = receiver.bandwidth;
  const grammar = receiver.grammar;
  const att     = receiver.att?.pattern;
  const lang    = receiver.lang;

  // ── Irrecoverable check ───────────────────────────────────────────────────
  if (bw === BANDWIDTH.OFFLINE) {
    return {
      receivable:    false,
      reason:        BUFFER_REASON.RECEIVER_OFFLINE,
      bufferContent: decoded,
      render:        null,
    };
  }

  // ── Bandwidth reduction ───────────────────────────────────────────────────
  // Compress signal to fit receiver's available bandwidth
  const compressed = compressToWidth(decoded, bw);

  // ── Mode conversion ───────────────────────────────────────────────────────
  // Convert sender's transmission mode to receiver's grammar
  const converted = convertMode(compressed, decoded.txMode, grammar);

  // ── Pursuit/escalation risk ───────────────────────────────────────────────
  // If receiver is AVOIDANT, sending attachment/rage modes risks escalating withdrawal
  const pursuitRisk = att === 'AVOIDANT' &&
    (decoded.txMode === TX_MODE.ATTACHMENT || decoded.txMode === TX_MODE.RAGE);

  if (pursuitRisk) {
    return {
      receivable:    false,
      reason:        BUFFER_REASON.PURSUIT_RISK,
      bufferContent: decoded,
      render:        null,
      note:          'Receiver is avoidant — sending this mode will increase withdrawal. Hold content, reduce intensity, create space.',
    };
  }

  // ── Cultural calibration ──────────────────────────────────────────────────
  const calibrated = calibrateCultural(converted, lang, decoded.txMode);

  return {
    receivable:    true,
    reason:        null,
    bufferContent: null,
    render:        calibrated,
    convertedFrom: decoded.txMode,
    convertedTo:   grammar,
    bandwidth:     bw,
  };
}

function compressToWidth(decoded, bandwidth) {
  // Reduce signal complexity to match available bandwidth
  switch (bandwidth) {
    case BANDWIDTH.FULL:
      // No compression — full signal
      return { ...decoded, compressed: false };

    case BANDWIDTH.MODERATE:
      // Strip framework assertions and nuance — core message + need only
      return {
        ...decoded,
        frameworkAssertion: null,
        coreMessage: decoded.coreMessage,
        compressed: true,
        compressionNote: 'Framework context stripped — window reduced',
      };

    case BANDWIDTH.REDUCED:
      // Strip everything except core message and primary need
      return {
        ...decoded,
        frameworkAssertion: null,
        bidType:            null,
        intent:             null,
        coreMessage:        extractEssential(decoded),
        compressed:         true,
        compressionNote:    'Single-layer signal — emotional acknowledgment only',
      };

    case BANDWIDTH.MINIMAL:
      // One sentence maximum — presence before content
      return {
        ...decoded,
        coreMessage:        'I am here. You are not alone.',
        primaryNeed:        decoded.primaryNeed,
        compressed:         true,
        compressionNote:    'Minimal bandwidth — presence only, no content transmission',
      };

    default:
      return decoded;
  }
}

function extractEssential(decoded) {
  // Distill to the single most receivable sentence
  const need = decoded.primaryNeed?.toLowerCase();
  const emo  = decoded.rawEmotion?.toLowerCase();
  if (emo && need) return `Something ${emo} is here. The need underneath it is ${need}.`;
  if (emo)         return `Something ${emo} is here.`;
  if (need)        return `The need here is ${need}.`;
  return 'Something important is being communicated.';
}

function convertMode(signal, fromMode, toGrammar) {
  // Convert sender's mode to a form receivable by the receiver's grammar
  // This is the "mode converter" — preserves the signal, changes the transmission mode

  const need    = signal.primaryNeed?.toLowerCase() ?? 'something important';
  const emotion = signal.rawEmotion?.toLowerCase()  ?? 'an emotion';
  const distress = signal.distress ?? 0.5;

  // Mode conversion matrix — from mode → to grammar

  // RAGE → anything
  if (fromMode === TX_MODE.RAGE) {
    switch (toGrammar) {
      case GRAMMAR.EMOTIONAL_FIRST:
        return { ...signal, _rendered: modeConversion(
          fromMode, toGrammar,
          `There is real pain underneath this. The anger is a signal that something important isn't being received. Beneath the attack is the need: ${need}.`,
          `Before the content can land — acknowledge that something feels unfair or disrespected.`
        )};
      case GRAMMAR.LOGICAL_FIRST:
        return { ...signal, _rendered: modeConversion(
          fromMode, toGrammar,
          `The transmission is arriving in attack mode. What is actually being communicated: an unmet need for ${need}. The anger is the delivery system, not the message.`,
          `Engage the need directly — not the attack.`
        )};
      case GRAMMAR.SOMATIC_FIRST:
        return { ...signal, _rendered: modeConversion(
          fromMode, toGrammar,
          `High activation is present. The body is carrying something. Don't respond to the words — respond to the energy underneath them.`,
          `Move slower. Lower your own energy first.`
        )};
      case GRAMMAR.SPACE_FIRST:
        return { ...signal, _rendered: modeConversion(
          fromMode, toGrammar,
          `High-intensity transmission. Receiving this mode directly will likely increase distance. Create space before any response.`,
          `Don't respond directly. Let it settle. Respond to the need once the mode has deescalated.`
        )};
      case GRAMMAR.PRESENCE_FIRST:
        return { ...signal, _rendered: modeConversion(
          fromMode, toGrammar,
          `There is a lot of pain here. I am here. I am not leaving.`,
          `Don't explain, justify, or respond to the words. Just be present.`
        )};
      default:
        return { ...signal, _rendered: modeConversion(fromMode, toGrammar, `Underneath this is: ${need}.`, `Acknowledge before responding.`) };
    }
  }

  // SILENCE → anything
  if (fromMode === TX_MODE.SILENCE) {
    const silenceCore = signal.coreMessage ?? 'Something is being communicated in the silence.';
    switch (toGrammar) {
      case GRAMMAR.LOGICAL_FIRST:
        return { ...signal, _rendered: modeConversion(fromMode, toGrammar,
          `This silence has a specific structure: ${silenceCore}. It is not absence — it is signal.`,
          `Do not interpret the silence through your own frame. Ask, very gently, if anything is needed.`
        )};
      case GRAMMAR.SPACE_FIRST:
        return { ...signal, _rendered: modeConversion(fromMode, toGrammar,
          `The silence is communicating. The most receivable response: honor it. Be present without pursuing.`,
          `Do not fill the silence.`
        )};
      default:
        return { ...signal, _rendered: modeConversion(fromMode, toGrammar,
          silenceCore,
          `Respond to the silence, not the absence of words.`
        )};
    }
  }

  // SOMATIC → cognitive/logical receivers
  if (fromMode === TX_MODE.SOMATIC &&
      (toGrammar === GRAMMAR.LOGICAL_FIRST || toGrammar === GRAMMAR.COGNITIVE)) {
    return { ...signal, _rendered: modeConversion(fromMode, toGrammar,
      `Pre-verbal signal active. The body is speaking before words are available. The underlying signal: ${emotion} present, need: ${need}. Words will follow the felt sense — don't rush the translation.`,
      `Don't ask for explanation. Ask if it's okay to be close, or just be close.`
    )};
  }

  // REPAIR → avoidant
  if (fromMode === TX_MODE.REPAIR && toGrammar === GRAMMAR.SPACE_FIRST) {
    return { ...signal, _rendered: modeConversion(fromMode, toGrammar,
      `Repair bid incoming. Avoidant grammar: space must be established before repair can be received. The repair is real — the timing is wrong. Hold the content.`,
      `Create space first. The repair can land later.`
    )};
  }

  // Default passthrough — signal intact, no mode conversion needed
  return { ...signal, _rendered: null };
}

function modeConversion(from, to, transcoded, instruction) {
  return { from, to, transcoded, instruction, ts: ts() };
}

function calibrateCultural(signal, lang, txMode) {
  if (!lang?.language || lang.language === 'ANGLO_AMERICAN') return signal;

  const notes = {
    JAPANESE: {
      SILENCE: 'In this cultural frame, silence may carry respect and processing — not avoidance.',
      DEFAULT: 'Indirect communication is sophistication here. Directness may land as aggression.',
    },
    ARABIC: {
      RAGE:    'Higher vocal amplitude is baseline expressivity — not escalation. Calibrate intensity interpretation.',
      DEFAULT: 'Emotional expressivity is relational investment here, not dysregulation.',
    },
    SCANDINAVIAN: {
      DEFAULT: 'Direct communication is respect in this frame. Brevity and low affect are not coldness.',
    },
    EAST_ASIAN: {
      DEFAULT: 'Face-preservation is structural here. Direct challenge to position may be received as attack.',
    },
    LATIN_AMERICAN: {
      DEFAULT: 'Physical and vocal warmth is connection norm — not intrusion.',
    },
  };

  const langNotes = notes[lang.language];
  const note = langNotes?.[txMode] ?? langNotes?.DEFAULT;

  return { ...signal, culturalCalibration: note ?? null };
}

// ─── Layer 5: RENDER — output in the right modality ──────────────────────────

function render(transcoded, decoded, receiver, sharedReferent) {
  if (!transcoded.receivable) {
    return {
      modality:    RENDER_MOD.BUFFER,
      what:        null,
      how:         null,
      timing:      'Hold — do not transmit now.',
      bufferNote:  transcoded.note ?? `Held: ${transcoded.reason}`,
      sharedReferent: sharedReferent ?? null,
    };
  }

  const bw      = transcoded.bandwidth;
  const grammar = receiver.grammar;
  const conv    = transcoded.render?._rendered;

  // ── Modality ──────────────────────────────────────────────────────────────
  const modality = bw === BANDWIDTH.MINIMAL ? RENDER_MOD.PRESENCE
    : bw === BANDWIDTH.REDUCED             ? RENDER_MOD.TONE
    : RENDER_MOD.WORDS;

  // ── What to say ───────────────────────────────────────────────────────────
  let what;
  if (conv) {
    what = conv.transcoded;
  } else {
    what = generateWords(decoded, receiver, grammar);
  }

  // ── How to say it ─────────────────────────────────────────────────────────
  const how  = generateHowToDeliver(decoded, receiver, bw);
  const timing = generateTiming(decoded, receiver);

  // ── What not to say ───────────────────────────────────────────────────────
  const notThis = generateWhatNot(decoded, receiver);

  // ── Instruction (if mode conversion happened) ─────────────────────────────
  const instruction = conv?.instruction ?? null;

  return {
    modality,
    what,
    how,
    timing,
    notThis,
    instruction,
    bandwidth:      bw,
    grammar:        grammar,
    sharedReferent: sharedReferent ?? null,
    modeConverted:  !!conv,
    convertedFrom:  transcoded.convertedFrom ?? null,
    convertedTo:    transcoded.convertedTo   ?? null,
    culturalNote:   transcoded.render?.culturalCalibration ?? null,
    distressLevel:  decoded.distress,
    signalIntegrity:decoded.signalIntegrity,
  };
}

function generateWords(decoded, receiver, grammar) {
  const need    = decoded.primaryNeed?.toLowerCase()  ?? 'something important';
  const emo     = decoded.rawEmotion?.toLowerCase()   ?? 'something';
  const txMode  = decoded.txMode;
  const att     = receiver.att?.pattern;

  switch (grammar) {
    case GRAMMAR.PRESENCE_FIRST:
      return `"I'm here. You don't have to do anything right now."`;

    case GRAMMAR.SOMATIC_FIRST:
      return `[Move closer / make contact] — then: "I'm with you."`;

    case GRAMMAR.EMOTIONAL_FIRST:
      return txMode === TX_MODE.REPAIR
        ? `"I want to come back to you. I miss us."`
        : `"That sounds like it carries a lot of ${emo}. I'm here."`;

    case GRAMMAR.LOGICAL_FIRST:
      return txMode === TX_MODE.RAGE
        ? `"I hear that something is really important here. Help me understand what's not working."`
        : `"What I'm hearing is that your need for ${need} isn't being met. Is that right?"`;

    case GRAMMAR.SPACE_FIRST:
      return `"I'm here. Take the space you need. I'm not going anywhere."`;

    case GRAMMAR.NEED_FIRST:
      return `"Your need for ${need} is completely valid. What would actually help right now?"`;

    case GRAMMAR.NARRATIVE_FIRST:
      return `"Tell me more about what's been happening. I want to understand the whole picture."`;

    default:
      return `"I'm listening. I'm here."`;
  }
}

function generateHowToDeliver(decoded, receiver, bw) {
  const nsState = receiver.ns?.polyvagalState ?? 'VENTRAL';
  const att     = receiver.att?.pattern;
  const distress = decoded.distress;

  const instructions = [];

  if (bw === BANDWIDTH.MINIMAL)   instructions.push('Voice soft, slow, low. Presence over words.');
  if (bw === BANDWIDTH.REDUCED)   instructions.push('One sentence only. Slow delivery. Pause after.');
  if (distress > 0.7)             instructions.push('Lower your own energy first before speaking.');
  if (nsState === 'FREEZE')       instructions.push('Stillness. No sudden movements. Quiet, warm presence.');
  if (att === 'ANXIOUS')          instructions.push('Steady eye contact. Calm, unhurried. Reassure physically if welcomed.');
  if (att === 'AVOIDANT')         instructions.push('No pursuit. Side-by-side rather than face-to-face if possible. Low intensity.');
  if (att === 'DISORGANIZED')     instructions.push('Slow. Predictable. No sudden changes. Establish ground before contact.');
  if (decoded.txMode === TX_MODE.RAGE) instructions.push('Absorb without reacting. Let the energy move through the room before responding.');

  return instructions.length ? instructions.join(' / ') : 'Natural, warm, present.';
}

function generateTiming(decoded, receiver) {
  const gap  = receiver.gap?.type;
  const bw   = receiver.bandwidth;
  const dist = decoded.distress;

  if (bw === BANDWIDTH.OFFLINE)   return 'Do not transmit. Wait for window to open.';
  if (gap === 'FLOODING')         return 'Wait minimum 20 minutes. Do not approach yet.';
  if (gap === 'FREEZE')           return 'No timing — just stillness. Let them come back.';
  if (gap === 'NEEDING_SPACE')    return 'Honor the space. Approach only when invited.';
  if (dist > 0.75)                return 'Let activation reduce before content. Wait for the exhale.';
  if (bw === BANDWIDTH.MINIMAL)   return 'Now — presence only. Content later.';
  if (bw === BANDWIDTH.REDUCED)   return 'Now — brief. One sentence. Then wait.';
  return 'Now — full window is open.';
}

function generateWhatNot(decoded, receiver) {
  const nots     = [];
  const nsState  = receiver.ns?.polyvagalState ?? 'VENTRAL';
  const zone     = receiver.ns?.windowZone ?? 'WINDOW';
  const att      = receiver.att?.pattern;
  const txMode   = decoded.txMode;
  const distress = decoded.distress;

  if (zone === 'HYPER' || distress > 0.7)  nots.push('Escalating your own intensity');
  if (zone === 'HYPER')                    nots.push('"We need to resolve this now"');
  if (nsState === 'DORSAL')                nots.push('Any complex content — system is offline');
  if (txMode === TX_MODE.FLOODING)         nots.push('"Why won\'t you talk to me?"');
  if (att === 'AVOIDANT')                  nots.push('Pursuing — each pursuit increases withdrawal');
  if (att === 'ANXIOUS')                   nots.push('Leaving without reassurance of return time');
  if (att === 'DISORGANIZED')              nots.push('Sudden changes, raising intensity, removing safety signals');
  if (txMode === TX_MODE.RAGE)             nots.push('Defending, counter-attacking, explaining your position');
  if (decoded.frameworkAssertion?.type === 'CONDITIONAL_LOVE')
                                           nots.push('Proving or disproving the condition — name the fear beneath it instead');

  return nots.join(' / ') || 'None — window is clear.';
}

// ─── Shared Referent Engine ───────────────────────────────────────────────────
// Find what both people are actually pointing at that they don't know they share.
// Two people arguing about dishes are both pointing at "I don't feel seen."
// The Rosetta Stone: find the text that both systems are encoding.

function findSharedReferent(decodedA, decodedB) {
  if (!decodedA || !decodedB) return null;

  const needA = decodedA.primaryNeed;
  const needB = decodedB.primaryNeed;
  const emoA  = decodedA.rawEmotion;
  const emoB  = decodedB.rawEmotion;
  const fwkA  = decodedA.frameworkAssertion?.type;
  const fwkB  = decodedB.frameworkAssertion?.type;

  const referents = [];
  let confidence  = 0;

  // Shared need (same need, different modes)
  if (needA && needB && needA === needB) {
    referents.push(`Both are carrying the same unmet need: **${needA.toLowerCase()}**. Different transmission modes — same signal.`);
    confidence += 0.5;
  }

  // Mirror-image emotional state (both in pain, different expressions)
  const painEmotions = new Set(['GRIEF','FEAR','SHAME','RAGE','PANIC']);
  if (painEmotions.has(emoA) && painEmotions.has(emoB)) {
    referents.push(`Both are in pain. ${emoA} and ${emoB} are different forms of the same underlying distress state.`);
    confidence += 0.3;
  }

  // Same framework assertion (both asserting the same implicit model)
  if (fwkA && fwkB && fwkA === fwkB) {
    referents.push(`Both are operating from the same framework: **${fwkA.replace(/_/g,' ').toLowerCase()}**. They are not in conflict — they are in mirror.`);
    confidence += 0.4;
  }

  // Attack/defense cycle — both transmitting in modes that block reception
  if (decodedA.txMode === TX_MODE.RAGE && decodedB.txMode === TX_MODE.SILENCE) {
    referents.push(`Demand-withdraw cycle active. Both are trying to be seen — one through pursuit, one through withdrawal. Neither mode is receivable by the other. The shared referent: both feel disconnected and are trying to reestablish contact.`);
    confidence += 0.5;
  }

  if (decodedA.txMode === TX_MODE.REPAIR && decodedB.txMode === TX_MODE.SILENCE) {
    referents.push(`Repair attempt meets withdrawal. Both want to reconnect — the modes are passing through each other without contact. The shared referent: the desire to close the gap.`);
    confidence += 0.45;
  }

  // Attachment mirror (anxious pursuing avoidant pursuing avoidant's need for space)
  const attA = decodedA.attachmentPattern;
  const attB = decodedB.attachmentPattern;
  if (attA === 'ANXIOUS' && attB === 'AVOIDANT') {
    referents.push(`Anxious-avoidant dynamic active. Person A's pursuit triggers Person B's withdrawal. Person B's withdrawal triggers Person A's pursuit. Both want connection — their strategies for getting it are mutually activating. The shared referent: both are trying to feel safe.`);
    confidence += 0.45;
  }

  if (!referents.length) return null;

  return {
    referents,
    confidence: r4(Math.min(1, confidence)),
    surfacedAt:  ts(),
    recommendation: referents.length
      ? `Name the shared referent directly: "${referents[0].replace(/\*\*/g,'').split('.')[0]}"`
      : null,
  };
}

// ─── Temporal Buffer ──────────────────────────────────────────────────────────
// Hold transmissions that are real but untransmittable right now.
// Tagged for delivery when the window opens.

class TemporalBuffer {
  constructor(maxItems = 20) {
    this._items  = [];
    this._max    = maxItems;
    this._onRelease = null;
  }

  hold(decoded, reason, senderBandwidth, receiverBandwidth) {
    if (this._items.length >= this._max) this._items.shift(); // drop oldest
    const item = {
      id:               `buf-${ts()}-${Math.random().toString(36).slice(2,6)}`,
      decoded,
      reason,
      heldAt:           ts(),
      senderBandwidth,
      receiverBandwidth,
      deliveryAttempts: 0,
    };
    this._items.push(item);
    return item;
  }

  // Check if any held items are now deliverable
  checkReleasable(receiver) {
    const bw = receiver.bandwidth;
    if (bw === BANDWIDTH.OFFLINE || bw === BANDWIDTH.MINIMAL) return [];

    const releasable = this._items.filter(item => {
      if (item.reason === BUFFER_REASON.FLOODING       && bw !== BANDWIDTH.FULL)    return false;
      if (item.reason === BUFFER_REASON.RECEIVER_OFFLINE)                           return bw !== BANDWIDTH.OFFLINE;
      if (item.reason === BUFFER_REASON.PURSUIT_RISK   && receiver.att?.pattern === 'AVOIDANT') return false;
      return true;
    });

    // Remove from buffer
    this._items = this._items.filter(i => !releasable.includes(i));
    return releasable;
  }

  get size() { return this._items.length; }
  get items() { return [...this._items]; }
}

// ─── XLATBridge — main module ─────────────────────────────────────────────────

export class XLATBridge {
  static UUID    = XLATBRIDGE_UUID;
  static VERSION = XLATBRIDGE_VERSION;

  constructor({ bus, sessionId = null } = {}) {
    if (!bus) throw new Error('[XLATBridge §1.2] bus is required');

    this._bus       = bus;
    this._sessionId = sessionId;

    this._persons   = {
      A: blankPersonState('A'),
      B: blankPersonState('B'),
    };

    // Per-direction temporal buffers
    this._buffers   = {
      AtoB: new TemporalBuffer(),
      BtoA: new TemporalBuffer(),
    };

    // Rolling decoded signal windows for shared referent tracking
    this._decodedWindows = {
      A: new SlidingWindow(10),
      B: new SlidingWindow(10),
    };

    // Translation history
    this._history   = [];
    this._frame     = 0;

    this._active    = false;
  }

  start() {
    const b = this._bus;

    // ── Ingest person state (single-person mode: prefix A/B not required) ─────
    // In single-person mode: A = primary speaker. B state inferred from second bus or absent.
    // In dyadic mode: events prefixed with alk.htl.A.* and alk.htl.B.*

    const bindPerson = (id, prefix) => {
      b.on(`${prefix}.ns.state`,          ev => this._update(id, 'ns',         ev.payload ?? ev));
      b.on(`${prefix}.emo.state`,         ev => this._update(id, 'emo',        ev.payload ?? ev));
      b.on(`${prefix}.need.state`,        ev => this._update(id, 'need',       ev.payload ?? ev));
      b.on(`${prefix}.att.state`,         ev => this._update(id, 'att',        ev.payload ?? ev));
      b.on(`${prefix}.cog.profile`,       ev => this._update(id, 'cog',        ev.payload ?? ev));
      b.on(`${prefix}.lang.detected`,     ev => this._update(id, 'lang',       ev.payload ?? ev));
      b.on(`${prefix}.som.gap`,           ev => this._update(id, 'som',        ev.payload ?? ev));
      b.on(`${prefix}.gap.detected`,      ev => this._update(id, 'gap',        ev.payload ?? ev));
      b.on(`${prefix}.translation`,       ev => this._update(id, 'xlat',       ev.payload ?? ev));
    };

    // Bind HTL module outputs (primary speaker = A)
    bindPerson('A', 'alk.htl');

    // Bind dyadic B-prefixed if available
    bindPerson('A', 'alk.htl.A');
    bindPerson('B', 'alk.htl.B');

    // Transcript — triggers translate
    b.on('alk.verbal.transcript', ev => {
      const p = ev.payload ?? ev;
      this._update('A', 'transcript', p);
      this._onNewTransmission('A');
    });

    // Tone — enhance decode
    b.on('alk.verbal.analysis.tone', ev => {
      this._update('A', 'tone', ev.payload ?? ev);
    });

    // ASE updates
    b.on('ase.signature.updated', ev => {
      const p = ev.payload ?? ev;
      const id = p.person ?? 'A';
      this._update(id, 'ase', p);
    });

    // Relational events trigger retranslation
    b.on('alk.rel.bid.detected',     () => this._onNewTransmission('A'));
    b.on('alk.rel.rupture.detected', () => this._onNewTransmission('A'));
    b.on('alk.rel.repair.attempt',   () => this._onNewTransmission('A'));

    // IRS gap events (may change receivability)
    b.on('irs.gap.detected', ev => {
      this._update('A', 'gap', ev.payload ?? ev);
      this._checkBufferRelease('B');
    });

    // Kernel pulse — periodic buffer check + pulse translation
    b.on('alk.kernel.pulse', () => {
      this._frame++;
      if (this._frame % 30 === 0) this._checkBufferRelease('A');
      if (this._frame % 30 === 0) this._checkBufferRelease('B');
      if (this._frame % 60 === 0) this._onNewTransmission('A');
    });

    this._active = true;
    this._bus.emit('xlat.bridge.ready', {
      uuid:    XLATBRIDGE_UUID,
      version: XLATBRIDGE_VERSION,
      ts:      ts(),
    });
  }

  // ── Update person state ───────────────────────────────────────────────────

  _update(personId, key, value) {
    const person = this._persons[personId];
    if (!person) return;
    receive(person, { [key]: value });
    profileReceiver(person); // re-derive bandwidth/grammar on every update
  }

  // ── Main translation pipeline ─────────────────────────────────────────────

  _onNewTransmission(senderId) {
    const receiverId = senderId === 'A' ? 'B' : 'A';
    const sender     = this._persons[senderId];
    const receiver   = this._persons[receiverId];

    // Need at least NS or EMO to decode
    if (!sender.ns && !sender.emo && !sender.transcript) return;

    // [2] Decode
    const decoded = decode(sender);
    this._decodedWindows[senderId].push(decoded);

    // [3] Profile receiver (already done on update, but refresh)
    profileReceiver(receiver);

    // [4] Transcode
    const transcoded = transcode(decoded, receiver);

    // ── Shared referent ────────────────────────────────────────────────────
    const lastDecodedB = this._decodedWindows[receiverId].last();
    const sharedReferent = findSharedReferent(decoded, lastDecodedB);

    if (sharedReferent && sharedReferent.confidence > 0.50) {
      this._bus.emit('xlat.bridge.shared_referent', {
        between:    [senderId, receiverId],
        referents:  sharedReferent.referents,
        confidence: sharedReferent.confidence,
        recommendation: sharedReferent.recommendation,
        ts:         ts(),
      });
    }

    // ── Handle irrecoverable / buffered ────────────────────────────────────
    if (!transcoded.receivable) {
      const bufKey = `${senderId}to${receiverId}`;
      const held   = this._buffers[bufKey]?.hold(
        decoded,
        transcoded.reason,
        sender.bandwidth,
        receiver.bandwidth,
      );

      this._bus.emit('xlat.bridge.buffer.held', {
        sender:   senderId,
        receiver: receiverId,
        reason:   transcoded.reason,
        note:     transcoded.note ?? null,
        itemId:   held?.id,
        bufferSize: this._buffers[bufKey]?.size,
        ts:       ts(),
      });

      // Still emit bandwidth state change
      this._bus.emit('xlat.bridge.bandwidth.update', {
        person:    receiverId,
        bandwidth: receiver.bandwidth,
        capacity:  receiver.capacity,
        ts:        ts(),
      });

      return;
    }

    // [5] Render
    const rendered = render(transcoded, decoded, receiver, sharedReferent);

    // ── Mode conversion event ──────────────────────────────────────────────
    if (rendered.modeConverted) {
      this._bus.emit('xlat.bridge.mode.converted', {
        sender:   senderId,
        receiver: receiverId,
        from:     rendered.convertedFrom,
        to:       rendered.convertedTo,
        ts:       ts(),
      });
    }

    // ── Full transmission event ────────────────────────────────────────────
    const transmission = {
      sender:         senderId,
      receiver:       receiverId,
      decoded:        {
        coreMessage:       decoded.coreMessage,
        primaryNeed:       decoded.primaryNeed,
        txMode:            decoded.txMode,
        distress:          decoded.distress,
        signalIntegrity:   decoded.signalIntegrity,
        frameworkAssertion:decoded.frameworkAssertion,
        bidType:           decoded.bidType,
        attachmentPattern: decoded.attachmentPattern,
        intent:            decoded.intent,
      },
      transcoded:     {
        receivable:    transcoded.receivable,
        bandwidth:     transcoded.bandwidth,
        grammar:       transcoded.convertedTo,
        modeConverted: rendered.modeConverted,
      },
      rendered:       {
        modality:      rendered.modality,
        what:          rendered.what,
        how:           rendered.how,
        timing:        rendered.timing,
        notThis:       rendered.notThis,
        instruction:   rendered.instruction,
        culturalNote:  rendered.culturalNote,
      },
      sharedReferent:  sharedReferent ?? null,
      receiverState:  {
        bandwidth:     receiver.bandwidth,
        grammar:       receiver.grammar,
        capacity:      receiver.capacity,
        nsState:       receiver.ns?.polyvagalState ?? null,
        windowZone:    receiver.ns?.windowZone     ?? null,
      },
      ts: ts(),
    };

    // Store history
    this._history.push(transmission);
    if (this._history.length > 200) this._history.shift();

    // Emit per-receiver render
    this._bus.emit(`xlat.bridge.render.${receiverId}`, transmission);

    // Emit general transmission
    this._bus.emit('xlat.bridge.transmission', transmission);
  }

  // ── Buffer release check ──────────────────────────────────────────────────

  _checkBufferRelease(receiverId) {
    const senderId = receiverId === 'A' ? 'B' : 'A';
    const bufKey   = `${senderId}to${receiverId}`;
    const buffer   = this._buffers[bufKey];
    if (!buffer || buffer.size === 0) return;

    const receiver   = this._persons[receiverId];
    const releasable = buffer.checkReleasable(receiver);

    if (releasable.length) {
      this._bus.emit('xlat.bridge.window.open', {
        receiver:     receiverId,
        bandwidth:    receiver.bandwidth,
        releasing:    releasable.length,
        ts:           ts(),
      });

      for (const item of releasable) {
        const transcoded = transcode(item.decoded, receiver);
        if (transcoded.receivable) {
          const lastDecoded = this._decodedWindows[senderId].last();
          const ref         = findSharedReferent(item.decoded, lastDecoded);
          const rendered    = render(transcoded, item.decoded, receiver, ref);

          this._bus.emit(`xlat.bridge.render.${receiverId}`, {
            sender:          senderId,
            receiver:        receiverId,
            fromBuffer:      true,
            originalHeldAt:  item.heldAt,
            heldReason:      item.reason,
            decoded:         item.decoded,
            rendered,
            ts:              ts(),
          });

          this._bus.emit('xlat.bridge.buffer.released', {
            itemId:   item.id,
            receiver: receiverId,
            reason:   item.reason,
            ts:       ts(),
          });
        }
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  // Inject B-person state directly (for dyadic mode via second bus)
  setPersonBState(partialState) {
    Object.assign(this._persons.B, partialState);
    profileReceiver(this._persons.B);
  }

  // Get latest buffer status
  getBufferStatus() {
    return {
      AtoB: this._buffers.AtoB.size,
      BtoA: this._buffers.BtoA.size,
      AtoB_items: this._buffers.AtoB.items.map(i => ({
        id:     i.id,
        reason: i.reason,
        age_ms: ts() - i.heldAt,
        need:   i.decoded.primaryNeed,
        mode:   i.decoded.txMode,
      })),
      BtoA_items: this._buffers.BtoA.items.map(i => ({
        id:     i.id,
        reason: i.reason,
        age_ms: ts() - i.heldAt,
        need:   i.decoded.primaryNeed,
        mode:   i.decoded.txMode,
      })),
    };
  }

  getPersonState(id)  { return this._persons[id]  ?? null; }
  getHistory(n = 20)  { return this._history.slice(-n); }
  get isActive()      { return this._active; }

  // ── Direct translation API (no bus required) ──────────────────────────────
  // For testing or one-shot translation without full wiring.
  translate(senderState, receiverState) {
    const sender   = { ...blankPersonState('S'), ...senderState };
    const receiver = { ...blankPersonState('R'), ...receiverState };
    profileReceiver(receiver);
    const decoded    = decode(sender);
    const transcoded = transcode(decoded, receiver);
    const ref        = null;
    const rendered   = render(transcoded, decoded, receiver, ref);
    return { decoded, transcoded, rendered };
  }
}

// ─── Factory (ALK kernel compatible) ─────────────────────────────────────────

export function createXLATBridge({ bus, sessionId } = {}) {
  const bridge = new XLATBridge({ bus, sessionId });
  return bridge;
}
