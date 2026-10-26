// ═══════════════════════════════════════════════════════════════════
// WHISPER SIDECAR
// foundation/ai/whisper.js
//
// Main process. Local speech-to-text by spawning a whisper binary.
//
// ─────────────────────────────────────────────────────────────────
// WHY NOT webkitSpeechRecognition
//
// It is not on-device. Chrome and Electron stream the audio to Google's
// servers and receive text back. The voice lattice is the most intimate
// capture surface in the application, so using it would send raw speech
// — before any node exists, before any vault encryption applies — to a
// third party. That is a DR-003 violation at the microphone, and it is
// invisible because it looks like a browser API.
//
// It also frequently does not work in packaged Electron at all: the API
// needs a Google Speech key that Chromium ships with and Electron
// generally does not.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THIS DOES NOT DO
//
// It does not download a model. It does not install a binary. It does
// not fall back to a cloud service when the local one is missing —
// a "helpful" fallback here would silently undo the entire reason for
// the module. If whisper is not present, transcription reports
// UNAVAILABLE and the person is told exactly what to install.
//
// Audio is written to a temp file, transcribed, and the temp file is
// deleted in a finally block. It never enters the vault; only the text
// does.
//
// UUID: 4a3b2c1d-ai-8000-8000-whisper00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const { spawn, execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3'];

// Where a binary might reasonably live. Checked in order; the first hit
// wins. `bundled` is the packaged-app location; the project-root path
// covers BUILD_DEV.bat's unpackaged launch, where process.resourcesPath
// points at Electron's own resources, not this app's — the same
// resources/whisper/ folder on disk, just reached a different way.
function candidatePaths(userConfigured) {
  const out = [];
  if (userConfigured) out.push(userConfigured);
  const exe = process.platform === 'win32' ? '.exe' : '';
  out.push(path.join(process.resourcesPath || '.', 'whisper', 'whisper-cli' + exe));
  out.push(path.join(process.resourcesPath || '.', 'whisper', 'main' + exe));
  out.push(path.join(__dirname, '..', '..', 'resources', 'whisper', 'whisper-cli' + exe));
  out.push('whisper-cli' + exe);   // on PATH
  out.push('whisper' + exe);
  out.push('main' + exe);
  return out;
}

function probe(binPath) {
  return new Promise((resolve) => {
    execFile(binPath, ['--help'], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return resolve({ ok: false, reason: 'NOT_FOUND' });
      // whisper.cpp exits non-zero on --help; presence of usage text is the signal.
      const text = String(stdout || '') + String(stderr || '');
      if (/usage|whisper|model/i.test(text)) return resolve({ ok: true, path: binPath });
      resolve({ ok: false, reason: 'NOT_WHISPER' });
    });
  });
}

async function detect(cfg) {
  const c = cfg || {};
  for (const p of candidatePaths(c.binPath)) {
    const r = await probe(p);
    if (r.ok) {
      const model = resolveModel(c);
      return {
        ok: true,
        binPath: p,
        model: model.path,
        modelName: model.name,
        modelPresent: model.present,
      };
    }
  }
  return {
    ok: false,
    reason: 'UNAVAILABLE',
    message: 'No local whisper binary found. Transcription is off. ' +
             'Install whisper.cpp and set its path in Options \u2192 AI. ' +
             'Nothing is sent anywhere in the meantime.',
    searched: candidatePaths(c.binPath),
  };
}

function resolveModel(cfg) {
  const name = MODELS.includes(cfg.model) ? cfg.model : 'base';
  const filename = 'ggml-' + name + '.bin';
  if (cfg.modelPath) {
    let present = false;
    try { present = fs.existsSync(cfg.modelPath); } catch (e) {}
    return { name, path: cfg.modelPath, present };
  }
  // Same two locations as candidatePaths(): the packaged app's resources
  // folder, or — for BUILD_DEV.bat's unpackaged launch, where
  // process.resourcesPath points at Electron's own resources rather than
  // this app's — the project-root resources/whisper/models/ folder.
  const candidates = [
    cfg.modelDir ? path.join(cfg.modelDir, filename) : null,
    path.join(process.resourcesPath || '.', 'whisper', 'models', filename),
    path.join(__dirname, '..', '..', 'resources', 'whisper', 'models', filename),
  ].filter(Boolean);
  for (const p of candidates) {
    let present = false;
    try { present = fs.existsSync(p); } catch (e) {}
    if (present) return { name, path: p, present: true };
  }
  return { name, path: candidates[candidates.length - 1], present: false };
}

