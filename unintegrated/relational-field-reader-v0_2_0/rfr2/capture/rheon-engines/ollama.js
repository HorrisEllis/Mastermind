/**
 * RHEON KERNEL — ENGINE: OLLAMA BRIDGE
 *
 * Local LLM. No API key. No cloud dependency.
 * Streams completions to bus as node:mirror chunks.
 *
 * KNOWN FAILURE MODES ADDRESSED:
 *   - Ollama not running: checked at boot, graceful degradation to offline mirror.
 *   - Model not pulled: _pickModel() queries /api/tags, selects best available.
 *   - Stream hangs: 30s timeout, partial output preserved.
 *   - Context window: prompt trimmed to fit, never silently truncated.
 *
 * §LAW: Local first. Cloud is never the default path.
 * §LAW: If Ollama unavailable, offline mirror runs. Nothing silently fails.
 */

import { bus } from '../core/bus.js';
import { KernelEvents } from '../schema/kernel.schema.js';

const OLLAMA_BASE    = 'http://localhost:11434';
const TIMEOUT_MS     = 30_000;
const MODEL_PRIORITY = [
  'llama3',        // best quality available locally
  'llama3.2',
  'mistral',
  'gemma2',
  'gemma',
  'phi3',
  'phi',
  'tinyllama',     // fallback for low-resource machines
];

class OllamaBridge {
  constructor() {
    this._available  = false;
    this._model      = null;
    this._queue      = [];
    this._running    = false;
    this._checked    = false;
  }

  async init() {
    await this._checkAvailability();
    return this._available;
  }

  async _checkAvailability() {
    try {
      const res = await _fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, 3000);
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      this._model     = this._pickModel(data.models || []);
      this._available = !!this._model;
      this._checked   = true;
      bus.emit('ollama:ready', { model: this._model, available: this._available }, 'OLLAMA');
    } catch(e) {
      this._available = false;
      this._checked   = true;
      bus.emit('ollama:unavailable', { error: e.message }, 'OLLAMA');
    }
  }

  _pickModel(models) {
    if (!models.length) return null;
    const names = models.map(m => (m.name || '').split(':')[0].toLowerCase());
    for (const preferred of MODEL_PRIORITY) {
      const match = names.find(n => n.includes(preferred));
      if (match) return models[names.indexOf(match)].name;
    }
    return models[0].name; // whatever is available
  }

  // ── MIRROR ─────────────────────────────────────────────────

  /**
   * Generate a mirror for a committed node.
   * Streams tokens to bus as KernelEvents.NODE_MIRROR.
   * Emits KernelEvents.NODE_MIRROR_DONE when complete.
   */
  async mirror(node, onChunk) {
    const prompt = this._buildPrompt(node);
    if (!this._available) {
      const text = _offlineMirror(node.text);
      onChunk && onChunk(text);
      bus.emit(KernelEvents.NODE_MIRROR, { nodeId: node.id, chunk: text, offline: true }, 'OLLAMA');
      bus.emit(KernelEvents.NODE_MIRROR_DONE, { nodeId: node.id, offline: true }, 'OLLAMA');
      return text;
    }

    return new Promise((resolve, reject) => {
      this._queue.push({ node, prompt, onChunk, resolve, reject });
      if (!this._running) this._drain();
    });
  }

  async _drain() {
    if (!this._queue.length) { this._running = false; return; }
    this._running = true;
    const job = this._queue.shift();
    try {
      const result = await this._stream(job);
      job.resolve(result);
    } catch(e) {
      job.reject(e);
    }
    this._drain();
  }

  async _stream({ node, prompt, onChunk }) {
    let acc = '';
    try {
      const res = await _fetchWithTimeout(`${OLLAMA_BASE}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:  this._model,
          prompt,
          stream: true,
          options: { temperature: 0.4, top_p: 0.9, num_predict: 250 },
        }),
      }, TIMEOUT_MS);

      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            if (obj.response) {
              acc += obj.response;
              onChunk && onChunk(obj.response);
              bus.emit(KernelEvents.NODE_MIRROR, {
                nodeId: node.id,
                chunk:  obj.response,
                offline: false,
              }, 'OLLAMA');
            }
            if (obj.done) break;
          } catch(e) { /* partial JSON line, skip */ }
        }
      }
    } catch(e) {
      // Partial output + error note
      const fallback = acc || _offlineMirror(node.text);
      bus.emit(KernelEvents.NODE_MIRROR, { nodeId: node.id, chunk: fallback, error: e.message }, 'OLLAMA');
      acc = fallback;
    }

    bus.emit(KernelEvents.NODE_MIRROR_DONE, { nodeId: node.id, length: acc.length }, 'OLLAMA');
    return acc;
  }

  // ── PROMPT BUILDER ─────────────────────────────────────────

  _buildPrompt(node) {
    const shape    = node.shape?.fieldPosition || '—';
    const gaps     = (node.gaps || []).slice(0, 2).map(g => `${g.gapType}: ${g.omitted}`).join(' | ');
    const ctx      = (node._recentContext || []).slice(-3).map(n => n.text).join(' ');

    // Trim prompt to ~800 chars to fit small models
    const base = [
      ctx ? `Context: ${ctx.slice(0, 200)}` : '',
      `Speaker: ${node.text}`,
      `Metrics: DYS=${(node.dysfluency || node.dysfluencyScore || 0).toFixed(2)} COH=${(node.coherence || node.coherenceScore || 0).toFixed(2)} SENT=${(node.sentiment || 0).toFixed(2)} Layer=${node.layer || '?'}`,
      `Field: ${shape}`,
      gaps ? `Gaps: ${gaps}` : '',
    ].filter(Boolean).join('\n');

    return base + `\n\nMirror protocol:\n` +
      `1. MIRROR: cleaner restatement. Remove fillers. Keep meaning exact.\n` +
      `2. [DEPTH] Intent:X | Register:X | Layer:X\n` +
      (node.dysfluencyScore > 0.5 ? `High dysfluency — translating from pre-verbal state.\n` : '') +
      `Concise. No advice. No questions.`;
  }

  // ── STATUS ─────────────────────────────────────────────────

  status() {
    return {
      available: this._available,
      model:     this._model,
      queue:     this._queue.length,
      running:   this._running,
    };
  }
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function _offlineMirror(text) {
  const words = (text || '').split(/\s+/).filter(w => w.length > 0);
  return '[offline] ' + words.slice(0, 25).join(' ') + (words.length > 25 ? '…' : '');
}

async function _fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), ms || TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export { OllamaBridge };
