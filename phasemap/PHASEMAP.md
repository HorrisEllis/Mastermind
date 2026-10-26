# PHASEMAP — v3

| | |
|---|---|
| **Version** | 3 · 2026-08-13 · at project v0.1.24 |
| **Supersedes** | `docs/PHASEMAP.md` v2 |
| **Ordering** | Strict dependency order. A phase may only use what is below it. |
| **Exit rule** | §1.1 — a phase is done when it is *demonstrated*, not when it is written. "Tests pass" is never sufficient on its own. |
| **Salvage** | `phasemap/salvage/` — extracted from `mastermind_old/index.html` (11,125 lines). Reference material, not wired. |

Read from the bottom. Everything above P1 is blocked on P1.

---

## The thesis this map serves

**Reduce cognitive load. Reduce overwhelm.** Every phase is judged against
that, and two consequences follow that are easy to lose:

1. **You never choose a category.** Tags, domains, intelligence types,
   intuition types and reasoning types are all *inferred*. They exist to
   map the mind, not to make you classify your own thoughts at the moment
   you are trying not to think about thinking. v7 had 22 intelligence
   types, 8 metadata categories, 6 domains and 4 modes — and needed nine
   tabs to surface them. **The clutter was the taxonomy.**
2. **AI assistance walks you through the overwhelm.** Its job is not to
   generate content. It is to reduce the number of decisions in front of
   you at any moment — which means it is a *navigator*, per module, with
   the module deciding what it may see.

---

## P0 — GROUND · durability and truth · **99%**

| | Status |
|---|---|
| v6 envelope, AAD-bound header, portable vault | done 0.1.2 |
| Hash-chained audit ledger, anchored in the vault | done 0.1.2 |
| Invariant 0 — header describes the key, enforced by the language | done 0.1.4 |
| Zero credentials outside the vault | done 0.1.4 |
| Snapshots — verified, reversible restore, pruned | done 0.1.5 |
| Boot sequence — nine gates, on screen, before unlock | done 0.1.7 |
| Version consistency, one source, enforced by test | done 0.1.6 |
| Real autosave | done 0.1.8 |
| Load-order suite — the class of bug no unit test can see | done 0.1.16 |
| **One clean create → restart → unlock → save → restart cycle** | **OPEN** |

### Field log

| Run | Symptom | Cause | Fixed |
|---|---|---|---|
| 08-11 | 3 saves failed at `seal` | legacy login bound no KDF params or identity | 0.1.3 |
| 08-12a | `Cannot access 'VAULT'` | AUTH.key guard ran at load against a later-file `const`; the throw aborted the file | 0.1.16 |
| 08-12b | correct password refused | recreation wrote a v5 envelope keyed from a salt stored nowhere | 0.1.17 |
| 08-12b | screens stacked | inline `display:flex` beats `.hidden` | 0.1.17 |
| 08-13 | **Settings button dead** | my own 0.1.8 goHome fix set inline `display:none` on a class-shown overlay | 0.1.24 |

**Every one was an integration fault** — load order, z-order, inline-vs-class,
which envelope a path writes. All unit tests passed through all of them. That
is why the tests added since are source- and evaluation-level, and why
`run-load-order.test.js` runs first.

---

## P1 — SUBSTRATE · the node envelope and the event log · **schemas done, storage not**

| Piece | State |
|---|---|
| `schemas/node.schema.json` — `provenance` + `mode` required | **done** 0.1.21 |
| `schemas/edge.schema.json` — typed links incl. `contradicts` | **done** 0.1.21 |
| Type registry across modules | not started |
| One append-only event log, projected per module | **not started — the blocker** |
| `serialize`/`hydrate` as the only persistence surface | partial (lexicon, taxonomy, session do it) |

> **P1 exit:** a node of every registered type round-trips through the vault
> with provenance intact, and the event log replays to the same state twice.

---

## P2 — CONTRACT · modules decoupled · **specified, one manifest written**

`docs/MODULE.spec.md` exists. `modules/voice-lattice/module.json` exists and
**nothing loads it**.

Measured decoupling of `voice-lattice`: `engine.js`, `dictation.js`,
`recall.js` have **0** `getElementById`. `speech.js` has 2. The UI lives in
`nexus-engine.js` — 6,500 lines — and was never a module at all.

Migration order, smallest first: `memory` → `leverage-map` → `alm` →
`voice-lattice` → `pattern-engine` → `lattice` → `capture` → `ai-status` →
canvas and brain map last.

> **P2 exit:** `memory` loads, renders and saves with zero references outside
> itself, and `index-browser.html` shrinks by exactly its markup.

---

## P3 — LATTICE PRIMITIVES · **done**

