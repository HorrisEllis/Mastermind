/**
 * @spatial/kernel — species/human.js
 * Equine species profile.
 *
 * §CS1 — same 5D latent mathematics as human.
 * §CS2 — suppression layer disabled. Signal IS state.
 *         A horse in distress is not performing distress.
 *         What the sensor reads is what is there.
 * §CS3 — cross-species field is first-class.
 *
 * Behavioral signal vocabulary derived from:
 * — Equine ethology literature (McGreevy, Waran, Henshall)
 * — Ridden Horse Pain Ethogram (Dyson et al.)
 * — ISES Pain Face (Dalla Costa et al.)
 */

export const EQUINE_PROFILE = Object.freeze({
  id:      'equine',
  version: '1.0.0',

  axes: {
    // Same 5D space. Different resolution — equine arousal changes faster.
    valence:     { range: [-1,1], resolution: 0.02 },
    arousal:     { range: [-1,1], resolution: 0.02 },
    suppression: { range: [0,1],  resolution: 0.05 },  // minimal — see §CS2
    coherence:   { range: [0,1],  resolution: 0.02 },
    engagement:  { range: [0,1],  resolution: 0.02 },
  },

  signalVocab: [
    // ears — highest information density in equine signal
    'ear.forward',        // attention/engagement
    'ear.back',           // threat/pain/submission
    'ear.asymmetric',     // split attention — processing conflict
    'ear.flat',           // high threat or pain
    'ear.relaxed',        // mobile, neutral

    // eyes
    'eye.white-sclera',   // fear/threat response
    'eye.soft',           // relaxed/safe
    'eye.tense-orbital',  // pain or threat
    'eye.unfocused',      // dissociation or fatigue

    // muzzle / mouth
    'muzzle.tight',       // tension
    'muzzle.relaxed',
    'lick.chew',          // parasympathetic activation — processing, coming down
    'yawn',               // tension release OR fatigue
    'teeth.grinding',     // chronic tension / pain

    // nostrils
    'nostril.flare',      // arousal
    'nostril.relaxed',

    // head / neck
    'head.high',          // arousal, threat scanning
    'head.low',           // relaxation OR submission OR fatigue
    'head.toss',          // irritation, discomfort
    'neck.tense',
    'neck.relaxed',

    // tail
    'tail.raised',        // excitement / arousal
    'tail.clamped',       // fear, pain, submission
    'tail.swish',         // irritation, fly response — context-dependent
    'tail.relaxed',

    // body
    'posture.hollow',     // bracing, pain, tension
    'posture.engaged',    // forward, willing
    'posture.freeze',     // threat response — prey animal primary defense
    'posture.camped-out', // pain, exhaustion
    'weight.shift',       // discomfort
    'foot.stamp',         // irritation
    'skin.twitch',        // fly response OR nervous system activation

    // regulation
    'regulation.snort',   // clearing — parasympathetic
    'regulation.blow',    // exhale — coming down from arousal
    'regulation.graze',   // ground behavior — regulatory
  ],

  suppressionLayer:    false,  // §CS2 — no social performance layer
  culturalCalibration: false,
  attachmentGrammar:   false,  // different bonding architecture
  cognitiveMode:       false,
  temporalProcessing:  false,

  // Equine-specific parameters
  arousalDecay:        0.15,  // arousal drops slower than humans — they stay activated
  freezeThreshold:     0.75,  // arousal level that triggers freeze response
  trustRadius:         0.3,   // attractor basin radius for bonded-state
  flightBias:          0.6,   // baseline threat-sensitivity (prey animal)

  // Bandwidth map — same levels, equine-calibrated thresholds
  bandwidth: {
    FULL:     { arousalMax: 0.3,  desc: 'Relaxed, engaged, fully receptive' },
    MODERATE: { arousalMax: 0.5,  desc: 'Mild arousal, directive signals receivable' },
    REDUCED:  { arousalMax: 0.7,  desc: 'Elevated arousal — somatic presence only' },
    MINIMAL:  { arousalMax: 0.85, desc: 'High arousal — stillness only' },
    OFFLINE:  { arousalMax: 1.0,  desc: 'Freeze or flight — nothing receivable' },
  },

  // Cross-species field note
  fieldNote: `
    An attuned human-equine pair shows measurable synchrony.
    The horse mirrors the human's nervous system state — and vice versa.
    A regulated human brings a horse down.
    A dysregulated human activates a horse — often before the human
    is consciously aware of their own state.
    The horse reads what the human cannot hide.
    @spatial/field maps this field.
  `.trim(),
});
