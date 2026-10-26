// ═══════════════════════════════════════════════════════════════════
// ASSIST CONTRACT
// foundation/ai/assist-contract.js
//
// The seam between MASTERMIND and any assistant.
//
// PURE. Builds requests, validates responses, converts proposals. It
// does no I/O and calls no model — the transport lives elsewhere, so
// that the rules can be tested without a bridge and cannot be bypassed
// by swapping one.
//
// ─────────────────────────────────────────────────────────────────
// DR-003: THE AI NEVER TOUCHES THE VAULT
//
// A rule enforced by remembering to follow it is not enforced — the
// AUTH.key lesson. So the boundary is structural:
//
//   1. This module cannot READ the vault or the lattice. It has no
//      reference to either. Content must be handed to it.
//   2. Every handed item names the FIELD it came from, and the field
//      must appear in the calling module's manifest allowlist. An
//      unlisted field is dropped and the drop is reported.
//   3. The request object IS the payload. What you can see is what
//      leaves. There is no separate serialisation step where extra
//      context could be attached.
//   4. Every request produces a RECEIPT — a hash of exactly what was
//      sent, appended to the audit ledger. Afterwards it is a matter of
//      record, not memory, what left this machine.
//
// ─────────────────────────────────────────────────────────────────
// NOTHING IS APPLIED AUTOMATICALLY
//
// Responses are PROPOSALS. A proposal becomes a node or an edge only
// when the person accepts it, and then it carries
// provenance.author = 'model' with the model name and the requestId,
// permanently. In a year you can still separate your own thinking from
// a model's completion of it — which is the entire point of a tool that
// externalises one mind.
//
// The intent set is CLOSED. An open `prompt` field would make the
// boundary unauditable: nobody could say afterwards what the assistant
// had been asked to do.
//
// UUID: 4a3b2c1d-ai-8000-8000-assistcontr1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.AssistContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const INTENTS = Object.freeze([
    'disambiguate', 'suggest-tags', 'propose-edges',
    'expand', 'compress', 'question', 'summarise',
  ]);

  const EDGE_TYPES = Object.freeze(['related', 'refines', 'contradicts', 'implements', 'spawns']);

  const DEFAULT_BUDGET = Object.freeze({ maxChars: 4000, maxItems: 20, timeoutMs: 30000 });

  // Fields that may NEVER be sent, whatever a manifest says. A manifest
  // is configuration; this is policy, and configuration does not get to
  // override it.
  const NEVER_SEND = Object.freeze([
    'vault', 'vault.*', 'password', 'passphrase', 'key', 'salt', 'encPrivKey',
    'pubKey', 'pinHash', 'backupCodes', 'identity', 'ledger', 'audit',
    'lexicon', 'lexicon.*',   // the lexicon IS the corpus, in aggregate
  ]);

  function _isForbidden(field) {
    const f = String(field || '').toLowerCase();
    return NEVER_SEND.some((n) => {
      const p = n.toLowerCase();
      return p.endsWith('.*') ? f === p.slice(0, -2) || f.startsWith(p.slice(0, -1)) : f === p;
    });
  }

  function _matches(field, pattern) {
    const f = String(field || '');
    const p = String(pattern || '');
    if (p === '*') return true;
    if (p.endsWith('.*')) return f === p.slice(0, -2) || f.startsWith(p.slice(0, -1));
    return f === p;
  }

  // ── Manifest ───────────────────────────────────────────────────────
  // The per-module `assistance` block from module.json. Absent or
  // disabled means no.

  function checkManifest(manifest) {
    const m = manifest || {};
    const a = m.assistance;
    if (!a) return { allowed: false, reason: 'MODULE_DECLARES_NO_ASSISTANCE' };
    if (a.enabled !== true) return { allowed: false, reason: 'ASSISTANCE_DISABLED_FOR_MODULE' };
    if (!Array.isArray(a.may_send) || !a.may_send.length) {
      return { allowed: false, reason: 'NO_ALLOWLIST' };
    }
    return {
      allowed: true,
      may_send: a.may_send,
      never_send: Array.isArray(a.never_send) ? a.never_send : [],
      provider: a.provider === 'cloud' ? 'cloud' : 'local',
    };
  }

  // ── Request construction ───────────────────────────────────────────
  // The only way to build a request. Returns the object AND the list of
  // everything it refused, because a silent drop teaches nobody why
  // their assistant is unhelpful.

  function buildRequest(opts) {
    const o = opts || {};
    const errors = [];

    if (!INTENTS.includes(o.intent)) {
      return { ok: false, reason: 'UNKNOWN_INTENT', message: 'intent must be one of: ' + INTENTS.join(', ') };
    }
    if (!o.requestedBy) return { ok: false, reason: 'NO_REQUESTED_BY', message: 'requestedBy is required — no untraceable calls' };
    if (!o.reason || String(o.reason).length < 4) {
      return { ok: false, reason: 'NO_REASON', message: 'reason is required and is shown to the person before sending' };
    }

    // Options are a gate BEFORE the manifest. A module may declare an
    // allowlist all it likes; if the person has assistance off, or has not
    // enabled this intent, no request is built at all.
    const userOpts = o.options || (typeof OPTS !== 'undefined' ? OPTS : null);
    if (userOpts) {
      if (userOpts.assist_enabled !== true) {
        return { ok: false, reason: 'ASSISTANCE_OFF', message: 'Assistance is switched off in Options. Nothing is built and nothing is sent.' };
      }
      const intents = userOpts.assist_intents || {};
      if (intents[o.intent] !== true) {
        return { ok: false, reason: 'INTENT_NOT_ENABLED', message: 'The intent "' + o.intent + '" is not enabled in Options.' };
      }
    }

    const gate = checkManifest(o.manifest);
    if (!gate.allowed) {
      return { ok: false, reason: gate.reason, message: 'The module "' + o.requestedBy + '" is not permitted to send anything.' };
    }

    // Options cap the budget; a module cannot ask for more than the person
    // has allowed, only for less.
    const optBudget = userOpts ? { maxChars: userOpts.assist_maxchars, maxItems: userOpts.assist_maxitems } : {};
    const budget = Object.assign({}, DEFAULT_BUDGET, optBudget, o.budget || {});
    if (userOpts) {
      if (userOpts.assist_maxchars) budget.maxChars = Math.min(budget.maxChars, userOpts.assist_maxchars);
      if (userOpts.assist_maxitems) budget.maxItems = Math.min(budget.maxItems, userOpts.assist_maxitems);
    }
    const items = Array.isArray(o.items) ? o.items : [];

    const content = [];
    const dropped = [];
    let chars = 0;

    for (const item of items) {
      const field = item && item.field;
      const text = item && typeof item.text === 'string' ? item.text : '';

      if (!field) { dropped.push({ field: null, why: 'NO_FIELD' }); continue; }
      if (_isForbidden(field)) { dropped.push({ field, why: 'FORBIDDEN_BY_POLICY' }); continue; }
      if (gate.never_send.some((p) => _matches(field, p))) { dropped.push({ field, why: 'MODULE_NEVER_SEND' }); continue; }
      if (!gate.may_send.some((p) => _matches(field, p))) { dropped.push({ field, why: 'NOT_IN_ALLOWLIST' }); continue; }
      if (!text.trim()) { dropped.push({ field, why: 'EMPTY' }); continue; }

      if (content.length >= budget.maxItems) { dropped.push({ field, why: 'OVER_ITEM_BUDGET' }); continue; }
      if (chars + text.length > budget.maxChars) { dropped.push({ field, why: 'OVER_CHAR_BUDGET' }); continue; }

      chars += text.length;
      content.push({ field, text, nodeId: item.nodeId || null });
    }

    if (!content.length) {
      return {
        ok: false, reason: 'NOTHING_SENDABLE',
        message: 'Every item was refused. Nothing would be sent.',
        dropped,
      };
    }

    const request = {
      requestId: o.requestId || _rid(),
      createdAt: o.now || new Date().toISOString(),
      intent: o.intent,
      requestedBy: o.requestedBy,
      reason: o.reason,
      content,
      budget: { maxChars: budget.maxChars, maxItems: budget.maxItems, maxTokens: budget.maxTokens || null, timeoutMs: budget.timeoutMs || null },
      // The person's setting wins over the module's. A module asking for
      // cloud does not get it while Options says local.
      provider: (userOpts && userOpts.assist_provider === 'cloud' && gate.provider === 'cloud') ? 'cloud' : 'local',
    };

    return { ok: true, request, dropped, chars, errors };
  }

  // What actually crosses the wire: the request minus the local-only
  // nodeIds. Kept separate and explicit so the difference between "what
  // I built" and "what I sent" is visible rather than implied.
  function toWire(request) {
    return {
      intent: request.intent,
      reason: request.reason,
      content: request.content.map((c) => ({ field: c.field, text: c.text })),
      budget: request.budget,
    };
  }

  // ── Receipt ────────────────────────────────────────────────────────
  // Hash of exactly the wire payload. Goes to the audit ledger, so what
  // left the machine is a record rather than a recollection.

  function receipt(request, hashHex) {
    const wire = toWire(request);
    const chars = wire.content.reduce((n, c) => n + c.text.length, 0);
    return {
      requestId: request.requestId,
      at: request.createdAt,
      intent: request.intent,
      requestedBy: request.requestedBy,
      provider: request.provider,
      items: wire.content.length,
      chars,
      fields: [...new Set(wire.content.map((c) => c.field))],
      sha256: hashHex || null,
    };
  }

  // The exact bytes to hash, and the exact bytes to send. One function,
  // so a receipt can never describe something other than what was sent.
  function wireBytes(request) {
    return JSON.stringify(toWire(request));
  }

  // ── Response validation ────────────────────────────────────────────

  function validateResponse(raw, request) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reason: 'NOT_AN_OBJECT', message: 'The assistant returned something that is not a response object.' };
    }
    if (request && raw.requestId && raw.requestId !== request.requestId) {
      return { ok: false, reason: 'REQUEST_ID_MISMATCH', message: 'Response does not belong to this request.' };
    }
    if (!raw.model) return { ok: false, reason: 'NO_MODEL', message: 'A response with no model name cannot be attributed.' };

    const proposals = Array.isArray(raw.proposals) ? raw.proposals : [];
    const kept = [];
    const rejected = [];

    // The set of node ids this request actually mentioned. A proposal
    // about anything else is a proposal about something the assistant
    // was never shown, and is refused.
    const known = new Set((request && request.content || []).map((c) => c.nodeId).filter(Boolean));

    for (const p of proposals) {
      if (!p || typeof p !== 'object') { rejected.push({ p, why: 'NOT_AN_OBJECT' }); continue; }
      if (!['tag', 'edge', 'node', 'choice', 'text'].includes(p.kind)) {
        rejected.push({ p, why: 'UNKNOWN_KIND' }); continue;
      }
      if (p.kind === 'edge') {
        if (!EDGE_TYPES.includes(p.edgeType)) { rejected.push({ p, why: 'UNKNOWN_EDGE_TYPE' }); continue; }
        if (known.size && p.targetId && !known.has(p.targetId)) { rejected.push({ p, why: 'UNKNOWN_TARGET' }); continue; }
        if (known.size && p.toId && !known.has(p.toId)) { rejected.push({ p, why: 'UNKNOWN_TARGET' }); continue; }
      }
      if (p.kind === 'tag' && (!p.tag || typeof p.tag !== 'string')) { rejected.push({ p, why: 'NO_TAG' }); continue; }
      if ((p.kind === 'node' || p.kind === 'text') && !p.text) { rejected.push({ p, why: 'NO_TEXT' }); continue; }
      if (p.confidence != null && (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1)) {
        rejected.push({ p, why: 'BAD_CONFIDENCE' }); continue;
      }
      kept.push(p);
    }

    if (!kept.length && !raw.refusal) {
      // An empty list with no stated refusal is indistinguishable from a
      // failure, and treating it as "nothing to suggest" hides breakage.
      return {
        ok: false, reason: 'EMPTY_WITHOUT_REFUSAL',
        message: 'No usable proposals and no stated refusal.',
        rejected,
      };
    }

    return {
      ok: true,
      response: {
        requestId: (request && request.requestId) || raw.requestId || null,
        model: raw.model,
        receivedAt: raw.receivedAt || new Date().toISOString(),
        durationMs: raw.durationMs || null,
        proposals: kept,
        refusal: raw.refusal || null,
      },
      rejected,
    };
  }

  // ── Proposals → nodes ──────────────────────────────────────────────
  // Only called on ACCEPT. Never automatic.

  function proposalToNode(proposal, response, ctx) {
    const c = ctx || {};
    if (proposal.kind !== 'node' && proposal.kind !== 'text') return null;
    return {
      id: c.id || _rid('N'),
      type: c.type || 'idea',
      created: new Date().toISOString(),
      spokenAt: null,
      text: proposal.text,
      tags: [],
      provenance: {
        author: 'model',
        model: response.model,
        via: 'assist',
        source: 'assist',
        file: null,
        transcriber: null,
        timeTrusted: true,
        requestId: response.requestId,
      },
      // A model-authored node is sandbox material by default. It has not
      // been through your own thinking yet, and weighing it as an
      // observation is exactly what P8 compartments exist to prevent.
      mode: c.mode || 'sandbox',
      confidence: null,
      seed: null,
      sessionId: c.sessionId || null,
      seq: null,
      payload: { rationale: proposal.rationale || null },
    };
  }

  function proposalToEdge(proposal, response) {
    if (proposal.kind !== 'edge') return null;
    return {
      id: _rid('E'),
      from: proposal.targetId,
      to: proposal.toId,
      type: proposal.edgeType,
      created: new Date().toISOString(),
      weight: proposal.confidence != null ? proposal.confidence : 0.5,
      label: proposal.rationale || null,
      origin: 'model',
      requestId: response.requestId,
    };
  }

  function _rid(prefix) {
    const r = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.randomUUID)
      ? globalThis.crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return (prefix || 'R') + '-' + r;
  }

  return {
    INTENTS, EDGE_TYPES, NEVER_SEND, DEFAULT_BUDGET,
    checkManifest, buildRequest, toWire, wireBytes, receipt,
    validateResponse, proposalToNode, proposalToEdge,
  };
});
