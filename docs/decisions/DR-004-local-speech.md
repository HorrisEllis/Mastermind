# DR-004 — Speech is transcribed locally, or not at all

- **Date** 2026-08-12 · **Version** 0.1.12 · **Status** Accepted
- **Owner** James Brooks · **Related** DR-003, `docs/PHASEMAP.md` P3/P6

## The finding

`modules/voice-lattice/dictation.js` used `webkitSpeechRecognition`.

That API is **not on-device**. Chrome and Electron stream the captured
audio to Google's servers and return text. For the voice lattice this
means raw speech left the machine *before a node existed and before any
vault encryption applied* — the most intimate capture surface in the
application, exempt from every protection built for the rest of it.

It went unnoticed because it looks like a plain browser API. There is no
network call to review, no endpoint in the code, no credential.

Secondary problem: it frequently does not work in packaged Electron at
all, which needs a Google Speech key that Chromium bundles and Electron
does not.

## Decided

Local Whisper, spawned as a sidecar from the main process
(`foundation/ai/whisper.js`). Audio is written to a temp file,
transcribed, and the temp file is deleted in a `finally` block. Only
text reaches the vault.

**No cloud fallback.** If whisper is absent, transcription reports
`UNAVAILABLE` with instructions. A fallback would silently undo the
entire reason for the module, at exactly the moment nobody is watching.

The `webkitSpeechRecognition` path remains reachable only behind
`OPTS.allow_cloud_speech === true`, defaulting false, so using it is a
decision someone made rather than a default they inherited.

## The buffer

Whisper is accurate and not instant, so segments finish out of order —
a short sentence spoken second overtakes a long one spoken first.

Releasing nodes on completion would record speech in an order it was
never spoken. That is not cosmetic: the association engine and the
tag-transition grammar are both order-sensitive, so it would corrupt
the structure the module exists to find, invisibly, since every node
would still be real.

`foundation/ai/transcribe-queue.js` assigns a sequence number at
**capture** time, transcribes concurrently, and releases strictly in
sequence. A slow segment holds the ones behind it, which is correct —
their meaning depends on it.

Backpressure has a stated policy: at the ceiling the queue refuses and
says so. It never drops a segment silently, because dropped speech is
indistinguishable from speech that was never said.

A segment that fails all attempts is released as a **visible gap**
rather than removed. A hole you can see beats a hole you cannot.

## Costs accepted

- **A real dependency.** A binary plus a model file — 75 MB for `base`,
  ~500 MB for `medium`. The project's first non-zero dependency.
- **Latency.** Seconds per utterance, not live word-by-word. Acceptable
  for capture-then-review; it would not be for dictation into a field.
- **Not bundled.** The app does not download models. It detects, reports
  what is missing, and points at Options.

## Rejected

**Cloud Whisper (OpenAI API).** Better accuracy, no local dependency,
and it is the same violation as `webkitSpeechRecognition` wearing a
different name.

**Keeping browser speech as the default with a warning.** A warning that
appears once and is dismissed is not consent, and the default is what
almost everyone runs.
