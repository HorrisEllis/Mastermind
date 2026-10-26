/**
 * @spatial/kernel — species/human.js
 * Default human species profile.
 * §CS1 — species-agnostic mathematics. This is the reference implementation.
 */

export const HUMAN_PROFILE = Object.freeze({
  id:      'human',
  version: '1.0.0',

  axes: {
    valence:     { range: [-1,1], resolution: 0.01 },
    arousal:     { range: [-1,1], resolution: 0.01 },
    suppression: { range: [0,1],  resolution: 0.01 },
    coherence:   { range: [0,1],  resolution: 0.01 },
    engagement:  { range: [0,1],  resolution: 0.01 },
  },

  signalVocab: [
    // hands
    'gesture.point','gesture.wave','gesture.self-touch','gesture.mirror',
    'gesture.grip','gesture.reach','gesture.open-palm','gesture.wrist-rotation',
    // face
    'face.gaze.left','face.gaze.right','face.gaze.down','face.gaze.averted',
    'face.brow.raise','face.brow.furrow','face.jaw.tension',
    'face.nostril.flare','face.blink.soft','face.micro-expression',
    // posture
    'posture.collapsed','posture.lean-in','posture.open','posture.protective',
    'posture.grounded','posture.shoulder-drop',
    // regulation
    'regulation.self-soothing','regulation.grounding','regulation.breath',
    // social
    'social.mirroring','social.synchrony','social.repair-bid',
  ],

  suppressionLayer:      true,   // humans suppress signal from state
  culturalCalibration:   true,
  attachmentGrammar:     true,
  cognitiveMode:         true,
  temporalProcessing:    true,
});
