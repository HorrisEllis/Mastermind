/**
 * @spatial/bridge — species/equine-profile.js
 * XLAT receiver profile for equine subjects.
 * §CS2 — no suppression layer. Signal is state.
 * §CS3 — cross-species bridge is first-class.
 */
'use strict';

export const EQUINE_RECEIVER_PROFILE = Object.freeze({
  species:          'equine',
  suppressionLayer: false,
  culturalFrame:    null,
  attachGrammar:    null,

  // Bandwidth thresholds keyed to arousal axis (latent[1])
  bandwidthFromArousal(arousal) {
    if (arousal < 0.30) return 'FULL';
    if (arousal < 0.50) return 'MODERATE';
    if (arousal < 0.70) return 'REDUCED';
    if (arousal < 0.85) return 'MINIMAL';
    return 'OFFLINE';
  },

  // What is receivable at each bandwidth
  receivable: {
    FULL:     { modes: ['directive','somatic','relational'], maxWords: null },
    MODERATE: { modes: ['somatic','relational'],             maxWords: 8    },
    REDUCED:  { modes: ['somatic'],                          maxWords: 0    }, // no verbal
    MINIMAL:  { modes: [],                                   maxWords: 0    }, // stillness only
    OFFLINE:  { modes: [],                                   maxWords: 0    }, // nothing
  },

  // Transcode rules: human mode → equine-appropriate transmission
  transcode(humanMode, bandwidth) {
    if (bandwidth === 'OFFLINE' || bandwidth === 'MINIMAL') {
      return { mode: 'PRESENCE', content: null, instruction: 'Stillness only. No movement. Breathe.' };
    }
    if (bandwidth === 'REDUCED') {
      return { mode: 'SOMATIC', content: null, instruction: 'Soft body. Weight down. Exhale slowly.' };
    }
    const map = {
      RAGE:       { mode: 'SOMATIC', instruction: 'Drop shoulders. Breathe out. Look away briefly.' },
      NEED:       { mode: 'RELATIONAL', instruction: 'Approach on arc. Soft eyes. Wait.' },
      COGNITIVE:  { mode: 'SOMATIC', instruction: 'Ground first. Move slowly. Let them approach.' },
      SOMATIC:    { mode: 'SOMATIC', instruction: 'Match their rhythm. Breathe together.' },
      RELATIONAL: { mode: 'RELATIONAL', instruction: 'Stay present. Soft eye contact. No agenda.' },
    };
    return map[humanMode] ?? { mode: 'SOMATIC', instruction: 'Soft body. Slow breath. Wait.' };
  },

  notes: `
    Horses read the human's nervous system before the human is aware of their own state.
    Dysregulated human = activated horse.
    Regulated human = regulated horse.
    The horse is the most honest mirror in the room.
    Bridge to equine: always transcode through somatic channel first.
  `.trim(),
});
