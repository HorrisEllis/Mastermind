# TRIAGE — nine component archives

Audited 2026-08-12 at MASTERMIND v0.1.15. 555 files.

| Archive | Files | Verdict |
|---|---|---|
| `emergence-6` | 325 | **Mine the schemas.** Contains the P1 node envelope, already written. |
| `spatial-components` | 152 | Superset of the earlier `spatial_v2`. Same verdict: separate product, take `math`/`idl`/`sigma`. |
| `ALK-components` | 29 | Already audited. `alk-gl` yes; codec-v2 pitch no. |
| `telemetry-codec-components` | 15 | Has real jest tests. Take the test structure, not the engines. |
| `rheon-voice-components` | 11 | **Take the voicing insight.** Done — see below. |
| `resonance-engine-v5.1.0` | 9 | Separate product. |
| `topo-kernel-components` | 8 | JSON Schema discipline worth copying; SNR gates are a separate product's trust model. |
| `ase-persistent-scanner` | 3 | Front end only. Nothing transfers. |
| `resonance-app-components` | 3 | Front end only. Nothing transfers. |

---

## Built from this haul

### `foundation/ai/voicing.js` — from rheon-voice

`rheon-voice/js/audio-engine.js:221` had the thing every other version
of this code missed:

```js
if (zcr > 0.18 && energyDb < -35) state = 'unvoiced';  // fricatives
```

**Energy alone cannot tell a fricative from silence.** "s", "f", "sh",
"th" are quiet *and* noisy. An energy-only VAD cuts straight through
them — "this" becomes "thi", and Whisper confidently produces a wrong
word rather than an obviously broken one. Zero-crossing rate separates
them: quiet + high ZCR is a consonant and must be kept.

rheon also smoothed the decision over an 8-frame majority vote so a
single odd frame could not split a word. Both ideas are now in
MASTERMIND, with pause-aligned segmentation on top: cuts land in the
*middle of a real pause*, and when 28 seconds pass with no pause the cut
is forced **and flagged**, so a transcript that may contain a split word
says so.

This is a larger accuracy lever than any filtering. 17 tests.

### `foundation/ai/clarity.js`

Measure first, correct only what is objectively wrong: DC offset,
sample rate, level, sub-speech rumble. Refuses denoise, EQ,
time-stretching and compression, each with its reasoning attached, and
reports the refusals with every result. 30 tests.

---

## The lineage finding

Pitch tracking across three generations of this codebase:

| Generation | Method | Verdict |
|---|---|---|
| `rheon-voice/audio-engine.js:334` | Real autocorrelation on `getFloatTimeDomainData` | **Correct approach**, integer-Hz output, no octave protection |
| `ALK/codec-v2.js` PitchEngine | Peak-picking `getByteFrequencyData` | **Regression.** 23.44 Hz grid, octave errors, broken HNR |
| `foundation/ai/pitch.js` | YIN + cumulative mean + parabolic interpolation | Sub-Hz, octave-safe |

**The rewrite was worse than what it replaced.** The comment in codec-v2
even claims "F0 via autocorrelation" — describing the code it was
derived from rather than the code it is. Worth knowing as a pattern:
when a module is rewritten, the claims tend to survive the
implementation.

---

## `emergence-6` — the P1 blocker, already solved

`emergence/schemas/` holds JSON Schema definitions for `idea`,
`idea-edge`, `ledger-record`, `observation`, `created`, `target`,
`tick-result`.

**`idea.schema.json` is the node envelope draft** — `id`, `ts`, `text`,
`projectId`, `tags`, `source`, with `additionalProperties: false` and a
stated reason for every field.

**`idea-edge.schema.json` is the typed-link vocabulary**, and it is
better than anything I would have proposed:

```
related · refines · contradicts · implements · spawns
```

`contradicts` is the one that matters. A lattice where ideas can only
*relate* cannot represent disagreement with yourself, and that is most
of what thinking is.

**`ledger-record.schema.json` chains on `prev`** — SHA-256 of the
previous record. Independently arrived at the same structure as
MASTERMIND's vault audit ledger. Convergent design across two of your
own projects is a good sign the shape is right.

### The practice worth stealing outright

`observation.schema.json` annotates each field with its own honesty
status:

- `"LIVE -- verified to vary across distinct real text inputs"`
- `"PINNED to a default-derived value -- needs a real multimodal source"`
- `"HONEST CALIBRATION NOTE: ... hardcoded"`
- `"NEVER null -- no abstention mechanism"`

The schema states which numbers mean something and which are
placeholders. That is §1.1 applied to data rather than behaviour, and it
is exactly the discipline whose absence let codec-v2's `jitter` and
`hnr` ship as real measurements.

**`docs/NODE.spec.md` should adopt both**: the JSON Schema form from
`topo-kernel`/`emergence`, and this per-field liveness annotation.

---

## Not taken

`emergence/components/rfr2-observer` — gaslighting detection across six
layers, manipulation and control patterns, shadow material, existential
signals. Large, ambitious, and it infers hostile intent in relationships
from text. Its own schema already flags `rupture_severity` as pinned and
`assumption` as hardcoded, so the honesty is present — but nothing in
MASTERMIND should consume conclusions of that kind about the people in
your life, and the audit that pitch just received has not been run here.

`resonance-app`, `ase-persistent-scanner` — other products' front ends.

`topo-kernel/core/snr.js` — eight sequential trust gates ending in a
Bayesian posterior. Coherent, and it belongs to a system whose job is
deciding whether an incoming signal is real. MASTERMIND's inputs are
your own speech; it does not need to adjudicate them.
