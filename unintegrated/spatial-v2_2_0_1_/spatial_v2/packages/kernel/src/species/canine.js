/**
 * @spatial/kernel — species/canine.js
 * Canine species profile.
 * §CS1 §CS2 §CS3
 *
 * Behavioral signal vocabulary derived from:
 * — Canine Body Language (Rugaas, Braastad)
 * — Calming signals research (Rugaas)
 * — CBSB (Canine Behavioral Signal Battery, internal)
 */

export const CANINE_PROFILE = Object.freeze({
  id:      'canine',
  version: '1.0.0',

  axes: {
    valence:     { range: [-1,1], resolution: 0.02 },
    arousal:     { range: [-1,1], resolution: 0.02 },
    suppression: { range: [0,1],  resolution: 0.05 },
    coherence:   { range: [0,1],  resolution: 0.02 },
    engagement:  { range: [0,1],  resolution: 0.02 },
  },

  signalVocab: [
    // ears
    'ear.forward','ear.back','ear.flat','ear.relaxed',
    // eyes
    'eye.soft','eye.hard','eye.whale','eye.squint',
    // mouth
    'mouth.open-relaxed','mouth.closed-tense','mouth.pant',
    'lick.lips','yawn',
    'teeth.show.submissive','teeth.show.offensive',
    // tail
    'tail.high-stiff','tail.mid-wag','tail.low-wag',
    'tail.tucked','tail.relaxed',
    // body
    'posture.forward-stiff','posture.crouched',
    'posture.play-bow','posture.roll-over',
    'piloerection.full','piloerection.partial',
    // calming signals (Rugaas)
    'calming.nose-lick','calming.look-away',
    'calming.sniff-ground','calming.turn-away',
    'calming.sit','calming.walk-arc',
    // arousal
    'arousal.bark','arousal.growl','arousal.whine',
    'arousal.spin','arousal.zoomies',
  ],

  suppressionLayer:    false,
  culturalCalibration: false,
  attachmentGrammar:   true,   // dogs do have attachment bonds — uniquely cross-species
  cognitiveMode:       false,
  temporalProcessing:  false,

  arousalDecay:     0.2,
  freezeThreshold:  0.8,
  trustRadius:      0.25,

  bandwidth: {
    FULL:     { arousalMax: 0.35, desc: 'Relaxed, receptive, engaged' },
    MODERATE: { arousalMax: 0.55, desc: 'Alert, directive receivable' },
    REDUCED:  { arousalMax: 0.72, desc: 'Aroused — calming signals only' },
    MINIMAL:  { arousalMax: 0.88, desc: 'High stress — presence only' },
    OFFLINE:  { arousalMax: 1.0,  desc: 'Shutdown or redirect — nothing lands' },
  },
});