// Transcribe one audio buffer. Resolves { ok, text } or { ok:false, reason }.
// Never throws — the caller is a queue that must record a failure, not die.
function transcribe(audioBuffer, cfg) {
  return new Promise(async (resolve) => {
    const found = await detect(cfg);
    if (!found.ok) return resolve(found);
    if (!found.modelPresent) {
      return resolve({
        ok: false,
        reason: 'MODEL_MISSING',
        message: 'Whisper is installed but the "' + found.modelName + '" model file is not at ' +
                 found.model + '. Download it, or point Options \u2192 AI at an existing one.',
      });
    }

    let tmp = null;
    try {
      tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mm-whisper-')), 'segment.wav');
      fs.writeFileSync(tmp, audioBuffer);
    } catch (e) {
      return resolve({ ok: false, reason: 'TEMP_WRITE_FAILED', message: e.message });
    }

    const args = [
      '-m', found.model,
      '-f', tmp,
      '-nt',                      // no timestamps — the queue supplies ordering
      '-l', (cfg && cfg.language) || 'auto',
      '-t', String((cfg && cfg.threads) || Math.max(2, Math.floor(os.cpus().length / 2))),
    ];

    // Prompt seeding. Whisper conditions on an initial prompt, so handing it
    // your own proper nouns and jargon is the largest accuracy gain available
    // for personal speech — and it compounds: better transcripts build a
    // better lexicon, which builds a better prompt.
    //
    // Capped hard. An over-long prompt eats the model's context and starts
    // biasing it toward words you did not say, which is worse than the
    // mishearing it was meant to fix.
    if (cfg && Array.isArray(cfg.promptWords) && cfg.promptWords.length) {
      const words = cfg.promptWords
        .filter(w => typeof w === 'string' && /^[\w'-]{2,24}$/.test(w))
        .slice(0, 48);
      if (words.length) args.push('--prompt', words.join(', '));
    }

    let out = '', err = '';
    let child;
    try {
      child = spawn(found.binPath, args, { windowsHide: true });
    } catch (e) {
      cleanup(tmp);
      return resolve({ ok: false, reason: 'SPAWN_FAILED', message: e.message });
    }

    const timeoutMs = (cfg && cfg.timeoutMs) || 120000;
    const killer = setTimeout(() => { try { child.kill(); } catch (e) {} }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });

    child.on('error', (e) => {
      clearTimeout(killer); cleanup(tmp);
      resolve({ ok: false, reason: 'SPAWN_FAILED', message: e.message });
    });

    child.on('close', (code) => {
      clearTimeout(killer);
      cleanup(tmp);
      if (code !== 0) {
        return resolve({ ok: false, reason: 'TRANSCRIBE_FAILED', exitCode: code, message: err.slice(-400) });
      }
      const text = cleanTranscript(out);
      if (!text) return resolve({ ok: true, text: '', empty: true });
      resolve({ ok: true, text });
    });
  });
}

// whisper.cpp emits bracketed non-speech markers and occasional blank
// lines. Strip them here rather than letting "[BLANK_AUDIO]" become a
// node with its own tags and associations.
function cleanTranscript(raw) {
  return String(raw || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => !/^\[[A-Z_ ]+\]$/.test(l))
    .filter(l => !/^\(.*\)$/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanup(tmp) {
  if (!tmp) return;
  try {
    fs.unlinkSync(tmp);
    fs.rmdirSync(path.dirname(tmp));
  } catch (e) { /* temp cleanup is best-effort */ }
}

module.exports = { detect, transcribe, cleanTranscript, resolveModel, MODELS, candidatePaths };
