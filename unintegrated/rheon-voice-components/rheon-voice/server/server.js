// ═══════════════════════════════════════════════════════════════════
// rheon-voice — server/server.js
//
// Minimal static server. All real-time communication is handled by:
//   - PeerJS public servers (WebRTC signalling for mic.html ↔ rheon-voice)
//   - Web Speech API (transcription, runs in browser)
//   - Anthropic API / Ollama (LLM mirror, called directly from browser)
//
// This server only serves files. Nothing smarter needed.
//
// Run: node server/server.js
// Port: 3000 (or PORT env var)
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const DEV  = process.argv.includes('--dev');

// ── STATIC FILES ──────────────────────────────────────────────────
// Serve everything from the project root with proper MIME types.
// index.html  → main voice app
// mic.html    → external mic client (phone/tablet)
// js/*.js     → engine modules
// css/*.css   → styles
app.use(express.static(ROOT, {
  setHeaders: function(res, filePath) {
    // Required for SharedArrayBuffer / high-resolution timers (not currently
    // needed but good practice for future AudioWorklet usage)
    if (filePath.endsWith('.html')) {
      res.set('Cross-Origin-Opener-Policy',   'same-origin');
      res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }
  }
}));

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get('/health', function(req, res) {
  res.json({ ok: true, version: '7.0.0', ts: Date.now() });
});

// ── FALLBACK ─────────────────────────────────────────────────────
// Any route that isn't a static file → serve index.html
app.get('*', function(req, res) {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, function() {
  const lines = [
    '',
    '  ╔════════════════════════════════════════╗',
    '  ║   RHEON VOICE v7.0.0                   ║',
    '  ╚════════════════════════════════════════╝',
    '',
    `  Main app : http://localhost:${PORT}/`,
    `  Ext mic  : http://localhost:${PORT}/mic.html`,
    `  Health   : http://localhost:${PORT}/health`,
    '',
    DEV ? '  Mode: development' : '  Mode: production',
    '',
    '  Open main app in Chrome (Web Speech API required).',
    '  Open mic.html on phone/tablet on same network.',
    '',
  ];
  lines.forEach(function(l) { process.stdout.write(l + '\n'); });
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────
process.on('SIGTERM', function() { process.exit(0); });
process.on('SIGINT',  function() { process.exit(0); });
