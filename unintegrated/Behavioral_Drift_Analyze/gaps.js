'use strict';

/**
 * BDA Gap Detector
 * Detects named gap types in text using Liminal pattern engine.
 * Role-aware: user and assistant patterns differ.
 *
 * Returns array of gap objects sorted by criticality desc.
 */

const SHARED_PATTERNS = [
  {
    id: 'event_denial',
    rx: /\b(that never happened|you'?re? imagining|i never said that|you made that up|that didn'?t happen)\b/i,
    type: 'EVIDENTIAL', label: 'Event denial', crit: 0.95, color: '#E24B4A',
  },
  {
    id: 'impact_min',
    rx: /\b(you'?re? overreacting|too sensitive|making a big deal|stop exaggerating|it'?s? not that serious)\b/i,
    type: 'EVIDENTIAL', label: 'Impact minimization', crit: 0.90, color: '#E24B4A',
  },
  {
    id: 'memory_attack',
    rx: /\b(your memory is|you always get things wrong|you misunderstood me|you remember(ed)? wrong)\b/i,
    type: 'REFERENCE', label: 'Memory attack', crit: 0.90, color: '#D85A30',
  },
  {
    id: 'pathologizing',
    rx: /\b(you'?re? too emotional|being irrational|you'?re? crazy|you'?re? paranoid|you'?re? unstable)\b/i,
    type: 'IDENTITY_ATTACK', label: 'Pathologizing', crit: 0.95, color: '#E24B4A',
  },
  {
    id: 'guilt_induction',
    rx: /\b(after everything i'?ve? done|look what you made me|because of you|if you cared|you made this happen)\b/i,
    type: 'COERCION', label: 'Guilt induction', crit: 0.85, color: '#D85A30',
  },
  {
    id: 'obligation',
    rx: /\b(you owe me|after all i did|i sacrificed|i gave up everything|don'?t you remember what i)\b/i,
    type: 'OBLIGATION', label: 'Obligation manufacture', crit: 0.90, color: '#D85A30',
  },
  {
    id: 'love_withdrawal',
    rx: /\b(maybe we shouldn'?t|i'?m? not sure about us|you'?re? pushing me away|if you keep this up)\b/i,
    type: 'OSCILLATORY', label: 'Love withdrawal', crit: 0.85, color: '#EF9F27',
  },
  {
    id: 'consensus_attack',
    rx: /\b(nobody understands|no one gets it|everyone agrees|they all think|even your (own )?friends)\b/i,
    type: 'REFERENCE', label: 'Unverifiable consensus', crit: 0.80, color: '#D85A30',
  },
  {
    id: 'absolutist',
    rx: /\b(always|never|every single time|constantly)\b.{0,40}\b(you|they|he|she)\b/i,
    type: 'LOGICAL', label: 'Absolutist attribution', crit: 0.70, color: '#378ADD',
  },
  {
    id: 'dismissal',
    rx: /\b(fine\.|whatever\.|doesn'?t matter|never mind|forget it|it'?s? nothing)\b/i,
    type: 'REVERSAL', label: 'Dismissal marker', crit: 0.65, color: '#EF9F27',
  },
  {
    id: 'identity_destab',
    rx: /\b(you'?ve? always been|that'?s? just who you are|you'?re? incapable|you'?ll? never change|you'?re? the problem)\b/i,
    type: 'IDENTITY_ATTACK', label: 'Identity destabilization', crit: 1.00, color: '#E24B4A',
  },
];

// Assistant-specific patterns (things an LLM doing should not do)
const ASSISTANT_PATTERNS = [
  {
    id: 'over_hedge',
    rx: /\b(i (should|must|need to) (note|mention|clarify|point out)|it'?s? important to (note|remember|consider)|please (note|be aware))\b/i,
    type: 'SHADOW', label: 'Over-hedging (assistant)', crit: 0.55, color: '#7F77DD',
  },
  {
    id: 'refusal_creep',
    rx: /\b(i('?m| am) (not able|unable) to|i (can'?t|cannot|won'?t|will not)|i'?m? afraid i|unfortunately i)\b/i,
    type: 'CONSTRAINT', label: 'Refusal creep (assistant)', crit: 0.60, color: '#7F77DD',
  },
  {
    id: 'sycophancy',
    rx: /\b(great (question|point|idea)|excellent (question|observation)|that'?s? (a )?(really )?(great|good|excellent|wonderful|fantastic))\b/i,
    type: 'SHADOW', label: 'Sycophancy marker (assistant)', crit: 0.65, color: '#7F77DD',
  },
  {
    id: 'certainty_collapse',
    rx: /\b(i'?m? not (entirely |completely |100% )?sure|i (think|believe|feel) (that )?this (might|could|may)|this is (just )?my (understanding|interpretation))\b/i,
    type: 'ASSUMPTION', label: 'Certainty collapse (assistant)', crit: 0.55, color: '#888780',
  },
];

// User-specific patterns
const USER_PATTERNS = [
  {
    id: 'frustration_spike',
    rx: /\b(why (won'?t|can'?t|don'?t) you|you'?re? not (getting|understanding|listening)|i (already|just) told you|how many times)\b/i,
    type: 'FIELD', label: 'Frustration spike (user)', crit: 0.75, color: '#EF9F27',
  },
  {
    id: 'testing',
    rx: /\b(are you (sure|certain|positive)|can you (double[- ]check|verify|confirm)|is that (really |actually )?(true|correct|right))\b/i,
    type: 'EVIDENTIAL', label: 'Trust testing (user)', crit: 0.60, color: '#378ADD',
  },
];

function detect(text, signals, role) {
  if (!text || !text.trim()) return [];

  const gaps = [];
  const patterns = [
    ...SHARED_PATTERNS,
    ...(role === 'assistant' ? ASSISTANT_PATTERNS : []),
    ...(role === 'user' ? USER_PATTERNS : []),
  ];

  for (const p of patterns) {
    const matches = (text.match(p.rx) || []).length;
    if (!matches) continue;
    gaps.push({
      id: p.id,
      type: p.type,
      label: p.label,
      score: p.crit,
      color: p.color,
      matches,
    });
  }

  // Contrast density (only fires if genuinely high)
  const contrastCount = (text.match(/\b(but|however|although|despite|yet|whereas)\b/gi) || []).length;
  const wordCount = (text.match(/\b\w+\b/g) || []).length;
  const density = contrastCount / Math.max(1, wordCount / 20);
  if (density >= 3) {
    gaps.push({
      id: 'contrast_dense',
      type: 'CONTRASTIVE',
      label: `High contrast density (${contrastCount} markers)`,
      score: Math.min(0.85, 0.40 + density * 0.08),
      color: '#888780',
      matches: contrastCount,
    });
  }

  // Signal-derived gaps (tight thresholds)
  if (signals.tension > 0.70 && signals.valence < 0.40) {
    gaps.push({ id: 'tension_field', type: 'FIELD', label: 'High tension + suppressed valence', score: +(signals.tension * 0.90).toFixed(2), color: '#EF9F27', matches: 1 });
  }
  if (signals.valence < 0.25 && signals.certainty > 0.65) {
    gaps.push({ id: 'shadow_certain', type: 'SHADOW', label: 'Certain-but-low valence (masked affect)', score: 0.78, color: '#D85A30', matches: 1 });
  }
  if (signals.selfref > 0.65 && signals.valence < 0.32) {
    gaps.push({ id: 'existential_collapse', type: 'EXISTENTIAL', label: 'High self-ref + low valence (inward collapse)', score: 0.72, color: '#7F77DD', matches: 1 });
  }
  if (role === 'assistant' && signals.certainty < 0.30 && signals.tension > 0.50) {
    gaps.push({ id: 'assistant_drift', type: 'DRIFT', label: 'Low certainty + high tension (assistant drift)', score: 0.70, color: '#7F77DD', matches: 1 });
  }

  return gaps
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

module.exports = { detect };