Auto-tag, Jaccard association with a speech-tuned stopword floor, loop
detection, word bank, seeds. Engine is `modules/lattice/lattice.js` and it is
better than v7's — v7 linked on one shared four-letter word and produced a
33%-density hairball; the current rule links 4% on content words.

---

## P3-UI — THE LATTICE INTERFACE · **done**

The current capture screen used to be an 800px blank textarea. You asked for no
notepad; a blank box that size *is* the overwhelm. Replaced with the orb.

v7's shape was the spec, salvaged from `phasemap/salvage/`. What actually
shipped, checked against it:

**The shape.** Left: capture. Right: the lattice canvas, **always visible**,
plus a detail panel. The lattice is not a destination you navigate to — it is
what you are looking at while you speak. That is "with the canvas".

**The capture surface is an orb, not a textarea.** `#vl-orb-outer` with three
concentric animated rings and a core; click to record; a live waveform below
it (real amplitude, not an animation) and a timer. Speaking has no blank
page — that is most of why voice-first reduces load.

**Against the salvage checklist:**

| Take | Status |
|---|---|
| record orb, 3 rings, pulse | shipped |
| waveform canvas + timer | shipped — real `getFloatTimeDomainData`, tested against a fake-sine regression |
| force-directed lattice canvas | shipped — salvaged physics constants, `VL_TAG_COL` palette |
| detail panel | shipped — full content, tags, redundancy flag, associated nodes by score (clickable), delete |
| node list: search + tag filter + heuristic filter | shipped as domain filter + word-cloud click filter + live search; heuristic filter is the phrase tester below, not a list filter |
| mode selector | shipped — externalizing / introspecting / processing |
| two-column layout | shipped as three columns (capture / lattice / recent) — closer to the salvage than the original two-column spec |

| Left out | Why |
|---|---|
| **nine tabs** | this was the clutter. Lists became surfaces on the canvas. |
| camera panel · `EXPR/POSTURE/GAZE/STRESS` badges | brightness statistics with psychological labels. Not measurements. |
| tone bar `STRESS:` readout | same defect as codec-v2 — see `docs/TRIAGE-components.md` |
| `vl-manual-ta` 4-row textarea as the primary path | demoted to secondary; the orb is primary |

**Heuristic firing** wasn't in the original salvage checklist as a UI surface
at all — it fired silently during capture (toast + fireCount) with no way to
see it coming. Added a phrase tester in the Heuristics tab: types a sentence,
runs it through the real matcher, highlights which heuristics would fire.
Deliberately a dry run — it never touches `fireCount`/`lastFired`, since a
test misrepresenting itself as capture history would be worse than not
having the feature.

> **P3-UI exit:** speak a sentence, see a node appear on the lattice canvas
> and connect itself, with no typing and no tab switching. **Met.**

---

## P4 — CAPTURE TRANSPORT · **done, ahead of order**

Forced early by DR-004. Local Whisper, ordered buffer, voice-note and video
import, YIN pitch, clarity, voicing/segmentation, capture bridge. All tested,
all delivering into the lattice.

---

## P5 — LEXICON AND GRAMMAR · **done**

PPMI context vectors, tag-transition Markov grammar, ambiguity reduction,
Whisper prompt seeding. Persists in the vault. Reports `confidence` and
`basis`, abstains below ~200 utterances.

---

## P6 — TAXONOMY · mapping intelligence itself · **engine done, surface not**

`foundation/ai/taxonomy.js`. Seeded from `assets/salvage-v7/` — 16 library
entries and 23 scenarios carrying hand-applied intelligence types, written in
March.

- domain · intelligence type — classified, **abstains** below threshold with
  the actual scores shown
- intuition type — somatic / pattern / relational / aesthetic / analytic
- reasoning type — deduction / induction / abduction / analogy
- corrections weigh 6× a seed, permanently, and persist

**Not built:** the map itself. There is no view of your own intelligence
profile over time, no domain map, and no correction UI — so the classifier
currently learns from nothing, because there is no way to correct it.

> **P6 exit:** a domain map that fills in as you speak, and one tap to correct
> a wrong label.

---

## P7 — AI AS NAVIGATOR · per module · **contract done, no transport**

`docs/AI-CONTRACT.md`, `foundation/ai/assist-contract.js`, 37 tests, options
panel wired and gating.

**The job is reducing decisions, not generating content.** Per module:

| Module | What the assistant does |
|---|---|
| Voice Lattice | "three of these say the same thing — merge?" · disambiguate a misheard word |
| Spatial Void | walks the ideation sequence one screen at a time |
| Horizon | turns a seed into a first concrete step |
| ALM | picks the next open loop worth closing |
| Memory | proposes which compartment a node belongs to |
| Brain Map | names a cluster you have not named |

**Not built:** any transport. Nothing calls a model. No accept UI for
proposals. `assistance.enabled` is false everywhere.

