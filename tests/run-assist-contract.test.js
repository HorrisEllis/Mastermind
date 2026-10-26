'use strict';
// ═══════════════════════════════════════════════════════════════════
// ASSIST CONTRACT
//
// Most of these are refusal tests. The value of this module is what it
// will NOT do, and a boundary that is only tested on its happy path is
// not a boundary.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const AC = require('../foundation/ai/assist-contract.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const MANIFEST = {
  id: 'voice-lattice',
  assistance: {
    enabled: true,
    provider: 'local',
    may_send: ['utterance.text', 'node.tags'],
    never_send: ['node.body'],
  },
};

const base = (over) => Object.assign({
  intent: 'suggest-tags',
  requestedBy: 'voice-lattice',
  reason: 'suggest tags for three utterances',
  manifest: MANIFEST,
  items: [{ field: 'utterance.text', text: 'the vault header carries the salt', nodeId: 'N1' }],
}, over || {});

console.log('\nASSIST CONTRACT\n');

// ── Schemas exist and are valid ────────────────────────────────────

t('the four schemas exist and parse', () => {
  const dir = path.resolve(__dirname, '..', 'schemas');
  for (const f of ['node.schema.json', 'edge.schema.json', 'assist-request.schema.json', 'assist-response.schema.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(j.$id, f + ' has no $id');
    assert.ok(j.description, f + ' has no description');
  }
});

t('the node schema REQUIRES provenance and mode', () => {
  const j = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schemas', 'node.schema.json'), 'utf8'));
  assert.ok(j.required.includes('provenance'));
  assert.ok(j.required.includes('mode'), 'mode cannot be retrofitted, so it cannot be optional');
});

t('a model-authored node must name its model AND its request', () => {
  const j = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schemas', 'node.schema.json'), 'utf8'));
  const rule = j.properties.provenance.allOf[0];
  assert.strictEqual(rule.if.properties.author.const, 'model');
  assert.deepStrictEqual(rule.then.required, ['model', 'requestId']);
});

t('the edge vocabulary includes contradicts', () => {
  const j = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'schemas', 'edge.schema.json'), 'utf8'));
  assert.ok(j.properties.type.enum.includes('contradicts'),
    'a lattice that cannot represent disagreement with yourself is missing most of thinking');
});

// ── The gate ───────────────────────────────────────────────────────

