'use strict';

/**
 * PENDULUM SWING — Historical Seeder
 * Seeds the kernel with dated observations from the poetry archive.
 *
 * Data quality labels:
 *   'confirmed' — explicit date in the source document
 *   'estimated' — inferred from context, labeled as such
 *
 * Signals tracked:
 *   valence    — net emotional charge (-1 to +1, normalized to 0-1)
 *   arousal    — emotional intensity (0-1)
 *   integration — darkness near growth language (0-1)
 *   suppression — masked/held signal (0-1)
 */

const path = require('path');
const kernel = require('./src/kernel');

// Convert date string to Unix ms
function ts(dateStr) {
  return new Date(dateStr).getTime();
}

// Observations — ordered by timestamp ascending
// Each entry: { date, signal, value, source, quality, note }
const OBSERVATIONS = [

  // ── 09/28/2025 — "Silence the darkness" ─────────────────────────────────
  // Hardest material in the archive. Depression markers dominant.
  // "hoping for death. It never comes, no matter how hard I beg."
  {
    date: '2025-09-28', signal: 'valence', value: 0.08,
    source: 'silence-the-darkness', quality: 'confirmed',
    note: 'lowest valence in archive. depression spectrum dominant.'
  },
  {
    date: '2025-09-28', signal: 'arousal', value: 0.35,
    source: 'silence-the-darkness', quality: 'confirmed',
    note: 'low arousal — numbness, not rage.'
  },
  {
    date: '2025-09-28', signal: 'integration', value: 0.05,
    source: 'silence-the-darkness', quality: 'confirmed',
    note: 'near zero integration. pain not near growth language.'
  },
  {
    date: '2025-09-28', signal: 'suppression', value: 0.6,
    source: 'silence-the-darkness', quality: 'confirmed',
    note: 'high suppression. screaming quietly internally.'
  },

  // ── 09/02/2026 — Clio breakup ────────────────────────────────────────────
  // Confirmed by James directly. Not a poem — a life event.
  // Marked as external event observation.
  {
    date: '2026-09-02', signal: 'valence', value: 0.18,
    source: 'life-event-clio-breakup', quality: 'confirmed',
    note: 'confirmed breakup date. valence estimated from poem content.'
  },
  {
    date: '2026-09-02', signal: 'arousal', value: 0.55,
    source: 'life-event-clio-breakup', quality: 'confirmed',
    note: 'loss event. arousal elevated — grief not numbness.'
  },
  {
    date: '2026-09-02', signal: 'integration', value: 0.2,
    source: 'life-event-clio-breakup', quality: 'confirmed',
    note: 'some integration beginning — "inner work has begun"'
  },

  // ── 09/28/2026 — "Strangers again" (Clio poem) ───────────────────────────
  // Confirmed date. Transition marker — loss acknowledged, new self emerging.
  {
    date: '2026-09-28', signal: 'valence', value: 0.32,
    source: 'strangers-again', quality: 'confirmed',
    note: 'grief present but "new version of me has awoken". transition.'
  },
  {
    date: '2026-09-28', signal: 'arousal', value: 0.48,
    source: 'strangers-again', quality: 'confirmed',
    note: 'moderate. processing not peak.'
  },
  {
    date: '2026-09-28', signal: 'integration', value: 0.35,
    source: 'strangers-again', quality: 'confirmed',
    note: 'integration rising. "inner work has begun / burn like the sun".'
  },

  // ── 09/30/2026 — "A scream into the void" VOLTA ──────────────────────────
  // The pivot poem. Before/after Raven explicitly marked in text.
  // This is the most structurally significant observation in the dataset.
  {
    date: '2026-09-30', signal: 'valence', value: 0.52,
    source: 'scream-into-void-volta', quality: 'confirmed',
    note: 'VOLTA. poem spans low to high valence within single work. mid-point scored.'
  },
  {
    date: '2026-09-30', signal: 'arousal', value: 0.78,
    source: 'scream-into-void-volta', quality: 'confirmed',
    note: 'high arousal at pivot. significant emotional event.'
  },
  {
    date: '2026-09-30', signal: 'integration', value: 0.55,
    source: 'scream-into-void-volta', quality: 'confirmed',
    note: 'integration crossing threshold. pain becoming connection.'
  },
  {
    date: '2026-09-30', signal: 'suppression', value: 0.25,
    source: 'scream-into-void-volta', quality: 'confirmed',
    note: 'suppression dropping — being heard = less need to hold.'
  },

  // ── 10/02/2026 — Untitled dark poem ─────────────────────────────────────
  {
    date: '2026-10-02', signal: 'valence', value: 0.28,
    source: 'untitled-10-02', quality: 'confirmed',
    note: 'brief regression after volta. "noose tightens" but "hope rises from east".'
  },
  {
    date: '2026-10-02', signal: 'integration', value: 0.45,
    source: 'untitled-10-02', quality: 'confirmed',
    note: 'integration holding despite dark imagery.'
  },

  // ── 10/13/2026 — "After Raven" ───────────────────────────────────────────
  // Confirmed date. Clear valence rise. Integration language dominant.
  {
    date: '2026-10-13', signal: 'valence', value: 0.71,
    source: 'after-raven', quality: 'confirmed',
    note: 'significant valence rise. "integration is beginning — growth, more intensely".'
  },
  {
    date: '2026-10-13', signal: 'arousal', value: 0.72,
    source: 'after-raven', quality: 'confirmed',
    note: 'high arousal maintained. resonant frequency energy.'
  },
  {
    date: '2026-10-13', signal: 'integration', value: 0.75,
    source: 'after-raven', quality: 'confirmed',
    note: 'highest integration score in archive at this point.'
  },
  {
    date: '2026-10-13', signal: 'suppression', value: 0.12,
    source: 'after-raven', quality: 'confirmed',
    note: 'suppression near floor. being seen.'
  },

  // ── 11/2026 — Meeting Raven (life event) ─────────────────────────────────
  // Two months after 09/02 breakup. Confirmed by James.
  {
    date: '2026-11-15', signal: 'valence', value: 0.74,
    source: 'life-event-met-raven', quality: 'estimated',
    note: 'estimated mid-month. meeting Raven confirmed as ~2mo after 09/02.'
  },
  {
    date: '2026-11-15', signal: 'integration', value: 0.78,
    source: 'life-event-met-raven', quality: 'estimated',
    note: 'healing beginning per James directly.'
  },

  // ── 10/2027 — "Mirror into infinity" ─────────────────────────────────────
  // Month-level precision confirmed. Peak love sequence.
  {
    date: '2027-10-15', signal: 'valence', value: 0.82,
    source: 'mirror-into-infinity', quality: 'estimated',
    note: 'estimated mid-month. highest positive valence in archive.'
  },
  {
    date: '2027-10-15', signal: 'arousal', value: 0.85,
    source: 'mirror-into-infinity', quality: 'estimated',
    note: 'peak arousal. cosmic scale language maximum.'
  },
  {
    date: '2027-10-15', signal: 'integration', value: 0.8,
    source: 'mirror-into-infinity', quality: 'estimated',
    note: 'darkness and light fully co-located.'
  },
  {
    date: '2027-10-15', signal: 'suppression', value: 0.08,
    source: 'mirror-into-infinity', quality: 'estimated',
    note: 'suppression at floor. full expression.'
  },

  // ── Grief sequence — estimated late 2027 / early 2028 ────────────────────
  // "Tomorrow would have been the day I'd finally hold you in my arms at last"
  // "We showed up unfiltered. We left fractured."
  // Position: after the love peak, before the philosophy book integration
  {
    date: '2028-02-15', signal: 'valence', value: 0.25,
    source: 'grief-sequence', quality: 'estimated',
    note: 'valence drop after peak. loss after connection. estimated date.'
  },
  {
    date: '2028-02-15', signal: 'arousal', value: 0.62,
    source: 'grief-sequence', quality: 'estimated',
    note: 'grief arousal — not numb. active grief.'
  },
  {
    date: '2028-02-15', signal: 'integration', value: 0.55,
    source: 'grief-sequence', quality: 'estimated',
    note: 'integration holding through grief. "love without conditions".'
  },

  // ── Philosophy book — 2025 (written concurrently / after arc) ────────────
  // "I see life as a sandbox and a laboratory"
  // Higher coherence, higher integration than poetry overall
  // Valence sitting higher despite acknowledging pain
  {
    date: '2025-06-01', signal: 'valence', value: 0.58,
    source: 'philosophy-book', quality: 'estimated',
    note: 'estimated. prose maturity and integration language suggest written across arc.'
  },
  {
    date: '2025-06-01', signal: 'integration', value: 0.65,
    source: 'philosophy-book', quality: 'estimated',
    note: 'philosophy book shows highest integration of all works overall.'
  },
  {
    date: '2025-06-01', signal: 'suppression', value: 0.3,
    source: 'philosophy-book', quality: 'estimated',
    note: 'moderate suppression — approval-seeking residue still present.'
  }
];