> **P7 exit:** one intent end-to-end — request built, receipt logged,
> proposal shown, accepted, node created with `author: "model"`.

---

## P8 — THE BRIDGE · cross-module flow

v7 had this working: `NEXUS.emit`/`on`, seven events, cross-system sends.
Rebuild over the WARP bus under the P2 contract.

`sendNodeTo(target, id)` · `pushSeedsToHorizon()` · `clusterToCanvas()` ·
`heuristicToBrainMap()` · `wordBankToCanvas()`

**Tags are the system-wide index.** One tag vocabulary, one library, every
module reading it. That is what makes the lattice interconnect rather than
sit beside things.

---

## P9 — HEURISTICS · content salvaged, mechanism gone

Load `assets/salvage-v7/heuristics.json` · `codex.json` · `rituals.json`.
**`saveClusterAsHeuristic`** is the closed loop: select nodes → named,
domain-tagged, strength-rated heuristic → spawns a node pointing back → can be
fired to create new nodes. Every heuristic has a `counter` — what makes it
stop working — and that must be surfaced beside it, not buried.

## P10 — IDEATION · spatial void

`+ Add idea` → *your own* | *generate* → wonder → logic. Priming rituals from
P9. The screen sequence **is** the schema: idea → wonder → logic → question,
typed by which screen produced it.

## P11 — COMPARTMENTS · epistemics

Sandbox suspends judgement; synthesis calibrates. Needs `mode` from P1, which
exists. Half salvaged: v7's epistemic register records claim/evidence/
domain/confidence including a `testing` level. **It never updates** — no
prior, no posterior, no review trigger. Adding that trigger is the whole of
"Bayesian updating", and P6 already detects `UNRESOLVED_BELIEF`.

## P12 — ALM · feedback loops · compression

Lexicon and grammar feed it. Mental simulation. Mutation lab — nine operators
already specified in `assets/salvage-v7/structuralSystems.json`, each a pure
node→node function.

## P13 — HORIZON · embodiment

Seeds promote into plans; P6 already flags `UNPROMOTED_SEED`. **The obstacle
step is non-skippable** — mental contrasting plus if-then, not positive
fantasy.

## P14 — INTELLIGENCE SYSTEM

The domain map maintained over time, generating open loops from gaps. The
22-type vocabulary and ~40 worked examples already exist.

---

## Critical path

```
P0 one clean hardware cycle
 └─ P1 event log                    ← everything waits here
     ├─ P2 contract ── P8 bridge ── P10 ideation ── P13 horizon
     ├─ P3-UI lattice interface     ← highest value, unblocked by anything
     ├─ P6 taxonomy surface
     └─ P11 compartments ── P12 ALM ── P14 intelligence
```

**P3-UI is done.** The lattice engine, the capture transport, the lexicon and
the taxonomy now all deliver into something visible and usable — that gap is
closed.

**Next action:** P1's event log — everything above it (P2, P6, P11) is
waiting on exactly that, by its own note in `phases.json`.

---

## Open follow-ups (2026-08-25) — stopped deliberately, not forgotten

Two items raised this session, investigation started, neither finished —
recorded here rather than left to be rediscovered from scratch.