t('a module with no assistance block sends nothing', () => {
  const r = AC.buildRequest(base({ manifest: { id: 'x' } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'MODULE_DECLARES_NO_ASSISTANCE');
});

t('assistance disabled means disabled', () => {
  const r = AC.buildRequest(base({ manifest: { assistance: { enabled: false, may_send: ['*'] } } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ASSISTANCE_DISABLED_FOR_MODULE');
});

t('an empty allowlist is a refusal, not a wildcard', () => {
  const r = AC.buildRequest(base({ manifest: { assistance: { enabled: true, may_send: [] } } }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'NO_ALLOWLIST');
});

t('every call needs requestedBy and a reason', () => {
  assert.strictEqual(AC.buildRequest(base({ requestedBy: null })).reason, 'NO_REQUESTED_BY');
  assert.strictEqual(AC.buildRequest(base({ reason: '' })).reason, 'NO_REASON');
});

t('the intent set is closed — there is no free-form prompt', () => {
  assert.strictEqual(AC.buildRequest(base({ intent: 'anything-i-like' })).reason, 'UNKNOWN_INTENT');
  assert.strictEqual(typeof AC.INTENTS.includes('prompt'), 'boolean');
  assert.ok(!AC.INTENTS.includes('prompt'), 'an open prompt would make the boundary unauditable');
});

// ── The allowlist ──────────────────────────────────────────────────

t('an unlisted field is DROPPED and the drop is reported', () => {
  const r = AC.buildRequest(base({
    items: [
      { field: 'utterance.text', text: 'allowed content' },
      { field: 'node.private_notes', text: 'should never leave' },
    ],
  }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.request.content.length, 1);
  assert.ok(r.dropped.some(d => d.field === 'node.private_notes' && d.why === 'NOT_IN_ALLOWLIST'),
    'a silent drop teaches nobody why their assistant is unhelpful');
});

t('THE POLICY: vault fields are refused even if a manifest allows them', () => {
  const permissive = { assistance: { enabled: true, may_send: ['*'] } };
  for (const field of ['password', 'salt', 'encPrivKey', 'identity', 'ledger', 'lexicon']) {
    const r = AC.buildRequest(base({
      manifest: permissive,
      items: [{ field, text: 'secret material' }],
    }));
    assert.strictEqual(r.ok, false, field + ' was not refused');
    assert.strictEqual(r.reason, 'NOTHING_SENDABLE');
    assert.strictEqual(r.dropped[0].why, 'FORBIDDEN_BY_POLICY',
      'a manifest is configuration; NEVER_SEND is policy and configuration does not override it');
  }
});

t('wildcard vault subfields are refused too', () => {
  const permissive = { assistance: { enabled: true, may_send: ['*'] } };
  const r = AC.buildRequest(base({ manifest: permissive, items: [{ field: 'vault.canvas.nodes', text: 'everything' }] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.dropped[0].why, 'FORBIDDEN_BY_POLICY');
});

t('a module-declared never_send beats its own may_send', () => {
  const r = AC.buildRequest(base({
    manifest: { assistance: { enabled: true, may_send: ['node.*'], never_send: ['node.body'] } },
    items: [{ field: 'node.body', text: 'the whole node' }],
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.dropped[0].why, 'MODULE_NEVER_SEND');
});

t('when everything is refused, nothing is sent at all', () => {
  const r = AC.buildRequest(base({ items: [{ field: 'not.allowed', text: 'x' }] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'NOTHING_SENDABLE');
  assert.strictEqual(r.request, undefined);
});

// ── Budget ─────────────────────────────────────────────────────────

t('the character budget is enforced', () => {
  const r = AC.buildRequest(base({
    budget: { maxChars: 20 },
    items: [
      { field: 'utterance.text', text: 'short one' },
      { field: 'utterance.text', text: 'a considerably longer utterance that will not fit in the budget' },
    ],
  }));
  assert.strictEqual(r.request.content.length, 1);
  assert.ok(r.dropped.some(d => d.why === 'OVER_CHAR_BUDGET'));
});

t('the item budget is enforced', () => {
  const items = Array.from({ length: 10 }, () => ({ field: 'utterance.text', text: 'one' }));
  const r = AC.buildRequest(base({ budget: { maxItems: 3 }, items }));
  assert.strictEqual(r.request.content.length, 3);
});

// ── The wire ───────────────────────────────────────────────────────

t('THE WIRE: node ids are stripped before anything is sent', () => {
  const r = AC.buildRequest(base());
  const wire = AC.toWire(r.request);
  assert.strictEqual(wire.content[0].nodeId, undefined, 'internal ids must not leave');
  assert.ok(!AC.wireBytes(r.request).includes('N1'));
});

t('the wire carries ONLY intent, reason, content and budget', () => {
  const wire = AC.toWire(AC.buildRequest(base()).request);
  assert.deepStrictEqual(Object.keys(wire).sort(), ['budget', 'content', 'intent', 'reason']);
  assert.strictEqual(wire.requestedBy, undefined);
});

t('the receipt describes exactly what was sent', () => {
  const r = AC.buildRequest(base());
  const rec = AC.receipt(r.request, 'a'.repeat(64));
  assert.strictEqual(rec.items, 1);
  assert.strictEqual(rec.chars, 'the vault header carries the salt'.length);
  assert.deepStrictEqual(rec.fields, ['utterance.text']);
  assert.strictEqual(rec.sha256.length, 64);
});

t('local is the default provider', () => {
  assert.strictEqual(AC.buildRequest(base()).request.provider, 'local');
});

// ── Responses ──────────────────────────────────────────────────────

t('a response with no model is refused — it cannot be attributed', () => {
  const v = AC.validateResponse({ proposals: [{ kind: 'tag', tag: 'VAULT' }] }, null);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.reason, 'NO_MODEL');
});

t('a response for a different request is refused', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({ requestId: 'someone-else', model: 'm', proposals: [] }, req);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.reason, 'REQUEST_ID_MISMATCH');
});

t('an empty response with no stated refusal is a FAILURE, not a shrug', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({ requestId: req.requestId, model: 'm', proposals: [] }, req);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.reason, 'EMPTY_WITHOUT_REFUSAL');
});

t('an explicit refusal is accepted', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({ requestId: req.requestId, model: 'm', proposals: [], refusal: 'not enough context' }, req);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.response.refusal, 'not enough context');
});

t('a proposal about a node the assistant was never shown is rejected', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({
    requestId: req.requestId, model: 'm',
    proposals: [{ kind: 'edge', edgeType: 'related', targetId: 'N1', toId: 'N-NEVER-SENT' }],
  }, req);
  assert.strictEqual(v.ok, false);
  assert.ok(v.rejected.some(r => r.why === 'UNKNOWN_TARGET'));
});

t('an invented edge type is rejected', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({
    requestId: req.requestId, model: 'm',
    proposals: [{ kind: 'edge', edgeType: 'vibes-with', targetId: 'N1', toId: 'N1' }],
  }, req);
  assert.ok(v.rejected.some(r => r.why === 'UNKNOWN_EDGE_TYPE'));
});

t('an out-of-range confidence is rejected rather than clamped', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({
    requestId: req.requestId, model: 'm',
    proposals: [{ kind: 'tag', tag: 'X', confidence: 4.2 }],
  }, req);
  assert.ok(v.rejected.some(r => r.why === 'BAD_CONFIDENCE'));
});

// ── Proposals become nodes only on accept ──────────────────────────

t('THE PROVENANCE TEST: an accepted proposal is marked model-authored forever', () => {
  const req = AC.buildRequest(base()).request;
  const v = AC.validateResponse({
    requestId: req.requestId, model: 'llama3.2:3b',
    proposals: [{ kind: 'node', text: 'what if the salt lived in the header', rationale: 'follows from the constraint' }],
  }, req);
  const node = AC.proposalToNode(v.response.proposals[0], v.response, {});
  assert.strictEqual(node.provenance.author, 'model');
  assert.strictEqual(node.provenance.model, 'llama3.2:3b');
  assert.strictEqual(node.provenance.requestId, req.requestId);
  assert.strictEqual(node.provenance.via, 'assist');
});

t('a model-authored node lands in the SANDBOX, not among observations', () => {
  const v = AC.validateResponse({ model: 'm', proposals: [{ kind: 'node', text: 'an idea' }] }, null);
  const node = AC.proposalToNode(v.response.proposals[0], v.response, {});
  assert.strictEqual(node.mode, 'sandbox',
    'it has not been through your own thinking yet, so it must not be weighed like an observation');
});

t('a model-proposed edge is distinguishable from a computed one', () => {
  const v = AC.validateResponse({
    model: 'm', proposals: [{ kind: 'edge', edgeType: 'contradicts', targetId: 'A', toId: 'B', confidence: 0.7 }],
  }, null);
  const edge = AC.proposalToEdge(v.response.proposals[0], v.response);
  assert.strictEqual(edge.origin, 'model');
  assert.strictEqual(edge.type, 'contradicts');
  assert.ok(edge.requestId !== undefined);
});

t('nothing in this module reads or applies anything by itself', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'foundation', 'ai', 'assist-contract.js'), 'utf8');
  for (const forbidden of ['latticeIngest', 'vaultSave', 'vaultLoad', 'localStorage', 'fetch(', 'NXAPI']) {
    assert.ok(!src.includes(forbidden),
      'assist-contract must not reference ' + forbidden + ' — it cannot read the vault or apply anything');
  }
});