// ─── Seed ────────────────────────────────────────────────────────────────────
function seed() {
  const dataPath = path.join(__dirname, 'pendulum-data.json');
  const result = kernel.init(dataPath);

  console.log('PENDULUM SWING — Historical Seeder');
  console.log('Data path: ' + dataPath);
  console.log('Existing signals: ' + result.signals.length);
  console.log('');

  // Sort by timestamp — kernel enforces causality, must be ascending
  const sorted = OBSERVATIONS.slice().sort(function(a, b) {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  let loaded = 0, skipped = 0;

  sorted.forEach(function(obs) {
    const timestamp = ts(obs.date);
    try {
      kernel.observe(obs.signal, obs.value, obs.source + ':' + obs.quality, timestamp);
      console.log('  LOADED  [' + obs.quality.toUpperCase() + '] ' + obs.date + ' ' + obs.signal + '=' + obs.value + ' (' + obs.source + ')');
      loaded++;
    } catch (e) {
      // Skip if already loaded (same timestamp + signal would be duplicate)
      console.log('  SKIP    ' + obs.date + ' ' + obs.signal + ' — ' + e.message);
      skipped++;
    }
  });

  console.log('');
  console.log('Loaded:  ' + loaded);
  console.log('Skipped: ' + skipped);
  console.log('');

  // Print profiles for each signal
  const signals = ['valence', 'arousal', 'integration', 'suppression'];
  signals.forEach(function(sig) {
    const p = kernel.profile(sig);
    if (!p) return;
    const pr = p.profile;
    console.log('── ' + sig.toUpperCase() + ' (' + pr.observationCount + ' obs) ──');
    console.log('  Status:   ' + pr.status);
    console.log('  Mean:     ' + pr.mean);
    console.log('  Timespan: ' + Math.round(pr.timespan / (1000 * 60 * 60 * 24)) + ' days');
    if (pr.amplitude && pr.amplitude.positive !== null) {
      console.log('  Amplitude: +' + pr.amplitude.positive + ' / -' + pr.amplitude.negative +
        ' (asymmetry: ' + pr.amplitude.asymmetry + ')');
    }
    if (pr.period && pr.period.value) {
      const days = Math.round(pr.period.value / (1000 * 60 * 60 * 24));
      console.log('  Period:   ~' + days + ' days (confidence: ' + pr.period.confidence + ')');
    } else {
      console.log('  Period:   ' + (pr.period.reason || 'insufficient cycles'));
    }
    if (pr.damping && pr.damping.direction) {
      console.log('  Damping:  ' + pr.damping.direction + ' (' + pr.damping.coefficient + ')');
    }
    if (pr.phase && pr.phase.position) {
      console.log('  Phase:    ' + pr.phase.position + ' (' + pr.phase.current + ')');
    }
    if (pr.forced && pr.forced.isForced !== null) {
      console.log('  Forced:   ' + pr.forced.isForced + ' (tension: ' + pr.forced.tensionScore + ')');
    }
    console.log('');
  });

  // Cross-signal comparison
  console.log('── SIGNAL COMPARISONS ──');
  const pairs = [
    ['valence', 'arousal'],
    ['valence', 'integration'],
    ['integration', 'suppression']
  ];
  pairs.forEach(function(pair) {
    const cmp = kernel.compare(pair[0], pair[1]);
    if (!cmp) return;
    console.log('  ' + pair[0] + ' vs ' + pair[1] + ':');
    console.log('    periodRatio:    ' + cmp.periodRatio);
    console.log('    phaseDelta:     ' + cmp.phaseDelta);
    console.log('    inPhase:        ' + cmp.inPhase);
    console.log('    inAntiPhase:    ' + cmp.inAntiPhase);
  });
}

seed();