**Canvas nodes should clear per capture session.** The actual ask: each
recording session should start on a blank canvas instead of accumulating
every node from every session ever recorded. Confirmed before stopping:
canvas nodes (`NX.nodes` — position, connections, what's drawn) and lattice
nodes (`LATTICE.nodes` — text, tags, relations, the Voice Lattice's own
analysis) are **separate data structures** linked only by ID; `vlAddNode()`
builds a node object and separately calls `latticeIngest()` with its ID.
**Not yet located:** the actual `NX.nodes.push(...)`/`spawnNode()` call
inside `vlAddNode()` — needed to know exactly what "clear" would touch.
**The real open question, unanswered:** does clearing the canvas mean the
data still survives elsewhere (recoverable from the Lattice's own Sessions
tab, still in the vault) or does it mean deleting it? These are different
features. Do not implement either without answering this first — the
session's whole thrust has been "verify before trusting, never guess with
someone's own data."

**Lattice accuracy reported as "extremely inaccurate"** even after this
session's stemming/bigram fix (`modules/lattice/text-analysis.js`) and the
audio-quality wiring (`clarity.js`/`voicing.js` — see git log 2026-08-24).
Not yet investigated: what's actually still wrong. The most likely
unexamined lead — the bundled Whisper model. `BUILD.bat` fetches `base`
(the smallest, fastest, least accurate of the ggml models) as the default;
nothing this session checked whether that default is a meaningful part of
the complaint, or looked at wiring an easy way to switch to `small`/`medium`
for someone who wants accuracy over size/speed. Start there.

> **Correction (2026-08-28):** the "start there" lead above is half wrong.
> The runtime side already exists — Settings → Voice has a model dropdown
> (`opt-voice-model`, tiny/base/small/medium/large-v3) and a language
> dropdown, both fully wired through to `whisper.js`'s spawn args
> (`foundation/ai/whisper.js`). The actual gap is narrower: `BUILD.bat`
> only ever *downloads* `ggml-base.bin`. Picking "large" in Options with
> nothing else fetched just fails `MODEL_MISSING`. The real fix is a model
> choice **in the installer/build step**, not another runtime control.

---

## Open follow-ups (2026-08-28)

**Sessions tab — play/pause + timeline for the session's own audio.** The
ask: in the session detail header (`nexus-engine.js`, `_vlRenderSessionDetail()`
— the row with STARTED / DURATION / KIND, screenshotted showing
`KIND: Live`), add a play/pause button right next to the KIND block, with
a timeline/scrubber filling the rest of that row's width.

**Genuinely blocked, not just unbuilt — same root cause as the
audio-replayable-note ask from 2026-08-27's readme.** `foundation/ai/whisper.js`
deliberately deletes the segment's temp `.wav` in a `finally` block right
after transcription: *"It never enters the vault; only the text does."*
That is stated as a considered design choice (audio is the most intimate
capture surface; keeping it multiplies what a vault breach or export
exposes), not an oversight. Confirmed: nothing else in the capture path
(`capture-bridge.js`, `ui-capture.js`) keeps a session-level audio file
either — there is currently no audio, anywhere, once transcription
finishes. A play/pause button built now would have nothing to play.

**Build order, in dependency terms:**
1. Decide the retention policy first — per-segment or one file per
   session; whether it's opt-in (a person may want text-only, on purpose,
   for exactly the reason whisper.js currently deletes it); a size budget,
   since raw audio is orders of magnitude larger than its transcript.
2. Vault storage for the audio blob(s), keyed by session id — same
   encrypted-at-rest treatment as everything else in the vault, not a
   separate plaintext file next to it.
3. Playback: an IPC path to stream/seek the stored audio (main process
   has the vault key; renderer does not), then the actual play/pause +
   timeline UI this follow-up is about.

Do not build the UI ahead of the storage decision — a scrubber over audio
that may not exist yet, or that violates a retention choice the person
didn't get to make, is the wrong order. Version bumped (0.1.44 → 0.1.45)
for this documentation pass; no code changed.