// ── Options gate the contract ───────────────────────────────────────
// The panel is only real if the code reads it. These pass OPTS in
// explicitly so the gate is tested rather than assumed.

const OPTS_ON = {
  assist_enabled: true,
  assist_provider: 'local',
  assist_intents: { 'suggest-tags': true, 'disambiguate': true },
  assist_maxchars: 4000, assist_maxitems: 20,
};

t('OPTIONS GATE: assistance off means no request is even built', () => {
  const r = AC.buildRequest(base({ options: Object.assign({}, OPTS_ON, { assist_enabled: false }) }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ASSISTANCE_OFF');
  assert.strictEqual(r.request, undefined, 'nothing is constructed, so nothing can leak');
});

t('an intent switched off in Options is refused even if the module allows it', () => {
  const r = AC.buildRequest(base({
    intent: 'propose-edges',
    options: Object.assign({}, OPTS_ON, { assist_intents: { 'propose-edges': false } }),
  }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'INTENT_NOT_ENABLED');
});

t('an enabled intent passes the gate', () => {
  const r = AC.buildRequest(base({ options: OPTS_ON }));
  assert.strictEqual(r.ok, true);
});

t('the Options budget CAPS the module — a module cannot ask for more', () => {
  const r = AC.buildRequest(base({
    options: Object.assign({}, OPTS_ON, { assist_maxchars: 25 }),
    budget: { maxChars: 99999 },
    items: [
      { field: 'utterance.text', text: 'short' },
      { field: 'utterance.text', text: 'a much longer utterance that exceeds the twenty five character ceiling' },
    ],
  }));
  assert.strictEqual(r.request.budget.maxChars, 25, 'the person\u2019s ceiling wins');
  assert.strictEqual(r.request.content.length, 1);
});

t('THE PROVIDER TEST: Options local beats a module asking for cloud', () => {
  const r = AC.buildRequest(base({
    manifest: { assistance: { enabled: true, provider: 'cloud', may_send: ['utterance.text'] } },
    options: Object.assign({}, OPTS_ON, { assist_provider: 'local' }),
  }));
  assert.strictEqual(r.request.provider, 'local',
    'a module must not be able to send to the cloud while the person has chosen local');
});

t('cloud requires BOTH the module and the person to say cloud', () => {
  const both = AC.buildRequest(base({
    manifest: { assistance: { enabled: true, provider: 'cloud', may_send: ['utterance.text'] } },
    options: Object.assign({}, OPTS_ON, { assist_provider: 'cloud' }),
  }));
  assert.strictEqual(both.request.provider, 'cloud');

  const moduleLocal = AC.buildRequest(base({ options: Object.assign({}, OPTS_ON, { assist_provider: 'cloud' }) }));
  assert.strictEqual(moduleLocal.request.provider, 'local', 'module declares local, so local');
});

const fails = results.filter(r => !r.ok);
console.log('\nassist-contract: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
