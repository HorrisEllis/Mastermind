# resonance-engine v5.1.0 — build notes

From `resonance-v5_1_0-patches.zip` (`resonance-engine.js`, `relational-physics.js`, `pendulum.js`,
`resonance-v2-tests.js`) plus three files borrowed from `spatial-gaphunter-v2_0_0.zip` to satisfy
`resonance-engine.js`'s own imports (`gap-taxonomy.js`, `gap-bus.js`, `gap-text.js` — export names
checked and matched: `GapHunterBus`, `UniversalTextAnalyzer`, `GAP_TYPE`/`DOMAIN`/etc. all line up),
and `lib/ledger.js`, also from the gaphunter package.

**Missing:** `gap-field.js` (needs to export `LyricFieldAnalyzer`, `SequenceFieldAnalyzer`).
`resonance-engine.js` imports it but it isn't in this patches zip, the gaphunter package, or
anywhere else across everything uploaded in this session. Not fabricated — `resonance-engine.js`
will not run until this file is supplied. Flagging rather than guessing at its contents.

**Structure** (fixed by the imports themselves, not by me):
```
resonance-engine-v5.1.0/
├── engines/
│   ├── resonance-engine.js     (imports the four files below as siblings)
│   ├── relational-physics.js
│   ├── gap-taxonomy.js          ← from spatial-gaphunter-v2_0_0.zip
│   ├── gap-bus.js               ← from spatial-gaphunter-v2_0_0.zip
│   └── gap-text.js              ← from spatial-gaphunter-v2_0_0.zip
│   └── gap-field.js             ← MISSING, see above
├── lib/
│   ├── ledger.js                ← from spatial-gaphunter-v2_0_0.zip
│   └── pendulum.js
└── tests/
    └── resonance-v2-tests.js    (imports ../engines/resonance-engine.js, ../lib/pendulum.js)
```

**Relationship to `resonance-app/`** (the other deliverable in this batch): related but not the
same codebase. `resonance-app/` is the monolithic HTML lineage (v3.0.0 → v4.0.0 → v4.1.0,
`RESONANCE_SPEC_v3.md` describes it) — a single-page app with everything inlined. This module set
is versioned v5.1.0 and is pure ESM library code with no HTML shell — it reads as the next
architectural generation (decomposed modules, GapHunter/CausalNexus/Ledger integration) rather than
a patch file that applies on top of `resonance-v4_1.html`. I did not attempt to merge it into
`resonance-app/`'s extracted `js/app.js` — the two are structured too differently (global-scope
inline script vs. namespaced ESM modules) for a mechanical merge to be honest; treating them as two
related-but-separate deliverables was the more accurate call than forcing them into one.

All `.js` here passes `node --check`.