> **Correction (2026-08-29):** "there is currently no audio, anywhere,
> once transcription finishes" above is wrong — found while fixing the
> phone streaming bug below. `main.js`'s `capture:writeSegment` handler
> writes every segment's WAV to `CFG.dataDir/capture/<folder>/NNNNN.wav`,
> fsynced, **before** transcription is attempted — described in its own
> comment as crash-recovery, but nothing anywhere deletes these files
> afterward. Audio genuinely is being retained today; it just wasn't
> scoped or surfaced. It also is NOT vault-encrypted — plain files on
> disk, which step 2 of the build order above still stands for (the
> vault-encrypted-at-rest requirement isn't met by what already exists).
> What changed this session: the folder used to be keyed to when the app
> *launched* (one shared folder for every session in a run), now it's
> keyed to the actual session id (`capture:sessionStarted`, called the
> moment either the local mic or the phone starts recording) — the thing
> step 3's playback UI will actually need to find the right audio. Step
> 1 (retention policy: opt-in, per-segment budget) is still undecided.
> This narrows the remaining play/pause work but doesn't remove it.

---

## Open follow-ups (2026-08-29)

**Phone audio wasn't streaming — root cause found and fixed.** The QR fix
and the tunnel plumbing (previous sessions) all worked; the actual capture
never did. `vlPhoneBridge()`'s frame handler (`modules/voice-lattice/
ui-phone.js`) gated every incoming frame on `VL_UI.recording` — the LOCAL
mic orb's flag. Tapping "stream" on the phone opened the socket and
frames arrived correctly over IPC; every one was silently dropped at that
gate, because nothing on the phone path ever set it. Fixed: `vlOrbStart`/
`vlOrbStop` (`modules/voice-lattice/ui-capture.js`) split into a shared
`_vlBeginCapture(source)`/`_vlEndCapture(source)` core — session open/
close, VAD, timer, waveform — plus a thin local-mic wrapper that adds
`getUserMedia` around it. The phone's connect/disconnect status now calls
that same core directly, so connecting the phone alone starts a real
session (`kind: 'phone'`), no local orb click required. One source at a
time by design (`VL_UI.activeSource`) — concurrent local+phone would
interleave two live microphones into one VAD/segmenter and produce
garbled audio, not better audio; that's a real, different feature (see
dual-channel below), not a side effect of this fix. Also fixed as part of
the same pass: the desktop orb now shows a distinct visual state when
phone-driven (`.recording-remote`, phone's own purple instead of local-
mic red) rather than staying dark while actually recording; the waveform
canvas, which only ever read a local `AnalyserNode` and so stayed dead
for phone-only capture, now has a second draw path fed by a small rolling
buffer the phone bridge fills on every incoming frame; and phone connects
now go through the same whisper-availability gate the local mic already
had (`_vlEnsureWhisper()`) — before this, phone audio could stream and
get written to disk with no transcription path at all, silently. Covered
by a new test file, `tests/run-phone-orb-sync.test.js` (10 tests, loads
the real `ui-capture.js` + `ui-phone.js` together rather than stubs, so a
regression back to "phone connecting alone does nothing" fails there, not
as a field report months later).

**Not done this session — still open:**

- **Whisper model choice belongs in the installer, not just Options.**
  Confirmed again (see the 2026-08-28 correction above): `BUILD.bat`
  hardcodes `ggml-base.bin`. Picking `large-v3` in Settings → Voice with
  nothing else fetched just fails `MODEL_MISSING`. Not touched this pass.
- **"Slow the audio down in the pipeline, keep the raw recording per
  session" (readme ask).** Not evaluated or built. Worth being honest
  about before building it: there is real literature on speed/pitch
  perturbation as a *training-time* augmentation for ASR robustness, but
  that is a different claim from "slowing down THIS recording before
  feeding it to an already-trained whisper model improves what whisper
  hears" — I don't have evidence either way for the latter and shouldn't
  build it on a guess. If tried, it should be A/B'd against the same
  segment un-slowed, keeping both simple to compare, not shipped as a
  silent default.
- **Dual-channel input, asked as an open question, not a build order.**
  Deliberately not implemented. This session's fix makes local and phone
  each independently capable of driving the *same* single-track pipeline
  — genuine simultaneous dual-source needs an actual mixing stage (two
  independent VAD tracks, or sample-level mixing with gain balancing),
  which is real, separate work, not a side effect of "let either source
  start capture." The "ask single or dual on phone-click" UX is a
  reasonable idea once real mixing exists underneath it; building the
  prompt first would front a dialog for a feature that isn't there yet.

Version bumped 0.1.45 → 0.1.46. `tests/run-persistence.test.js` and
`tests/run-lattice-ui.test.js` had two assertions each that checked the
old, now-superseded literal shape of `vlOrbStart`/`vlOrbStop` (regex
against exact source text) — updated to follow the same real invariants
(mic before recording state; one session per capture, opened/closed on
start/stop) through the new `_vlBeginCapture`/`_vlEndCapture` indirection,
not weakened. Full suite: 50/50 runnable suites pass.

---

## Open follow-ups (2026-08-30)

Two items carried over from 2026-08-29's "not done this session" list,
given their own entries rather than staying as one-line bullets — and one
new, larger design: a feedback loop between transcription and the
lattice's own context, to catch and retry a transcript that doesn't fit
what's actually being said.

### 1. Whisper model choice belongs in the installer

Confirmed twice now (2026-08-28, 2026-08-29): `BUILD.bat` hardcodes
`ggml-base.bin` as the only model it ever fetches. Settings → Voice
already has a full model dropdown (`opt-voice-model` — tiny/base/small/
medium/large-v3, wired through to `whisper.js`'s spawn args) with nowhere
for `medium`/`large-v3` to actually come from unless someone manually
drops the `.bin` in `resources/whisper/models/`. Picking one that wasn't
fetched fails `MODEL_MISSING` — a control that offers a choice with no
way to act on it is its own kind of pretend.

**Build order:**
1. `BUILD.bat` — either fetch a second model alongside `base` (accuracy
   over speed — the same tradeoff Options already exposes, resolved once
   at build time instead of never) or prompt for a choice during the
   build the way region/language could (see item 2 in the 2026-08-27
   readme list, still separately open — not addressed here).
2. `resolveModel()` in `whisper.js` already searches `resources/whisper/
   models/` first — no change needed there, this is purely a fetch-time
   gap, not a resolution-time one.
3. Whatever the installer fetches, `Settings → Voice`'s dropdown should
   only offer what's actually present (`resolveModel()`'s `present`
   field already carries this — just not surfaced in the Options UI,
   which currently lists all five regardless of whether the `.bin`
   exists) — so picking a model and having it silently fail becomes
   picking from what will actually work.

### 2. "Slow the audio down, keep the raw recording" — evaluate before building

From the 2026-08-27 readme, restated 2026-08-29: not evaluated or built.
The genuinely open question is still open — there is real literature on
speed/pitch perturbation as a *training-time* augmentation for ASR
robustness (varying the training data), which is a different claim from
"slowing down THIS already-recorded segment before feeding it to an
already-trained model changes what that model hears," for better or
worse. No evidence either way was gathered.

**What changed since 2026-08-29 that makes this worth revisiting now:**
segment audio is retained on disk today (session-keyed, see the
2026-08-29 correction above) — the raw material a "try it slowed down"
retry would need already exists, where it didn't before. This lowers the
cost of finding out empirically instead of guessing. See the design
below (item 3) for where a slowed-down retry would actually plug in —
this item and that one converge on the same mechanism; they're written
separately because "should we do this at all" and "how would it work
once the surrounding system exists" are different questions.

### 3. NEW — a plausibility check between transcription and the lattice,
   with an automatic retry

The ask, in the session's own words: *"the meaning of words lies solely
in its surroundings... does it make sense? if not, optimize, slow it
down, run it through again... use that to improve accuracy
automatically."* A real, well-scoped idea — worth being precise about
before building, because "does it make sense" is a heuristic with real
false-positive and false-negative cost, not a fact whisper can report.

**Naming collision to avoid:** `modules/lattice/coherence.js` already has
`cohFindIncoherence()` — it means "contradicts a past *commitment*
specifically," a semantic-conflict check between belief-content nodes
that already exist in the lattice. This is a different question:
"is this FRESH TRANSCRIPT a plausible rendering of speech, given what
was just being talked about" — a transcription-quality check, not a
belief-consistency check. Whatever this becomes should get its own name
(`cohTranscriptFit`, or similar) so the two are never confused in code or
in conversation — the existing one stays exactly what it is.

**What "context" concretely means here, reusing what already exists
rather than inventing new machinery:** the immediately preceding nodes in
the SAME session/thread (`latticeThread()`, already built) — their
`words`/`tags`/`tagAxes` (domain, feeling, value, etc. — all from
`MM_TAXONOMY`, already built). A fresh transcript sharing almost no
vocabulary or domain/tag overlap with what immediately preceded it, in
the middle of what was continuous speech (no long VAD silence gap), is
the plausibility signal — the same Jaccard/overlap math `lattice.js` and
`coherence.js` already use for association and contradiction detection,
pointed at a new question. This is explicitly a heuristic: a real topic
change looks identical to a bad transcription by this measure alone.
Anything built on it must say "this looked off, here's why" rather than
silently substituting a retry — same posture as `cohFindContradictions`'s
own findings, which are surfaced, never auto-applied.

**Where the retry actually plugs in:** `_vlRunOne()` in `modules/voice-
lattice/ui-capture.js` — the exact function that calls `window.NXAPI.
whisperTranscribe(item.ref, cfg)` today. `item.ref` is the segment's own
WAV. A retry needs: (1) a time-stretch of that same buffer (slower,
same pitch — a real DSP step, not yet built anywhere in this codebase;
`Clarity.prepare()` in `foundation/ai/clarity.js` does resampling/
normalization but not tempo change), (2) a second `whisperTranscribe`
call against the stretched copy, (3) a comparator to decide which
transcript to keep — plausibility-against-context (above) is one input;
whisper's own output gives no confidence score today (`-nt` suppresses
timestamps entirely; whisper.cpp CAN emit token-level confidence with
different flags, not currently requested — that's the other real lever
here, and cheaper than a second full transcription pass).

**The feedback loop the ask ends on already half-exists.** `MM_LEXICON.
promptSeed()` → `cfg.promptWords` → whisper's `--prompt` flag was wired
in an earlier session (see the "ACCURACY LOOP" comment already in
`_vlRunOne()`) — richer lexicon, better prompt, next segment. A retry
that wins should feed its words into that SAME lexicon, same as any
other successful transcript — no new feedback mechanism needed, just
making sure a winning retry isn't treated differently from a first-try
success once it's chosen.

**Build order:**
1. Decide the comparator FIRST — plausibility-against-context, whisper's
   own per-token confidence (if requested), or both. Building the retry
   before deciding how to judge its output means guessing which one to
   keep.
2. The time-stretch DSP step, isolated and testable on its own (does it
   run, does it produce valid audio) before wiring it into the queue.
3. Wire into `_vlRunOne()`: transcribe once, check plausibility, retry
   stretched only if it looks implausible AND there was no long silence
   gap (a real topic change should not trigger a pointless second pass).
   Every retry costs a full second whisper invocation — this should be
   the exception path, not routine.
4. Surface the decision, don't hide it — a retried segment's node should
   carry which one, why, in `payload`, the same honesty
   `cohFindContradictions` already extends to its own findings.

Nothing in this section has been built. This is the design to build
against, not a status report on work done.

---

## Open follow-ups (2026-08-30, continued)

**Tree discrepancy — flagging plainly.** The lattice/taxonomy design work
in the entry above, and everything in the 2026-08-27 through 2026-08-29
entries about `tagAxes`, schema-conformant nodes, and `MM_TAXONOMY`
wiring, was done against a *different* branch of this project than the
one this zip (`phone-tunnel-auto`, v0.1.44+) actually is. Checked
directly: `modules/lattice/lattice.js` here is still v1.0.0 — no
`tagAxes`, no provenance, no `MM_TAXONOMY` call anywhere. `foundation/
ai/taxonomy.js` here is still the original, unextended version (domain/
intelligence/intuition/reasoning only; no idea/belief/value/feeling/
thinking_style). None of that work has been ported into this tree. Any
follow-up that assumes it exists here needs that porting done first —
it isn't a quick wire-up, it's redoing work that was done once already,
somewhere else.

**A real, confirmed bug found and fixed while checking that.** This
tree's `LAT_MAX_NODES = 5000` was a hard ceiling — `LATTICE.nodes.
splice(0, overflow)` with the result discarded, plus every edge touching
those nodes filtered out, the moment the count crossed the line. Not a
vault-wiring gap (nodes below that line were already correctly wired
into the vault) — an actual, silent delete of real data mid-session, at
scale (5000 nodes is not an unusual amount of lifetime capture). This is
exactly what "make sure the nodes from the lattice are storing in the
vault, we need this enforced" was reporting.

**Fixed:** `LAT_MAX_NODES` replaced with `LAT_HOT_WINDOW` (same 5000
default, same reason — bounding per-ingest scan cost) plus
`LATTICE.archive` (`shards` keyed by month, `index` for O(1) lookup by
id). Nodes that age out move, never delete. `_latFindNode()` resolves
hot-or-archived so `latticeThread()`/`latticeNeighborhood()` don't quietly
stop at the boundary. `latticeSessions()`/`latticeNodesForSession()`
updated the same way — a session's own node count must not go wrong just
because some of its nodes are old enough to have aged out.
`vaultSerialize`/`vaultDeserialize` wired to carry `LATTICE.archive`
(this specific edit had a false start — see the mistake noted below).

**A mistake, corrected in the same pass, worth naming rather than
quietly fixing.** Before finding the real bug above, `archive` was added
to `vaultSerialize`/`vaultDeserialize` based on an assumption — carried
over from the OTHER branch's lattice.js — that this tree already had a
hot/cold model. It didn't. That edit would have shipped a dead field:
harmless (nothing crashes), but pointless, and evidence of exactly the
failure mode this whole session has otherwise been careful about —
building on remembered state instead of checked state. Caught before
packaging, fixed by building the real thing the field was supposed to
represent, not by deleting the mistake and moving on quietly.

**Tests:** `tests/run-lattice-sessions.test.js` gained 5 new tests
against the real sandbox pattern the rest of that file already uses —
a node aging past the window survives in archive; its edges survive with
it; `latticeThread()` resolves through the boundary; a session's node
count stays accurate after some of its nodes archive; and a regression
guard confirming `LAT_MAX_NODES` is gone, not just supplemented.
`tests/run-persistence.test.js`'s functional round-trip test (added
2026-08-30) now actually corresponds to a field this tree's `LATTICE`
object really has. Full suite: 50/50 runnable suites pass.

**Still not done — the three items from earlier this same session that
depend on the porting above:** auto-apply tag backfill (needs
`MM_TAXONOMY`'s classify() actually wired into `latticeIngest()` here
first), the Tag Library surface, and the pattern-engine → lattice edges
design from 2026-08-30's earlier discussion. None built this pass.

Version bumped 0.1.47 → 0.1.48.

---

## Open follow-ups (2026-08-30, continued again)

**"Where would you like to begin?" (module selection) showed every
launch instead of once per identity — fixed.** `featuresConfirm()` was
already saving `_configured` into the real vault file (`MMVault.save({
modules: flags, configuredAt })`) alongside a `localStorage[FEATURES_KEY]`
cache — but nothing at boot ever read the vault's answer back. Both
boot-time gates checked the localStorage cache alone, which is tied to
this machine's Electron profile, not the identity. Restoring a vault
from a backup, opening it from a different data folder (the reporting
screenshot's title bar shows a custom path — not hypothetical), or
moving it to a different machine resets the cache silently while the
vault file itself still knew the true answer the whole time.

**Fixed at two points:** the encrypted-login gate (`_completeLoginSuccess`
in `nexus-engine.js`) now checks `AUTH.features._configured` — genuinely
fresh at that point, since `vaultDeserialize()` already ran earlier in
the same login chain — alongside the cache, and self-heals the cache
when the vault disagrees with it. `vaultDeserialize()` itself
(`foundation/vault/mastermind-vault.js`) also self-heals the cache
directly, so every path that deserializes a vault — encrypted login,
plain login, import, restore — converges on the vault's own truth, not
just the one gate that was checked directly.

**One honest gap left, not fixed:** the plain/unencrypted fast-path
login (`_continueStartup`'s `isPlain` branch) checks the gate *before*
the vault is deserialized at all — a deliberate startup-speed choice,
not an oversight, and reordering it carries real risk in a large
existing boot sequence. For that one path specifically, a fresh
cache-reset could still show the screen once more before the
`vaultDeserialize()` self-heal (which does run later in that same
branch) catches up on the following launch. Narrower and self-correcting
within one extra launch — not the same bug as before, which never
corrected itself at all.

**Tests:** `tests/run-module-selection-once.test.js` — new, 6 tests,
zero prior coverage of this area existed. Structural against the real
source rather than sandboxed (this login flow is a large, deeply
stateful function; safely extracting just the gate logic risked testing
a reimplementation instead of the real code) — checks the specific
things that were actually wrong: which source of truth each gate
consults, that the self-heal writes actually happen, and a regression
guard confirming the old localStorage-only condition isn't still there
unmodified alongside dead vault-check code. Full suite: 51/51 runnable
suites pass.

Version bumped 0.1.48 → 0.1.49.

---

## Open follow-ups (2026-08-30, continued once more)

**"Why does it default to operator" — answered, then fixed.** Not
mysterious: `setupCreateVault()` (encrypted identity path) required a
username; `setupSkipEncryption()`/`_setupSkipEncryptionConfirmed()` (the
"proceed without encryption" path) did not — an empty field there
silently became `'operator'`, permanently, no error, no re-prompt. Fixed
to require a username on both paths, same message, same behavior. Checked
in two places deliberately: `setupSkipEncryption()` itself, before the
security-warning modal is even shown (so a blank name is caught
immediately rather than after reading the whole warning and typing SKIP),
and again in `_setupSkipEncryptionConfirmed()` as defense in depth.
Found and removed one more vestige of the same bug while writing tests
for it: `kgUser.textContent = username || 'operator'` further down the
same function — harmless by that point (username is guaranteed non-empty
there now) but a stale, confusing leftover implying a possibility that
can no longer happen.

**Tests:** `tests/run-vault-plain.test.js` gained 3 new tests — zero
coverage of this setup validation existed before. One of them caught the
`kgUser` vestige above before it shipped.

Version bumped 0.1.49 → 0.1.50.

---


## Open follow-ups (2026-10-26)

**The assistant runs in the background — process-wide, not just per window.**
`backgroundThrottling:false` was set on agent windows only, and it only
stops Chromium throttling *timers*. Three gaps remained:

1. The **main window** (hidden to the tray on close) had no
   `backgroundThrottling:false`, and it is the renderer that issues every
   `cg:ask` and runs the pattern engine's timers. Now set on both the
   primary and fallback window options.
2. Chromium **backgrounds renderers on its own** regardless of the
   per-window flag. `main.js` now appends `disable-renderer-backgrounding`,
   `disable-background-timer-throttling` and
   `disable-backgrounding-occluded-windows` before `ready`.
3. On Windows, Chromium's **native occlusion tracker** treats a window no
   display covers as occluded — which is precisely where a parked agent
   window sits (-32000,-32000) — and flips Page Visibility back to
   `hidden`, re-opening the original "Test only completes once you open
   it" failure through a different door. Disabled with
   `disable-features=CalculateNativeWinOcclusion`.

**Node anchor for the DOM mutator.** The ask script (the code that
mutates the agent page: writes the prompt, clicks send, reads the
reply) held a single `querySelector` reference to the composer for the
whole exchange. A React/ProseMirror re-render that swaps the composer
node between inserting and reading back made a successful injection
read as empty → a false `TEXT_INJECTION_FAILED`. Now every read and
write goes through `_mmAnchorRuntime` (`clearglass-main.js`):

- `resolve(role, selectors)` stamps the node `data-mm-anchor="<role>"`,
  reuses it while it is connected and still matches, otherwise re-picks
  and moves the stamp.
- The first new reply block after send is anchored as `reply` and
  watched with a `MutationObserver`. The fallback completion path (no
  stop-button signal) now also requires the anchored reply to have
  stopped mutating, not only its text to be stable. Observer and
  `reply` stamp are released when the ask ends, success or failure.
- The runtime is self-contained (serialized with `.toString()`), feature-
  checks every DOM capability, and is exposed on `__MM_AGENT__.anchors`
  (harness v3.1.0). `cg:peek` reports `anchored.{composer,reply}`.

**Tests:** `tests/run-node-anchor.test.js` (8, plain Node — runs the
real generated scripts in a vm against a DOM double with detached nodes
and a MutationObserver; the composer-swap case was confirmed to fail
with `TEXT_INJECTION_FAILED` on the previous ask script) and
`tests/run-background-switches.test.js` (5, structural). Not yet
exercised against the live sites or in a packaged Windows build.

Version bumped 0.1.50 → 0.1.51.
