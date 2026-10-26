# MASTERMIND — Cognitive Mapping OS

> **Version 0.1.51** · Windows desktop app (Electron) · local-first · encrypted vault

MASTERMIND is a desktop application for **externalising your thinking**:
capturing thoughts (typed, dictated, or spoken from your phone), arranging them
on a canvas and in an associative lattice, and letting the system infer
structure — tags, domains, recurring patterns, contradictions — so you don't
have to classify your own thoughts while you're trying to have them.

Everything is stored in a single **encrypted vault file on your own disk**.
Speech is transcribed **locally** with Whisper. AI assistants (ChatGPT, Claude,
Perplexity, Gemini) can be used from inside the app, but by design they
**never read from or write to the vault**.

---

## Table of contents

1. [What's new](#whats-new)
2. [Design principles](#design-principles)
3. [Quick start](#quick-start)
4. [Feature tour](#feature-tour)
5. [Architecture](#architecture)
6. [Repository layout](#repository-layout)
7. [The vault](#the-vault)
8. [AI integration](#ai-integration)
9. [Voice and phone capture](#voice-and-phone-capture)
10. [Testing](#testing)
11. [Versioning and releases](#versioning-and-releases)
12. [Project roadmap (PHASEMAP)](#project-roadmap-phasemap)
13. [Documentation index](#documentation-index)
14. [Troubleshooting](#troubleshooting)

---

## What's new

### 0.1.51: background assistant and DOM node anchors

**The assistant keeps working with no window on screen.** With the main
window hidden to the tray and the AI agent windows parked off-display,
Chromium could still slow or pause them. `main.js` now turns off
renderer backgrounding, background timer throttling, occluded-window
backgrounding and Windows' native occlusion tracking (which marked
parked agent windows as hidden). The main window also sets
`backgroundThrottling: false`.

**Node anchors for the DOM mutator.** The script that types into an AI
site's composer and reads its reply now works through *anchored* nodes
(`data-mm-anchor="composer"` / `"reply"`). When the site re-renders and
swaps an element out, the anchor follows the replacement instead of
reading a detached node, which removes a false `TEXT_INJECTION_FAILED`.
The reply anchor carries a `MutationObserver`, so a reply is only
accepted as finished once the page has stopped writing to it. See
`_mmAnchorRuntime` in `foundation/ai/clearglass-main.js`.

New tests: `tests/run-node-anchor.test.js` and
`tests/run-background-switches.test.js`.

### 0.1.50: username required

**A username is now required on every setup path.**

Before this release, first-time setup had two routes:

| Route | Function | Old behaviour |
|---|---|---|
| Create an encrypted vault | `setupCreateVault()` | Required a username ✅ |
| Proceed without encryption | `setupSkipEncryption()` → `_setupSkipEncryptionConfirmed()` | An empty username **silently became `operator`**, permanently, with no error or re-prompt ❌ |

Now both routes require a username, with the same message and behaviour. The
check runs in two places on purpose:

- in `setupSkipEncryption()`, **before** the security-warning modal is shown,
  so a blank name is caught immediately rather than after reading the warning
  and typing `SKIP`;
- again in `_setupSkipEncryptionConfirmed()`, as defence in depth.

A leftover `kgUser.textContent = username || 'operator'` fallback was removed,
since it implied a case that can no longer happen.

`tests/run-vault-plain.test.js` gained three tests covering this validation
(one of them caught the `kgUser` leftover before it shipped).

The full change history lives in [`phasemap/PHASEMAP.md`](phasemap/PHASEMAP.md)
under the *Open follow-ups* sections.

---

## Design principles

These shape every part of the codebase. They come from
[`docs/AXIOMS-v3_1.md`](docs/AXIOMS-v3_1.md), the decision records in
[`docs/decisions/`](docs/decisions/), and the thesis at the top of the PHASEMAP.

1. **Reduce cognitive load.** You never choose a category. Tags, domains,
   intelligence types and reasoning types are *inferred*; you only ever
   *correct* them. (Earlier prototypes had 22 intelligence types across nine
   tabs — "the clutter was the taxonomy".)
2. **Local-first, vault-only persistence.** Your data lives in one encrypted
   file. Nothing important is kept in browser `localStorage` (there is a test
   that audits this).
3. **AI never touches the vault** ([DR-003](docs/decisions/DR-003-ai-never-touches-the-vault.md)).
   The assistant only sees what you hand it in the moment. Anything it produces
   is stored with **provenance** (which model, when), so you can always tell
   your own thinking apart from a model's.
4. **Speech is transcribed locally, or not at all**
   ([DR-004](docs/decisions/DR-004-local-speech.md)). The browser's
   `webkitSpeechRecognition` sends audio to Google, so it was replaced with a
   bundled Whisper sidecar.
5. **Nothing exists until it's demonstrated.** A phase is done when it works,
   not when it's written. Backups are verified by restoring them. Releases run
   the full test suite before bumping the version.
6. **Never fail silently.** Errors are logged loudly, dropped data is reported,
   and refused saves come with diagnostics.

---

## Quick start

### Requirements

- Windows 10/11 x64
- [Node.js](https://nodejs.org) 18 or newer (LTS recommended)
- An internet connection on the first run (npm downloads Electron, about 120 MB)

### Option A: run instantly (no build)

1. Install Node.js.
2. Double-click **`BUILD_DEV.bat`**.
3. The app opens with DevTools.

Or from a terminal:

```bash
npm install
npm run dev      # electron . --dev   (with DevTools)
npm start        # electron .
```

### Option B: build the Windows installer

1. Install Node.js.
2. Double-click **`BUILD.bat`**.
3. The installer is written to `dist/MASTERMIND-Setup-<version>.exe`.

`BUILD.bat` also downloads, once per machine, the large binaries that aren't
committed to the repo:

| File | Size | Purpose | Source |
|---|---|---|---|
| `resources/whisper/models/ggml-base.bin` | ~142 MB | Local speech-to-text model | huggingface.co/ggerganov/whisper.cpp |
| `resources/cloudflared/cloudflared.exe` | ~52 MB | Optional Cloudflare Tunnel mode for phone input | Cloudflare releases |

If either download fails the build still succeeds. Voice capture (or tunnel
mode) reports itself as unavailable until the file is present. To fetch the
model by hand:

```bat
curl -L -o resources/whisper/models/ggml-base.bin ^
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

### First launch

1. **Welcome / setup.** Choose a **username** (required, see 0.1.50 above) and
   either create an **encrypted vault** with a password or explicitly proceed
   **without encryption** after a security warning.
2. **Module selection.** You pick your modules once. The choice is remembered
   in the vault.
3. **Session restore.** On later launches, if you left off somewhere worth
   returning to, MASTERMIND asks once whether to go back there.

> **Browser mode is disabled.** `index-browser.html` is the UI, but it needs
> the Electron desktop shell for vault access.

---

## Feature tour

| Area | What it does | Where |
|---|---|---|
| **Canvas / Brain Map** | Spatial node canvas for arranging thoughts and connections | `nexus-canvas.js`, `nexus-engine.js` |
| **Lattice** | Associative lattice of everything captured; text analysis, stem-aware coherence, contradiction and "ripple" detection | `modules/lattice/` |
| **Voice Lattice** | Speak, transcribe locally, ingest into the lattice; recall and dictation | `modules/voice-lattice/` |
| **Unified Capture** | One entry point (`mmCapture`) for every capture route, plus a quick-capture bar (`Ctrl+Shift+Space` or `` ` ``) | `modules/capture/` |
| **Leverage Map** | A lens over nodes: `L = Tension × Weight × Slope` | `modules/leverage-map/` |
| **ALM: Accelerated Learning Module** | Cognitive functions, human models, learning deltas | `modules/alm/` |
| **Memory Architecture** | User-named compartments that *point at* existing content without copying it. Suggestions only; you make every assignment | `modules/memory/` |
| **Pattern Engine** | Finds recurring event motifs and persistent lattice themes over time; patterns crystallise or dissolve with evidence | `modules/pattern-engine/` |
| **Taxonomy & Lexicon** | Infers domain and intelligence type per node and learns *your* vocabulary and grammar from your own speech, with no model involved | `foundation/ai/taxonomy.js`, `foundation/ai/lexicon.js` |
| **Clarity / Voicing / Pitch** | Local audio analysis helpers for captured speech | `foundation/ai/` |
| **AI Status** | Live status of hosted AI agents | `modules/ai-status/` |
| **Phone as microphone** | Use a phone as an input device over LAN (self-signed TLS) or a Cloudflare Tunnel | `foundation/ai/phone-mic.js`, `modules/voice-lattice/ui-phone.js` |
| **Vault** | AES-256-GCM encrypted vault, MFA, audit ledger, snapshots, secure wipe | `foundation/vault/` |
| **Background mode** | Closing the main window hides it to the system tray. The app, its renderer and the parked AI agent windows keep running at full speed (no Chromium throttling or occlusion) | `main.js` |

---

## Architecture

### Process model

```
┌────────────────────────── Electron main process ──────────────────────────┐
│ main.js                                                                    │
│  ├─ vault I/O: atomic-write, vault-ledger, vault-snapshots, secure wipe    │
│  ├─ clearglass-main.js  → hidden BrowserWindows, one session per AI agent  │
│  ├─ whisper.js / transcribe-queue.js → local whisper-cli.exe sidecar       │
│  ├─ phone-mic.js        → LAN TLS server / cloudflared tunnel              │
│  └─ local-static-server.js                                                 │
└──────────────────────────────▲─────────────────────────────────────────────┘
                               │  IPC via preload.js  (window.NXAPI)
┌──────────────────────────────┴─── Renderer ───────────────────────────────┐
│ index-browser.html                                                        │
│  1. foundation/siso-jaa/mastermind-siso-jaa.js   SISO + JAA runtime       │
│  2. foundation/core/mastermind-foundation.js     MM registry, vault, tags │
│  3. nexus-canvas.js                              canvas bridge            │
│  4. nexus-engine.js                              application engine       │
│  + foundation/bus/*   (MM_BUS, event ledger, WARP navigation spine)       │
│  + modules/*          (lattice, capture, ALM, memory, leverage, …)        │
└───────────────────────────────────────────────────────────────────────────┘
```

### Script load order (critical)

```html
<script src="foundation/siso-jaa/mastermind-siso-jaa.js"></script>   <!-- FIRST  -->
<script src="foundation/core/mastermind-foundation.js"></script>     <!-- SECOND -->
<script src="nexus-canvas.js"></script>                              <!-- THIRD  -->
<script src="nexus-engine.js"></script>                              <!-- LAST   -->
```

### Event flow

- **SISO** (Stream In, Stream Out) is a small functional event pipeline.
  **JAA** provides `PureGate` / `StateGate` / `Runner` / `MutationBatch`.
- **`MM_BUS`** is the app-wide event bus. Events are named like
  `mm.auth.login.success` or `mm.vault.created`; the full catalogue is in
  `MASTERMIND_DOCS.html`.
- **Event ledger** (`foundation/bus/event-ledger.js`) is a fixed-capacity ring
  buffer over every bus event. The Pattern Engine reads it.
- **WARP spine** (`foundation/bus/mastermind-warp-spine.js`) makes navigation
  itself a stream of gated events. Each navigation is an Event passed through a
  Gate, so a rejected event means the navigation simply doesn't happen. It
  currently covers the Brain Map lifecycle and homepage navigation.

### Modules

Modules live in `modules/<name>/` and conventionally split into `engine.js`
(state and pure logic, no DOM), `ui.js` (rendering and handlers) and
`events.js`. The module contract (manifest, lifecycle, DOM ownership) is
specified in [`docs/MODULE.spec.md`](docs/MODULE.spec.md). ALM and Leverage Map
are the reference implementations; `voice-lattice/module.json` is the first
manifest, and it declares the fields the module may send to AI.

---

## Repository layout

```
.
├── main.js                     Electron main process
├── preload.js                  Context bridge (exposes NXAPI to the renderer)
├── index-browser.html          Main UI (markup + styles)
├── nexus-engine.js             Application engine
├── nexus-canvas.js             Canvas bridge (loads before the engine)
├── MASTERMIND_DOCS.html        Living documentation, shipped in-app (About → View Documentation)
├── package.json                npm + electron-builder config; the ONLY place the version lives
├── BUILD.bat / BUILD_DEV.bat   Windows installer build / dev launcher
│
├── foundation/
│   ├── siso-jaa/               SISO + JAA runtime (load first)
│   ├── core/                   Foundation layer, session restore, local static server
│   ├── bus/                    Event ledger, WARP core + navigation spine
│   ├── vault/                  Envelope, crypto, MFA, guard, ledger, snapshots, boot, atomic write
│   ├── ai/                     ClearGlass agent host, assist contract, taxonomy, lexicon,
│   │                           whisper, transcription queue, phone mic, clarity, pitch, voicing
│   ├── ui/                     Boot screen, dialogs, vendored QR code generator
│   └── theme/                  Theme CSS + animated background
│
├── modules/                    Feature modules (see Feature tour)
├── schemas/                    JSON schemas: node, edge, assist-request, assist-response
├── integrations/clearglass/    Userscript bridge for clear-glass-lite (fallback AI path)
├── resources/
│   ├── whisper/                whisper-cli.exe + DLLs (committed); models/ fetched at build
│   └── cloudflared/            cloudflared.exe fetched at build (not committed)
├── assets/                     Icons, installer art, salvaged v7 content (JSON)
├── build/installer.nsh         NSIS installer customisation
├── scripts/                    release.js, archive-history.js
├── tests/                      56 test suites + run-all.js
├── docs/                       Specs, axioms, triage notes, decision records
├── phasemap/                   Roadmap (PHASEMAP.md, phases.json, components) + salvage
├── dist/history/               Local git-bundle backups (bundles are git-ignored)
└── unintegrated/               Parking lot of component drops. NOT wired into the app
```

> **About `unintegrated/`:** these are source-only snapshots of related
> projects (ALK, Resonance, Rheon Voice, Spatial, Topo-kernel, Telemetry codec,
> and others). Nothing there is loaded by MASTERMIND. Many use an ESM / SISO
> architecture that would need a real integration decision rather than a
> straight port. See [`unintegrated/README.md`](unintegrated/README.md).

---

## The vault

Full specification: [`docs/VAULT.spec.md`](docs/VAULT.spec.md) (envelope
format v6). Design rationale:
[DR-001](docs/decisions/DR-001-vault-v6.md).

| Property | Value |
|---|---|
| Default location | `~/Documents/MASTERMIND/mastermind.vault` |
| Encryption | AES-256-GCM |
| Key derivation | PBKDF2-SHA256, 310,000 iterations |
| Salt | Stored in the vault's cleartext header, so the vault is portable between machines |
| Integrity | Canonical AAD over the header; hash-chained append-only **audit ledger**; tamper/rollback verdicts from `vault-guard.js` |
| Durability | Single shared **atomic write** implementation with retry |
| Backups | Content-addressed **snapshots** in `<dataDir>/snapshots/`, verified, with reversible restore and pruning |
| MFA | TOTP (RFC 6238), single-use backup codes, WebAuthn / FIDO2 security keys |
| Boot | Ordered pre-flight gates (`vault-boot.js`) over injected probes |
| Unencrypted mode | Allowed after an explicit warning. Still requires a username (0.1.50) |

### Components

| File | Purity | Responsibility |
|---|---|---|
| `vault-envelope.js` | pure | What a vault file *is*: AAD, build/parse/validate, v5 detection |
| `vault-crypto.js` | WebCrypto | KDF, AEAD, hashing, base64, calibration |
| `vault-ledger.js` | fs (main) | Hash-chained audit ledger |
| `vault-guard.js` | pure | Verdicts from header + ledger state |
| `mastermind-vault.js` | impure | Orchestration, save/load, diagnostics, boot probes |
| `atomic-write.js` | fs (main) | Durable writes, shared by `main.js` and tests |
| `vault-snapshots.js` | fs (main) | Create, verify, restore, prune snapshots |
| `vault-boot.js` | pure | Pre-flight gate sequence |
| `vault-mfa.js` / `vault-mfa-state.js` | pure | TOTP, backup codes, WebAuthn verification, MFA state |

### Wiping the vault

**Options → Vault → Wipe Vault** deletes the vault file. **Secure Wipe**
first overwrites it with random data and then zeros, then deletes it, so the
contents can't be recovered from leftover disk data. Both require typing a
confirmation phrase, and **neither can be undone**.

---

## AI integration

### The contract

[`docs/AI-CONTRACT.md`](docs/AI-CONTRACT.md) defines exactly what may leave
the process and what happens to what comes back. It is enforced by
`foundation/ai/assist-contract.js` and the request/response schemas in
`schemas/`:

- `assist-contract.js` **cannot read anything**: no reference to the vault,
  lattice, `localStorage`, `NXAPI` or `fetch`. A test greps for those names and
  fails if any appear.
- Every item sent must name its source field, and that field must be in the
  calling module's `module.json` allowlist. Unlisted fields are dropped, and
  the drop is **reported**.
- A hard **`NEVER_SEND`** list (`password`, `salt`, `encPrivKey`, `identity`,
  `ledger`, `lexicon.*`, `vault.*`, …) overrides every manifest, even
  `may_send: ["*"]`.
- Responses are stored with provenance (model, timestamp).

### Transports

1. **Built in (primary, no setup).** `foundation/ai/clearglass-main.js` hosts
   ChatGPT, Claude, Perplexity and Gemini inside MASTERMIND's own Electron
   process, with one isolated session per account. Agent windows are real
   `BrowserWindow`s parked off-display rather than headless renders, and
   they keep running while MASTERMIND sits in the tray. Prompts are typed
   and replies read through **node anchors** (`data-mm-anchor`), which follow
   the site's elements across re-renders. Sign in via
   **Options → AI → Sign in to X**. Agent definitions and tunables live in
   `foundation/ai/clearglass-config.js`.
2. **clear-glass-lite relay (fallback).** Install
   `integrations/clearglass/mastermind-ai-bridge.user.js` into
   clear-glass-lite's userscripts folder. See
   [`integrations/clearglass/README.md`](integrations/clearglass/README.md).

AI exchanges that pass through an agent are captured into the lattice
automatically, through Unified Capture.

---

## Voice and phone capture

- **Local Whisper.** `whisper-cli.exe` (official whisper.cpp Windows x64 CPU
  build, MIT) runs as a sidecar from the main process.
  `foundation/ai/whisper.js` locates the binary and model; `transcribe-queue.js`
  serialises jobs. No audio leaves the machine.
- **Audio import.** Existing audio files can be imported and transcribed
  (`foundation/ai/audio-import.js`).
- **Phone as a microphone.** Browsers only allow microphone access in a
  *secure context*, so `phone-mic.js` offers two modes:
  - **LAN + self-signed TLS** (default): audio never leaves your network.
    Scan the QR code shown in the app.
  - **Cloudflare Tunnel**: works across networks and needs `cloudflared.exe`.
- **Dictation and quick capture.** Press `Ctrl+Shift+Space` (or `` ` ``),
  speak, then press Enter.

---

## Testing

The tests are plain Node scripts with no framework. Run all of them with:

```bash
node tests/run-all.js
```

Or run a single suite:

```bash
node tests/run-vault-plain.test.js
```

Current state (verified on this commit in a Linux container without Electron):

```
All runnable suites passed — 53 run, 3 skipped, 56 total
```

The three skipped suites (`run-clearglass-main`, `run-main-background`,
`run-vault-secure-wipe`) need the `electron` package. Run `npm install` first
to exercise them; without it, the Electron/IPC layer has no automated
coverage.

Coverage areas include vault lifecycle, v6 envelope, gate repair, secure wipe,
atomic-write retry, save-refused diagnostics, MFA, import/export, node
integrity, the assist contract, taxonomy, lexicon, text analysis, stem-aware
coherence, recall, transcription, audio import, phone mic and tunnel, capture
bridge, welcome gate, module selection, `localStorage` audit, packaged
dependencies, and **version consistency** across the codebase.

---

## Versioning and releases

The version lives in **exactly one place**: `"version"` in `package.json`.
Electron's `app.getVersion()` reads it at runtime, and the titlebar, homepage,
About panel and vault byline fill themselves in from it at boot.
`tests/run-version-consistency.test.js` fails if a hardcoded copy appears
anywhere.

```bash
npm run release              # patch bump  (0.1.51 → 0.1.52)
npm run release -- minor     # 0.1.51 → 0.2.0
npm run release -- major     # 0.1.51 → 1.0.0
npm run release -- 0.3.1     # exactly that version
```

`scripts/release.js` refuses a dirty tree or a reused tag, runs the full test
suite **before** bumping, then bumps, commits, tags, and archives.

```bash
npm run archive
```

`scripts/archive-history.js` writes a single-file `git bundle` of all history to
`dist/history/` and **proves** it by cloning it and comparing commit counts.
Bundles are git-ignored on purpose. They are an *external* backup, and
committing them would make the repo grow with every release (see
[DR-002](docs/decisions/DR-002-history-durability.md) and `.gitignore`).

Other npm scripts:

| Script | Command |
|---|---|
| `start` | `electron .` |
| `dev` | `electron . --dev` |
| `build` | `electron-builder --win --x64` |
| `build:dir` | unpacked build, no installer |
| `pack` | build without publishing |

---

## Project roadmap (PHASEMAP)

[`phasemap/PHASEMAP.md`](phasemap/PHASEMAP.md) orders the work in strict
dependency order (read it from the bottom up). A summary:

| Phase | Name | Status |
|---|---|---|
| P0 | Ground: durability and truth | ~99% |
| P1 | Substrate: node envelope and event log | schemas done, storage not |
| P2 | Contract: modules decoupled | specified |
| P3 | Lattice primitives | done |
| P3-UI | Lattice interface | done |
| P4 | Capture transport | done |
| P5 | Lexicon and grammar | done |
| P6 | Taxonomy | engine done, surface not |
| P7 | AI as navigator (per module) | contract done |
| P8–P14 | Bridge, heuristics, ideation, compartments, ALM, horizon, intelligence | planned / partial |

```
P0 one clean hardware cycle
 └─ P1 event log                    ← everything waits here
     ├─ P2 contract ── P8 bridge ── P10 ideation ── P13 horizon
     ├─ P3-UI lattice interface
     ├─ P6 taxonomy surface
     └─ P11 compartments ── P12 ALM ── P14 intelligence
```

**Next action:** P1's event log.

---

## Documentation index

| Document | Contents |
|---|---|
| [`MASTERMIND_DOCS.html`](MASTERMIND_DOCS.html) | In-app living docs: auth gates, bus event catalogue, storage keys |
| [`docs/AXIOMS-v3_1.md`](docs/AXIOMS-v3_1.md) | The engineering axioms (§-references throughout the code) |
| [`docs/VAULT.spec.md`](docs/VAULT.spec.md) | Vault subsystem specification |
| [`docs/AI-CONTRACT.md`](docs/AI-CONTRACT.md) | AI seam: what may leave, what may come back |
| [`docs/MODULE.spec.md`](docs/MODULE.spec.md) | The module contract |
| [`docs/NEXUS-SPEC.md`](docs/NEXUS-SPEC.md) | Engine specification |
| [`docs/SPEC-REGISTRY.md`](docs/SPEC-REGISTRY.md) | Registry of specs |
| [`docs/SALVAGE-v7.md`](docs/SALVAGE-v7.md) | What was salvaged from the v7 prototype |
| [`docs/CLEARGLASS-CHANGELOG.md`](docs/CLEARGLASS-CHANGELOG.md) | ClearGlass integration history |
| [`docs/TRIAGE-*.md`](docs/) | Triage notes |
| [`docs/decisions/`](docs/decisions/) | DR-001 vault v6 · DR-002 history durability · DR-003 AI never touches the vault · DR-004 local speech |
| [`phasemap/`](phasemap/) | Roadmap, components map, salvaged lattice UI |
| [`modules/*/README.md`](modules/) | Per-module notes (ALM, Leverage Map) |
| [`resources/whisper/README.md`](resources/whisper/README.md) | Bundled Whisper details |

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Voice capture says "unavailable" | `resources/whisper/models/ggml-base.bin` is missing. Re-run `BUILD.bat` or fetch it by hand (see Quick start). |
| Phone mic gets no microphone | The phone must load the page over **HTTPS** (secure context). Use the in-app QR code / LAN TLS mode, or tunnel mode. |
| Tunnel mode unavailable | `resources/cloudflared/cloudflared.exe` is missing. `BUILD.bat` fetches it. |
| "No identity found — complete first-time setup." | The vault metadata has no username/salt. Complete setup; a username is required. |
| Closing the window doesn't quit | By design: it hides to the tray so AI agents keep running. Quit from the tray icon. |
| A save is refused | The app shows diagnostics. See `VAULT.spec.md` and `tests/run-save-refused-diagnostics.test.js`. |
| 3 test suites skipped | `electron` isn't installed. Run `npm install`. |

---

*© 2025 Mastermind. Private project.*
