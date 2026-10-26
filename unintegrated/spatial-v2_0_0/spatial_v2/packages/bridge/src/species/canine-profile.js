/**
 * @spatial/bridge — species/canine-profile.js
 * XLAT receiver profile for canine subjects.
 */
'use strict';

export const CANINE_RECEIVER_PROFILE = Object.freeze({
  species:          'canine',
  suppressionLayer: false,
  attachGrammar:    true,  // dogs have attachment bonds

  bandwidthFromArousal(arousal) {
    if (arousal < 0.35) return 'FULL';
    if (arousal < 0.55) return 'MODERATE';
    if (arousal < 0.72) return 'REDUCED';
    if (arousal < 0.88) return 'MINIMAL';
    return 'OFFLINE';
  },

  receivable: {
    FULL:     { modes: ['directive','relational','somatic'], maxWords: null },
    MODERATE: { modes: ['relational','somatic'],             maxWords: 6    },
    REDUCED:  { modes: ['somatic','calming'],                maxWords: 2    },
    MINIMAL:  { modes: ['calming'],                          maxWords: 0    },
    OFFLINE:  { modes: [],                                   maxWords: 0    },
  },

  transcode(humanMode, bandwidth) {
    if (bandwidth === 'OFFLINE')  return { mode: 'CALMING', instruction: 'Turn sideways. No eye contact. Crouch small.' };
    if (bandwidth === 'MINIMAL')  return { mode: 'CALMING', instruction: 'Look away. Yawn. Move slowly arc.' };
    if (bandwidth === 'REDUCED')  return { mode: 'CALMING', instruction: 'Soft voice only. One word. Wait.' };
    const map = {
      RAGE:       { mode: 'CALMING',   instruction: 'Slow down. Soft voice. Lateral body.' },
      NEED:       { mode: 'RELATIONAL',instruction: 'Invite, don\'t reach. Let them come.' },
      COGNITIVE:  { mode: 'DIRECTIVE', instruction: 'Clear cue. Neutral tone. Reward immediately.' },
      SOMATIC:    { mode: 'SOMATIC',   instruction: 'Ground yourself. Dog mirrors you.' },
      RELATIONAL: { mode: 'RELATIONAL',instruction: 'Play bow signal. Open posture.' },
    };
    return map[humanMode] ?? { mode: 'SOMATIC', instruction: 'Breathe. Soften. Wait.' };
  },
});
