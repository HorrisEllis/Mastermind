/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK FRAMEWORK MODEL  ·  framework-model.js  ·  v1.0.0                ║
 * ║  UUID: alk-mod-fwk-0000-2800-0000-000000000001                         ║
 * ║  HOOK: alk.module.framework:belief-model:00001                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signal, not diagnosis. Not truth claims.
 * §1.2 — All errors loud. Zero silent failures.
 * §4.3 — No PII. Behavioral signals only.
 * §5.5 — No external dependencies. All statistics built from first principles.
 * §5.7 — Zero direct module calls. All I/O via kernel bus only.
 * §K1  — Events immutable after construction.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A person is not just emoting. They are operating inside frameworks —
 * implicit models of how the world works, how relationships work, how they
 * work. These frameworks generate predictions. Reality confirms or violates
 * those predictions. When reality violates them hard enough, frameworks
 * update — or the person doubles down.
 *
 * This module tracks those frameworks as Bayesian belief structures,
 * monitors the incoming signal stream for confirmation, contradiction,
 * and anomaly relative to each framework, and detects:
 *
 *   — Which frameworks are currently active
 *   — Which are being challenged
 *   — Which are undergoing revision
 *   — Which are rigidly defended (high confidence + persistent contradiction)
 *   — Where coherence is breaking down
 *   — Where something new is trying to emerge
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: MULTI-SCALE SIGMA FIELDS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * From the Systems module design notes:
 *
 * "A relational system models interaction as deviation from an adaptive
 * invariant baseline, expressed across multi-scale sigma fields."
 *
 * Four sigma types, each operating at different timescales:
 *
 *   σₙ  (NOISE)      Frame-level. Normal variance. Not signal.
 *   σₜ  (TEMPORAL)   Utterance-level. Drift over time. Trend.
 *   σₛ  (STRUCTURAL) Session-level. Pattern shift. Regime change.
 *   σᵣ  (ASYMMETRY)  Cross-channel. Mismatch between modalities.
 *
 * GAP  = σ deviation above tolerance band. Statistically significant
 *         misalignment from invariant expectation.
 *
 * EDGE = stabilized low-σ constraint. A repeatable, low-variance channel
 *         that has become predictable and therefore structural.
 *
 * INVERSION = reinterpretation of the σ mapping function — not a state flip
 *              but an epistemic revision. The model changes, not the world.
 *
 * CONDITIONS = σ-validity gates. A transformation is only valid if:
 *   - σ scale is correctly identified
 *   - baseline is stable enough
 *   - variance is not noise-dominated
 *   - regime has not shifted mid-observation
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FRAMEWORK TYPES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SELF_MODEL        — "Who I am" — stable self-concept
 * RELATIONAL        — "How relationships work" — attachment patterns
 * CAUSAL            — "How things happen" — locus of control, causation
 * SAFETY            — "What's dangerous" — threat appraisal model
 * WORTH             — "What I deserve / am worth" — value model
 * AGENCY            — "What I can affect" — efficacy model
 * TEMPORAL          — "How time and change work" — permanence model
 * MEANING           — "What matters / why" — purpose and significance model
 * SOCIAL            — "How people work" — theory of mind model
 * REALITY           — "What's real / possible" — epistemological model
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BAYESIAN UPDATE MECHANISM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each framework has:
 *   prior         — initial probability (derived from session history)
 *   likelihood    — P(observation | framework active)
 *   posterior     — updated belief after observation
 *   confidence    — certainty in the framework itself
 *   rigidity      — resistance to update (high = confirmation bias active)
 *
 * Update rule:
 *   posterior ∝ prior × likelihood(evidence)
 *   rigidity = f(contradiction_count, persistence, suppression)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULATION DETECTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * People run internal simulations constantly — "what would happen if..."
 * "imagine they said..." "when X happens I always..."
 *
 * Simulation speech has distinct features:
 *   - Hypothetical framing (if, when, imagine, suppose)
 *   - Present tense for past events (narrative simulation)
 *   - Second/third person impersonation ("and then they say...")
 *   - Counterfactual chains ("but if I had...")
 *   - Future rehearsal ("next time I'll...")
 *
 * The module detects simulation mode and models what framework is being
 * tested — what the person is trying to figure out about their world.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — INBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.verbal.transcript
 *  alk.speech.mode
 *  alk.speech.fragmentation
 *  alk.speech.emotion.spectrum
 *  alk.speech.integration
 *  alk.speech.self_reference
 *  alk.speech.dysregulation
 *  alk.htl.ns.state
 *  alk.htl.emo.state
 *  alk.htl.val.profile
 *  alk.htl.att.state
 *  alk.latent.update
 *  alk.signal.composite
 *  alk.session.capture.start
 *  alk.session.capture.stop
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — OUTBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.framework.active         { frameworks[], dominant, simulation_mode }
 *  alk.framework.contradiction  { framework, evidence, sigma_type, magnitude }
 *  alk.framework.update         { framework, direction, old_conf, new_conf }
 *  alk.framework.rigidity       { framework, rigidity_score, confirmation_count }
 *  alk.framework.coherence      { global_coherence, gaps[], edges[], sigma_map }
 *  alk.framework.inversion      { framework, old_model, new_model, confidence }
 *  alk.framework.simulation     { mode, testing_framework, hypothesis, chain }
 *  alk.framework.anomaly        { type, sigma_type, magnitude, context }
 *  alk.framework.summary        { session-end state of all frameworks }
 *  alk.framework.error
 */

'use strict';

export const MODULE_UUID    = 'alk-mod-fwk-0000-2800-0000-000000000001';
export const MODULE_VERSION = '1.0.0';

// ─── Utilities ────────────────────────────────────────────────────────────────

function r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)        { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function variance(arr)    { if (arr.length<2) return 0; const m=mean(arr); return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length; }
function stddev(arr)      { return Math.sqrt(variance(arr)); }
function tokenize(t)      { return (t??'').toLowerCase().replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean); }

class SlidingWindow {
  constructor(n=30) { this._b=[]; this._n=n; }
  push(v)    { this._b.push(v); if(this._b.length>this._n) this._b.shift(); return this; }
  get vals() { return [...this._b]; }
  get len()  { return this._b.length; }
  avg()      { return mean(this._b); }
  sd()       { return stddev(this._b); }
  last()     { return this._b[this._b.length-1]??null; }
  delta(n=5) { if(this._b.length<n) return 0; return this._b[this._b.length-1]-this._b[this._b.length-n]; }
  clear()    { this._b=[]; }
  // z-score of latest value against window
  z()        { const s=this.sd(); return s>0?(this.last()-this.avg())/s:0; }
}

// ─── Sigma Field Types ────────────────────────────────────────────────────────

export const SIGMA = Object.freeze({
  NOISE:      'σₙ',  // frame-level variance — normal fluctuation
  TEMPORAL:   'σₜ',  // utterance-level trend — drift
  STRUCTURAL: 'σₛ',  // session-level regime — pattern shift
  ASYMMETRY:  'σᵣ',  // cross-channel mismatch
});

// ─── Framework Definitions ────────────────────────────────────────────────────

export const FRAMEWORK_TYPES = Object.freeze({
  SELF_MODEL:  'SELF_MODEL',
  RELATIONAL:  'RELATIONAL',
  CAUSAL:      'CAUSAL',
  SAFETY:      'SAFETY',
  WORTH:       'WORTH',
  AGENCY:      'AGENCY',
  TEMPORAL:    'TEMPORAL',
  MEANING:     'MEANING',
  SOCIAL:      'SOCIAL',
  REALITY:     'REALITY',
});

/**
 * Each framework definition:
 *   activation_patterns  — language that activates this framework
 *   contradiction_patterns — language that contradicts dominant stance
 *   confirmation_patterns  — language that confirms dominant stance
 *   default_stance       — typical healthy-range belief
 *   pathological_poles   — extremes that indicate framework rigidity
 *   update_markers       — language indicating the framework is updating
 */
const FRAMEWORK_DEFINITIONS = {

  SELF_MODEL: {
    label: 'Self-concept — who I am',
    activation_patterns: [
      /\bi('m| am) (always|never|someone who|the kind of|not the)\b/gi,
      /\bthat'?s? (just who|just how) i (am|work)\b/gi,
      /\bi('ve| have) always (been|done|felt)\b/gi,
      /\bmy (nature|character|personality|identity|self)\b/gi,
      /\bfundamentally\b/gi,
    ],
    contradiction_patterns: [
      /\bi (don't|can't) (recognize|understand) myself\b/gi,
      /\bwho (am|was) i (anymore|even)\b/gi,
      /\bnot like me\b/gi,
      /\bi (used to|would never|always thought i)\b/gi,
      /\bdon't know who i am\b/gi,
    ],
    confirmation_patterns: [
      /\bthat'?s? (so|very|exactly) me\b/gi,
      /\bjust (who|how) i am\b/gi,
      /\bof course i (did|said|felt|would)\b/gi,
      /\bcan't (help|change) it[,.]?\s*(it'?s?|that'?s?|i'?m?) (just|how|who)\b/gi,
    ],
    update_markers: [
      /\bi('m| am) (realizing|learning|discovering) (that i|i'm|about)\b/gi,
      /\bmaybe i (am|am not|don't|do)\b/gi,
      /\bnew (way|side|part) of (me|myself)\b/gi,
      /\bi'?m? (changing|growing|different)\b/gi,
    ],
    default_stance: 'stable and permeable',
    pathological_poles: {
      rigid: 'fixed identity, no capacity for revision',
      collapsed: 'no stable self-concept, identity diffuse',
    },
  },

  RELATIONAL: {
    label: 'How relationships work',
    activation_patterns: [
      /\b(people|they|everyone|no one) (always|never|will|won't|can't|can)\b/gi,
      /\brelationships (are|always|never|have to)\b/gi,
      /\bif you (love|care|trust|want)\b/gi,
      /\byou (can't|can|should|have to)\b/gi,
      /\bpeople (leave|stay|hurt|help|use)\b/gi,
    ],
    contradiction_patterns: [
      /\bi (didn't|don't) (expect|think) (they|you|anyone|he|she) (would|could|did)\b/gi,
      /\bthat'?s? (not|so) (how it works|normal|okay|right)\b/gi,
      /\bi (thought|expected|assumed) (they|you|he|she)\b/gi,
    ],
    confirmation_patterns: [
      /\bsee[?.]?\s*(this|that|i told you|i knew)\b/gi,
      /\b(knew|thought|figured|knew it) (it|they|you|he|she) would\b/gi,
      /\bjust (like|as) i (said|thought|expected|knew)\b/gi,
      /\b(always|never) (happens|ends|turns out)\b/gi,
    ],
    update_markers: [
      /\bmaybe (not all|some|they|he|she)\b/gi,
      /\b(surprised|shocked|didn't expect) (that|when|how)\b/gi,
      /\bnever (thought|knew|imagined) (a|someone|anyone|it) could\b/gi,
    ],
    default_stance: 'trust with boundaries',
    pathological_poles: {
      rigid_distrust: 'everyone will hurt/abandon me',
      rigid_idealization: 'certain people are perfectly safe',
    },
  },

  CAUSAL: {
    label: 'How things happen — causation and control',
    activation_patterns: [
      /\bbecause (of|i|they|it|you|he|she)\b/gi,
      /\b(made|caused|forced|led|drove) (me|this|it|that|him|her)\b/gi,
      /\b(happens|occurs|comes|results) (because|when|from|after)\b/gi,
      /\bif (i|you|they|we|it) (had|have|hadn't|did|didn't)\b/gi,
      /\b(my|their|his|her) fault\b/gi,
    ],
    contradiction_patterns: [
      /\b(that|it|this) (shouldn't|can't|doesn't) (happen|work|make sense)\b/gi,
      /\bwhy (did|would|does|is) this (happen|be|work)\b/gi,
      /\bdoesn't (make sense|add up|follow|compute)\b/gi,
    ],
    confirmation_patterns: [
      /\bof course (it|this|that|they)\b/gi,
      /\bno (wonder|surprise|doubt) (that|they|it)\b/gi,
      /\b(naturally|obviously|inevitably)\b/gi,
      /\bwhat did (i|you|we|they) expect\b/gi,
    ],
    update_markers: [
      /\bmaybe (it'?s?|i|they|this) (wasn't|isn't|wasn't really|actually)\b/gi,
      /\bi (hadn't|didn't|never) (thought|considered|realized) (about|that)\b/gi,
      /\bnew (understanding|perspective|way to think) (of|about|on)\b/gi,
    ],
    default_stance: 'shared causation, contextual',
    pathological_poles: {
      total_external: 'everything happens to me — no agency',
      total_internal: 'everything is my fault — hyperresponsibility',
    },
  },

  SAFETY: {
    label: 'Threat appraisal — what is dangerous',
    activation_patterns: [
      /\b(dangerous|safe|unsafe|risky|careful|protect|threat|harm)\b/gi,
      /\b(can't|won't|shouldn't) (trust|let|allow|do|say|be)\b/gi,
      /\bwhat (if something|could go wrong|happens if)\b/gi,
      /\b(need to|have to) (be careful|watch out|protect|guard)\b/gi,
    ],
    contradiction_patterns: [
      /\bactually (safe|okay|fine|not dangerous|harmless)\b/gi,
      /\bnothing (happened|went wrong|bad occurred)\b/gi,
      /\b(survived|made it|turned out) (okay|fine|alright|through)\b/gi,
    ],
    confirmation_patterns: [
      /\bsee[?.]?\s*(it|that|i told you|i knew)[.!]?\s*(it|that|how|why)?\s*(was|is|can be)?\s*(dangerous|bad|wrong|risky)\b/gi,
      /\b(knew|thought) (it|this|that) (was|would be|could be) (dangerous|bad|risky)\b/gi,
      /\b(almost|nearly|could have) (happened|gone wrong|hurt)\b/gi,
    ],
    update_markers: [
      /\bmaybe (it'?s?|that'?s?|this) (safe|okay|not so dangerous|fine)\b/gi,
      /\b(facing|trying|doing) it (anyway|despite|even though)\b/gi,
      /\bwas (scared|afraid|worried) but (it|this|that) (was|is|turned out)\b/gi,
    ],
    default_stance: 'calibrated to actual threat level',
    pathological_poles: {
      hypervigilant: 'everything is threatening',
      collapsed: 'nothing is dangerous — shutdown of threat detection',
    },
  },

  WORTH: {
    label: 'What I deserve and am worth',
    activation_patterns: [
      /\bi (deserve|don't deserve|shouldn't have|should have)\b/gi,
      /\b(enough|too much|too little|worthy|unworthy|deserve)\b/gi,
      /\b(earned|earned it|didn't earn|worked for)\b/gi,
      /\b(my) (fault|responsibility|problem|burden)\b/gi,
      /\b(too much|not enough|burden|drag)\b/gi,
    ],
    contradiction_patterns: [
      /\b(received|got|experienced) (more|better|more than i|something good)\b/gi,
      /\b(treated|cared for|loved|valued) (well|better|like i)\b/gi,
      /\bsomeone (chose|wanted|loves|values|appreciates) me\b/gi,
    ],
    confirmation_patterns: [
      /\bof course (this|they|it|that) happened (to me|again)\b/gi,
      /\b(always|inevitably|of course) (happens|ends) (to me|like this)\b/gi,
      /\bno (better|different|more) than (i deserve|expected)\b/gi,
    ],
    update_markers: [
      /\bmaybe i (do|am|can|have|deserve|matter)\b/gi,
      /\bstarting to (believe|think|feel) (that i|i'm|i can|i am)\b/gi,
      /\blearning (that i|to|that my)\b/gi,
    ],
    default_stance: 'inherent worth, earned respect',
    pathological_poles: {
      shame_collapse: 'I am fundamentally unworthy',
      entitlement: 'I deserve everything regardless of impact',
    },
  },

  AGENCY: {
    label: 'What I can affect — efficacy',
    activation_patterns: [
      /\b(can|can't|could|couldn't|able|unable|capable|powerless)\b/gi,
      /\b(try|tried|trying|attempt|effort|work)\b/gi,
      /\bno (point|use|reason|choice|way)\b/gi,
      /\b(control|influence|change|affect|impact)\b/gi,
      /\bwhat'?s? the (point|use)\b/gi,
    ],
    contradiction_patterns: [
      /\b(worked|happened|changed|made a difference|succeeded)\b/gi,
      /\b(did it|pulled through|managed|accomplished)\b/gi,
      /\bmore (control|influence|agency|power) than i thought\b/gi,
    ],
    confirmation_patterns: [
      /\b(pointless|useless|doesn't matter|doesn't help|won't work)\b/gi,
      /\bno matter (what i|how much i|how hard)\b/gi,
      /\b(nothing|it|they) (changes|works|helps|matters)\b/gi,
    ],
    update_markers: [
      /\bmaybe i (can|could|have more|am able)\b/gi,
      /\b(found|found a way|figured out|discovered) (how|that i can|i could)\b/gi,
      /\bmore (capable|able|powerful|influential) than\b/gi,
    ],
    default_stance: 'agency within realistic constraints',
    pathological_poles: {
      helplessness: 'I can change nothing',
      omnipotence: 'I control everything / I am responsible for everything',
    },
  },

  TEMPORAL: {
    label: 'How time and change work — permanence',
    activation_patterns: [
      /\b(always|never|forever|permanent|temporary|eventually|someday)\b/gi,
      /\b(will always|will never|it'?s? (always|never) been)\b/gi,
      /\bthings (don't|never|always|will never|can't) change\b/gi,
      /\b(was|used to be) (different|better|worse)\b/gi,
      /\b(this|it) (will (never|always)|won't) (end|change|last)\b/gi,
    ],
    contradiction_patterns: [
      /\b(changed|different|not like it was|moved|shifted)\b/gi,
      /\b(surprised|didn't expect|hadn't thought) (it would|things would|how much)\b/gi,
      /\b(never|didn't) thought (it|things|this|i|they) (could|would|might) (change|be different|end)\b/gi,
    ],
    confirmation_patterns: [
      /\bhere (we|they|it|things) (go|is|are) (again|once more)\b/gi,
      /\b(same|always the same|nothing (new|different|changes))\b/gi,
      /\b(back|returned|again|once more) to (the same|how it always)\b/gi,
    ],
    update_markers: [
      /\b(things|something|it|i)'?m? (actually|really|can) change\b/gi,
      /\bfor the (first time|once)\b/gi,
      /\bnot (the same|how it was|like before)\b/gi,
    ],
    default_stance: 'change possible, some things stable',
    pathological_poles: {
      permanence: 'nothing ever changes — hopelessness',
      impermanence: 'nothing is stable — anxiety',
    },
  },

  MEANING: {
    label: 'What matters and why — purpose',
    activation_patterns: [
      /\b(matters|meaningful|important|point|purpose|worth it|reason)\b/gi,
      /\bwhy (bother|try|even|does (it|this|anything))\b/gi,
      /\b(what'?s? the|there'?s? no|without) (point|meaning|reason|purpose)\b/gi,
      /\b(worth (it|doing|living|trying)|meaningful|significant)\b/gi,
    ],
    contradiction_patterns: [
      /\b(actually|surprisingly) (matters|meaningful|important|worth it)\b/gi,
      /\b(found|finding|discovered|seeing) (meaning|purpose|reason|value)\b/gi,
      /\bmaybe (it|this|all of it) (does|doesn't|means|matters)\b/gi,
    ],
    confirmation_patterns: [
      /\bwhat'?s? (the point|the use|even the reason)\b/gi,
      /\b(nothing|it|all of it) (means|matters|is) (nothing|pointless|empty)\b/gi,
      /\b(doesn't|won't|can't) (matter|mean anything)\b/gi,
    ],
    update_markers: [
      /\b(beginning to|starting to|learning to) (see|find|feel|believe) (the|that|meaning|purpose)\b/gi,
      /\b(new|different|deeper) (meaning|purpose|reason|why)\b/gi,
    ],
    default_stance: 'meaning constructed and discovered',
    pathological_poles: {
      nihilism: 'nothing matters — purpose-collapse',
      rigid_meaning: 'only one thing matters, everything else is worthless',
    },
  },

  SOCIAL: {
    label: 'Theory of mind — how people work',
    activation_patterns: [
      /\b(they|he|she|people|everyone) (always|never|just|probably|definitely) (want|think|feel|mean|do)\b/gi,
      /\b(know|can tell|obvious) (they|what they|what he|what she) (want|think|feel|mean)\b/gi,
      /\b(people are|humans are|everyone is) (fundamentally|basically|really)\b/gi,
      /\b(their|his|her) (real (reason|motive|intention)|agenda|angle)\b/gi,
    ],
    contradiction_patterns: [
      /\b(didn't|don't) (know|understand|get) (why|what|how) (they|he|she)\b/gi,
      /\b(wrong|mistaken|misread|misunderstood) (them|him|her|it|what they)\b/gi,
      /\b(surprised|shocked|didn't expect) (that|when|how|what) (they|he|she)\b/gi,
    ],
    confirmation_patterns: [
      /\b(knew|could tell|obvious|figured) (they|he|she|it) would\b/gi,
      /\b(always|never|every time) (with|about|from) (them|him|her|people)\b/gi,
      /\bjust (like|as) i (said|thought|knew|expected)\b/gi,
    ],
    update_markers: [
      /\b(misunderstood|misjudged|read (wrong|incorrectly|badly)) (them|him|her|that)\b/gi,
      /\bmore (complex|complicated|nuanced|human) than i (thought|realized|knew)\b/gi,
      /\bdidn't (know|realize|understand) (that|how|what) (they|he|she|it)\b/gi,
    ],
    default_stance: 'people are complex, contextual',
    pathological_poles: {
      cynicism: 'everyone is selfish/dangerous/untrustworthy',
      idealization: 'certain people are perfect/always trustworthy',
    },
  },

  REALITY: {
    label: 'What is real and possible — epistemology',
    activation_patterns: [
      /\b(obvious|clearly|obviously|definitely|absolutely|certainly|impossible|impossible)\b/gi,
      /\bthe (truth|reality|fact) (is|of the matter|being)\b/gi,
      /\b(everyone|anyone|no one) (knows|can see|can tell|would agree)\b/gi,
      /\b(can't|doesn't|won't|couldn't) (happen|work|be|exist|be real)\b/gi,
      /\b(just|only|simply|purely) (a|the|is|are|was)\b/gi,
    ],
    contradiction_patterns: [
      /\b(might be|could be|possibly|perhaps|maybe it'?s?) (real|true|possible|happening|different)\b/gi,
      /\b(not sure|uncertain|unclear|confused) (if|whether|what|how|that)\b/gi,
      /\b(thought|assumed|believed) (it was|this was|that was) (impossible|impossible|couldn't)\b/gi,
    ],
    confirmation_patterns: [
      /\b(see[?.!]|there[.!]|told (you|them)|knew (it|this|that))\b/gi,
      /\b(of course|naturally|obviously|exactly) (as|what|how|that) i (thought|said|knew)\b/gi,
    ],
    update_markers: [
      /\bmaybe (i|it|this|that) (was|is|can be|isn't|aren't) (wrong|right|possible|real)\b/gi,
      /\b(realizing|learning|discovering) (that|how|what|the) (world|reality|things|it)\b/gi,
    ],
    default_stance: 'epistemically humble, evidence-responsive',
    pathological_poles: {
      certainty: 'I know exactly how reality works — closed to revision',
      derealization: 'nothing is real / I can\'t trust my perception',
    },
  },
};

// ─── Simulation Mode Patterns ─────────────────────────────────────────────────

const SIMULATION_PATTERNS = {
  // Hypothetical framing
  hypothetical: [
    /\bwhat if (i|they|we|he|she|it)\b/gi,
    /\bimagine (if|that|i|they|we)\b/gi,
    /\bsuppose (that|i|they|we|he|she)\b/gi,
    /\blet'?s? say (that|i|they|if)\b/gi,
    /\bpicture (this|it|if|that)\b/gi,
  ],
  // Future rehearsal
  rehearsal: [
    /\bnext time (i|they|we|he|she|it)\b/gi,
    /\bwhen (this|it|they|he|she) (happen|comes|arrives|occurs) (again|next time)\b/gi,
    /\bi'?ll? (say|do|tell|ask|respond) (next time|if they|when they)\b/gi,
    /\b(going to|planning to|will) (say|do|tell|respond|handle) (differently|instead|if)\b/gi,
  ],
  // Counterfactual
  counterfactual: [
    /\bif (only|i had|they had|we had|it hadn't|i hadn't|it had)\b/gi,
    /\b(should|could|would) have (said|done|told|been|known|acted)\b/gi,
    /\bwhat (if i|if they|if we|if it) had\b/gi,
  ],
  // Present-tense narrative (replaying)
  replay: [
    /\bso (then|i|they|he|she) (say|says|go|goes|do|does|tell|tells)\b/gi, // narrative present
    /\band (i|they|he|she) (look|say|go|feel|think|do) (at|and|but|then)\b/gi,
    /\b(i|they|he|she)'?m? (standing|sitting|walking|looking|trying)\b/gi, // present-tense past event
  ],
  // Voice impersonation
  impersonation: [
    /\b(and|so|then) (they|he|she|you) (say|go|ask|tell) ["""']?\s*\w/gi,
    /\b(like|goes|said|says)[,.]?\s*["""']\w/gi,
    /\b(and i|so i|then i) (say|said|go|went|tell|told)[,.]?\s*["""']\w/gi,
  ],
};

// ─── Belief State ─────────────────────────────────────────────────────────────

class BeliefState {
  constructor(type, label) {
    this.type             = type;
    this.label            = label;

    // Bayesian core
    this.prior            = 0.5;   // initial probability
    this.likelihood       = 0.5;   // P(current evidence | framework active)
    this.posterior        = 0.5;   // updated belief
    this.log_odds         = 0;     // log(posterior / (1 - posterior))

    // Confidence in the framework itself (not belief level)
    this.confidence       = 0.5;

    // Rigidity — resistance to update
    this.rigidity         = 0;     // 0 = fully open, 1 = completely closed
    this.confirmation_count = 0;
    this.contradiction_count = 0;
    this.last_update_dir  = null;  // 'up' | 'down' | null

    // Activity
    this.active           = false;
    this.activation_score = 0;
    this.frames_active    = 0;

    // Sigma tracking
    this.sigma_windows = {
      noise:      new SlidingWindow(10),
      temporal:   new SlidingWindow(20),
      structural: new SlidingWindow(40),
      asymmetry:  new SlidingWindow(20),
    };

    // Session history
    this.activation_history = new SlidingWindow(50);
    this.contradiction_history = [];
    this.update_history     = [];

    // Simulation tracking
    this.simulation_mode   = false;
    this.simulation_type   = null;
  }

  /**
   * Bayesian update.
   * Uses log-odds form for numerical stability.
   * P(F|E) = P(E|F) * P(F) / P(E)
   * log-odds(posterior) = log-odds(prior) + log(likelihood ratio)
   *
   * @param {number} likelihood_ratio  — P(E|F=true) / P(E|F=false)
   * @param {number} weight            — observation reliability [0,1]
   * @param {string} direction         — 'confirm' | 'contradict' | 'neutral'
   */
  update(likelihood_ratio, weight, direction) {
    const effectiveLR = 1 + (likelihood_ratio - 1) * weight * (1 - this.rigidity);
    const logLR       = Math.log(Math.max(0.01, effectiveLR));

    this.log_odds    += logLR;
    this.log_odds     = clamp(this.log_odds, -4, 4); // cap at ~98% / 2%

    this.posterior    = 1 / (1 + Math.exp(-this.log_odds));
    this.prior        = this.prior * 0.95 + this.posterior * 0.05; // slow EMA

    if (direction === 'confirm') {
      this.confirmation_count++;
      this.last_update_dir = 'up';
    } else if (direction === 'contradict') {
      this.contradiction_count++;
      this.last_update_dir = 'down';

      // Rigidity increases when confirmations are higher than contradictions
      // — person ignoring disconfirming evidence
      if (this.confirmation_count > this.contradiction_count * 2) {
        this.rigidity = clamp(this.rigidity + 0.05);
      }
    }

    // Confidence grows with evidence volume, shrinks with contradiction
    this.confidence = clamp(
      0.3 +
      Math.min(this.confirmation_count + this.contradiction_count, 20) * 0.02 -
      this.contradiction_count * 0.015
    );

    this.activation_history.push(this.posterior);
    this.update_history.push({
      dir: direction,
      lr:  r4(likelihood_ratio),
      post: r4(this.posterior),
      ts:  Date.now(),
    });
    if (this.update_history.length > 20) this.update_history.shift();
  }

  /**
   * Sigma field update.
   * Each observation pushes a value into the appropriate sigma window.
   * Z-score of the window determines if this is noise, drift, or shift.
   */
  pushSigma(type, value) {
    switch(type) {
      case SIGMA.NOISE:      this.sigma_windows.noise.push(value);      break;
      case SIGMA.TEMPORAL:   this.sigma_windows.temporal.push(value);   break;
      case SIGMA.STRUCTURAL: this.sigma_windows.structural.push(value); break;
      case SIGMA.ASYMMETRY:  this.sigma_windows.asymmetry.push(value);  break;
    }
  }

  getSigmaZ(type) {
    switch(type) {
      case SIGMA.NOISE:      return this.sigma_windows.noise.z();
      case SIGMA.TEMPORAL:   return this.sigma_windows.temporal.z();
      case SIGMA.STRUCTURAL: return this.sigma_windows.structural.z();
      case SIGMA.ASYMMETRY:  return this.sigma_windows.asymmetry.z();
      default: return 0;
    }
  }

  /**
   * Detect if this framework is undergoing inversion —
   * the mapping function has changed, not just the belief level.
   *
   * Inversion = contradiction_count is rising AND posterior is also rising
   * — person is reinterpreting contradictions as confirmations,
   *   or vice versa. The sigma map is being relabeled.
   */
  isInverting() {
    if (this.update_history.length < 6) return false;
    const recent = this.update_history.slice(-6);
    const recentContradictions = recent.filter(u => u.dir === 'contradict').length;
    const postTrend = recent[recent.length-1].post - recent[0].post;
    // Contradictions rising but belief not falling = inversion candidate
    return recentContradictions >= 3 && Math.abs(postTrend) < 0.05;
  }

  snapshot() {
    return {
      type:                this.type,
      label:               this.label,
      posterior:           r4(this.posterior),
      confidence:          r4(this.confidence),
      rigidity:            r4(this.rigidity),
      active:              this.active,
      activation_score:    r4(this.activation_score),
      confirmation_count:  this.confirmation_count,
      contradiction_count: this.contradiction_count,
      sigma: {
        noise:      r4(this.getSigmaZ(SIGMA.NOISE)),
        temporal:   r4(this.getSigmaZ(SIGMA.TEMPORAL)),
        structural: r4(this.getSigmaZ(SIGMA.STRUCTURAL)),
        asymmetry:  r4(this.getSigmaZ(SIGMA.ASYMMETRY)),
      },
      last_update: this.last_update_dir,
      inverting:   this.isInverting(),
      simulation:  this.simulation_mode,
    };
  }
}

// ─── Global Coherence ────────────────────────────────────────────────────────

/**
 * Global coherence tracks whether the active frameworks are mutually consistent.
 * Incoherence arises when two active frameworks make contradictory predictions.
 *
 * Known contradictory framework pairs:
 *   AGENCY(high) + CAUSAL(external) — I'm responsible AND it's all their fault
 *   WORTH(high) + SAFETY(hypervigilant) — I deserve good AND everything is dangerous
 *   TEMPORAL(permanence) + MEANING(nihilism) — nothing changes AND nothing matters (too coherent — despair trap)
 *   SELF_MODEL(stable) + RELATIONAL(distrust) — I'm fine AND everyone will hurt me
 */
const COHERENCE_TENSIONS = [
  { a: 'AGENCY',    b: 'CAUSAL',    condition: (a, b) => a.posterior > 0.7 && b.contradiction_count > 3,  tension: 'agency-causation split' },
  { a: 'WORTH',     b: 'SAFETY',    condition: (a, b) => a.posterior > 0.6 && b.posterior > 0.75,           tension: 'deserving but unsafe' },
  { a: 'TEMPORAL',  b: 'MEANING',   condition: (a, b) => a.rigidity > 0.6 && b.posterior < 0.3,             tension: 'permanence-nihilism trap' },
  { a: 'SELF_MODEL',b: 'RELATIONAL', condition: (a, b) => a.confidence > 0.7 && b.posterior < 0.3,          tension: 'self stable, world hostile' },
  { a: 'AGENCY',    b: 'WORTH',     condition: (a, b) => a.posterior < 0.3 && b.posterior < 0.3,             tension: 'helpless and unworthy — doubled' },
];

// ─── Main Module ──────────────────────────────────────────────────────────────

export class FrameworkModel {
  static UUID    = MODULE_UUID;
  static VERSION = MODULE_VERSION;

  constructor({ kernel, config = {} } = {}) {
    if (!kernel) throw new Error('[FrameworkModel §1.2] kernel is required');

    this.uuid    = MODULE_UUID;
    this.version = MODULE_VERSION;
    this._kernel = kernel;
    this._cfg    = {
      activationThreshold:     config.activationThreshold     ?? 0.30,
      contradictionThreshold:  config.contradictionThreshold  ?? 2.0,   // z-score
      anomalyThreshold:        config.anomalyThreshold        ?? 2.5,
      rigidityAlertThreshold:  config.rigidityAlertThreshold  ?? 0.65,
      inversionMinEvidence:    config.inversionMinEvidence     ?? 8,
      emitIntervalMs:          config.emitIntervalMs           ?? 3000,
    };

    // Initialize all belief states
    this._beliefs = {};
    for (const [type, def] of Object.entries(FRAMEWORK_DEFINITIONS)) {
      this._beliefs[type] = new BeliefState(type, def.label);
    }

    // Global state
    this._latent        = { valence: 0, arousal: 0, suppression: 0, coherence: 0.5, engagement: 0 };
    this._nsState       = null;
    this._speechMode    = null;
    this._fragmentation = null;
    this._emotionSpectrum = null;
    this._selfRef       = null;
    this._valProfile    = null;
    this._attState      = null;

    // Anomaly detection
    this._globalActivationW  = new SlidingWindow(30);
    this._coherenceW         = new SlidingWindow(20);
    this._suppressionW       = new SlidingWindow(30);

    // Simulation tracking
    this._simulationActive   = false;
    this._simulationChain    = [];
    this._simulationType     = null;

    // Session tracking
    this._utteranceCount     = 0;
    this._sessionStart       = null;
    this._emitTimer          = null;

    // Inversion tracking
    this._pendingInversions  = new Map(); // framework → { start, evidence }

    // Edge detection — stabilized low-sigma patterns
    this._edges              = new Map(); // id → { a, b, frequency, barrier }
    this._gapLog             = [];        // recent gaps detected
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  start() {
    const k = this._kernel;
    const s = (ch, fn) => k.subscribe(ch, ev => fn(ev.payload ?? ev));

    s('alk.verbal.transcript',        ev => this._onTranscript(ev));
    s('alk.speech.mode',              ev => { this._speechMode    = ev; });
    s('alk.speech.fragmentation',     ev => { this._fragmentation = ev; });
    s('alk.speech.emotion.spectrum',  ev => { this._emotionSpectrum = ev; });
    s('alk.speech.self_reference',    ev => { this._selfRef       = ev; });
    s('alk.speech.dysregulation',     ev => this._onDysregulation(ev));
    s('alk.htl.ns.state',             ev => { this._nsState       = ev; });
    s('alk.htl.emo.state',            ev => this._onEmoState(ev));
    s('alk.htl.val.profile',          ev => { this._valProfile    = ev; });
    s('alk.htl.att.state',            ev => this._onAttState(ev));
    s('alk.latent.update',            ev => this._onLatent(ev));
    s('alk.signal.composite',         ev => this._onSignalComposite(ev));
    s('alk.session.capture.start',    ()  => this._onSessionStart());
    s('alk.session.capture.stop',     ()  => this._onSessionStop());

    this._kernel.emit('alk.framework.ready', { uuid: MODULE_UUID, version: MODULE_VERSION });
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────

  _onSessionStart() {
    this._sessionStart   = Date.now();
    this._utteranceCount = 0;
    this._simulationActive = false;
    this._simulationChain  = [];
    this._gapLog           = [];
    this._emitTimer = setInterval(() => this._emitCoherence(), this._cfg.emitIntervalMs);
    // Soft reset — beliefs persist across sessions but sigma windows clear
    for (const b of Object.values(this._beliefs)) {
      b.sigma_windows.noise.clear();
      b.sigma_windows.temporal.clear();
    }
  }

  _onSessionStop() {
    clearInterval(this._emitTimer);
    this._emitSummary();
  }

  // ── Inbound handlers ───────────────────────────────────────────────────────

  _onLatent(p) {
    Object.assign(this._latent, {
      valence:    p.valence    ?? this._latent.valence,
      arousal:    p.arousal    ?? this._latent.arousal,
      suppression: p.suppression ?? this._latent.suppression,
      coherence:  p.coherence  ?? this._latent.coherence,
      engagement: p.engagement ?? this._latent.engagement,
    });
    this._suppressionW.push(this._latent.suppression);
    this._coherenceW.push(this._latent.coherence);
  }

  _onDysregulation(p) {
    if (!p.active) return;
    // Dysregulation narrows the window for framework updates
    // — when flooded, beliefs become rigid
    const dy = p.subtype;
    if (dy === 'FLOODING' || dy === 'RAGE_SPEECH') {
      for (const b of Object.values(this._beliefs)) {
        b.rigidity = clamp(b.rigidity + 0.08);
      }
    }
    // Dorsal collapse flattens belief activity — not updating
    if (dy === 'DORSAL_COLLAPSE') {
      for (const b of Object.values(this._beliefs)) {
        b.active = false;
      }
    }
  }

  _onEmoState(p) {
    const dom = p.dominant;
    // Emotional state primes certain frameworks
    const emoFrameMap = {
      FEAR:    ['SAFETY', 'RELATIONAL'],
      RAGE:    ['CAUSAL', 'WORTH', 'RELATIONAL'],
      GRIEF:   ['TEMPORAL', 'MEANING', 'RELATIONAL'],
      CARE:    ['RELATIONAL', 'WORTH'],
      SEEKING: ['REALITY', 'MEANING', 'AGENCY'],
      PLAY:    ['SOCIAL', 'RELATIONAL'],
    };
    const primed = emoFrameMap[dom] ?? [];
    for (const type of primed) {
      if (this._beliefs[type]) {
        this._beliefs[type].activation_score = clamp(this._beliefs[type].activation_score + 0.05);
      }
    }
  }

  _onAttState(p) {
    this._attState = p;
    // Attachment pattern updates RELATIONAL and SAFETY frameworks
    const r = this._beliefs.RELATIONAL;
    const s = this._beliefs.SAFETY;
    if (p.pattern === 'ANXIOUS') {
      r.update(1.4, 0.5, 'confirm'); // confirms negative relational model
      s.update(1.3, 0.4, 'confirm'); // confirms threat model
    } else if (p.pattern === 'AVOIDANT') {
      r.update(1.3, 0.5, 'confirm'); // confirms relational model
      s.update(0.8, 0.3, 'neutral'); // avoidants often suppress threat
    } else if (p.pattern === 'SECURE') {
      r.update(0.7, 0.4, 'contradict'); // challenges negative relational model
    }
  }

  _onSignalComposite(p) {
    // Cross-modal composites inform framework likelihood
    const compositeMap = {
      'SOCIAL_MASK':        { framework: 'SELF_MODEL', lr: 1.3, dir: 'confirm' },
      'CONCEALMENT':        { framework: 'SAFETY',     lr: 1.4, dir: 'confirm' },
      'GENUINE_ENGAGEMENT': { framework: 'RELATIONAL', lr: 0.7, dir: 'contradict' },
      'WITHDRAWAL':         { framework: 'SAFETY',     lr: 1.3, dir: 'confirm' },
      'APPROACH':           { framework: 'RELATIONAL', lr: 0.8, dir: 'contradict' },
      'STRESS_ACUTE':       { framework: 'SAFETY',     lr: 1.5, dir: 'confirm' },
      'COGNITIVE_LOAD':     { framework: 'AGENCY',     lr: 1.2, dir: 'neutral' },
    };
    const mapping = compositeMap[p.label];
    if (mapping && this._beliefs[mapping.framework]) {
      this._beliefs[mapping.framework].update(mapping.lr, p.score, mapping.dir);
      this._beliefs[mapping.framework].pushSigma(SIGMA.NOISE, p.score);
    }
  }

  // ── Core transcript analysis ───────────────────────────────────────────────

  _onTranscript(p) {
    const text  = (p.text ?? '').trim();
    if (!text || text.length < 5) return;
    this._utteranceCount++;

    const words  = tokenize(text);

    // 1. Detect simulation mode
    const simResult = this._detectSimulation(text);
    if (simResult.active !== this._simulationActive) {
      this._simulationActive = simResult.active;
      this._simulationType   = simResult.type;
      if (simResult.active) this._simulationChain = [text];
      else this._simulationChain = [];
    } else if (simResult.active) {
      this._simulationChain.push(text);
    }

    if (simResult.active) {
      this._emit('alk.framework.simulation', {
        mode:               simResult.type,
        testing_framework:  simResult.testing,
        hypothesis:         simResult.hypothesis,
        chain_length:       this._simulationChain.length,
      });
    }

    // 2. Analyze each framework
    const activeFrameworks = [];
    const contradictedFrameworks = [];
    const updatingFrameworks = [];

    for (const [type, def] of Object.entries(FRAMEWORK_DEFINITIONS)) {
      const belief = this._beliefs[type];
      let activationDelta = 0;
      let confirmDelta    = 0;
      let contradictDelta = 0;
      let updateDelta     = 0;

      // Activation: does this transcript engage this framework at all?
      for (const p of def.activation_patterns) {
        if (p.test(text)) activationDelta += 0.20;
        p.lastIndex = 0;
      }

      // Confirmation: does it support the dominant stance of this framework?
      for (const p of def.confirmation_patterns) {
        if (p.test(text)) confirmDelta += 0.25;
        p.lastIndex = 0;
      }

      // Contradiction: does it challenge the dominant stance?
      for (const p of def.contradiction_patterns) {
        if (p.test(text)) contradictDelta += 0.25;
        p.lastIndex = 0;
      }

      // Update marker: is the framework actively revising?
      for (const p of def.update_markers) {
        if (p.test(text)) updateDelta += 0.30;
        p.lastIndex = 0;
      }

      // Apply observations to belief state
      belief.activation_score = clamp(belief.activation_score * 0.9 + activationDelta);
      belief.active           = belief.activation_score > this._cfg.activationThreshold;

      if (belief.active) {
        activeFrameworks.push(type);

        if (confirmDelta > 0) {
          belief.update(1 + confirmDelta * 2, 0.6, 'confirm');
          belief.pushSigma(SIGMA.TEMPORAL, confirmDelta);
        }
        if (contradictDelta > 0) {
          belief.update(1 / (1 + contradictDelta * 2), 0.6, 'contradict');
          belief.pushSigma(SIGMA.TEMPORAL, -contradictDelta);
          contradictedFrameworks.push({ type, magnitude: contradictDelta });

          // Anomaly detection: high contradiction sigma
          const zT = belief.getSigmaZ(SIGMA.TEMPORAL);
          if (Math.abs(zT) > this._cfg.contradictionThreshold) {
            this._detectGap(type, SIGMA.TEMPORAL, zT, text);
          }
        }
        if (updateDelta > 0) {
          updatingFrameworks.push(type);
          belief.rigidity = clamp(belief.rigidity - 0.04); // update markers = opening
        }

        // Frames active counter
        belief.frames_active++;

        // Structural sigma: long-term pattern shift
        belief.pushSigma(SIGMA.STRUCTURAL, belief.activation_score);
      }

      // Rigidity alert
      if (belief.rigidity > this._cfg.rigidityAlertThreshold &&
          belief.contradiction_count > 3 &&
          belief.confirmation_count > belief.contradiction_count * 2) {
        this._emit('alk.framework.rigidity', {
          framework:          type,
          label:              def.label,
          rigidity_score:     r4(belief.rigidity),
          confirmation_count: belief.confirmation_count,
          contradiction_count: belief.contradiction_count,
          pattern:            `Confirming ${belief.confirmation_count}x vs contradicting ${belief.contradiction_count}x — confirmation bias active`,
        });
      }

      // Inversion detection
      if (belief.isInverting() &&
          (belief.confirmation_count + belief.contradiction_count) >= this._cfg.inversionMinEvidence) {
        if (!this._pendingInversions.has(type)) {
          this._pendingInversions.set(type, { start: Date.now(), evidence: 0 });
        }
        const inv = this._pendingInversions.get(type);
        inv.evidence++;
        if (inv.evidence >= 4) {
          this._emit('alk.framework.inversion', {
            framework:   type,
            label:       def.label,
            description: `Framework ${type} is being reinterpreted — contradictions are not resolving belief`,
            old_model:   def.pathological_poles,
            new_model:   'updating — in progress',
            confidence:  r4(belief.confidence),
            evidence_count: inv.evidence,
          });
          this._pendingInversions.delete(type);
        }
      }
    }

    // 3. Cross-framework asymmetry sigma
    this._computeAsymmetry(activeFrameworks);

    // 4. Emit framework active state
    if (activeFrameworks.length > 0) {
      const dominant = activeFrameworks.sort((a, b) =>
        this._beliefs[b].activation_score - this._beliefs[a].activation_score
      )[0];

      this._emit('alk.framework.active', {
        frameworks:      activeFrameworks.map(t => this._beliefs[t].snapshot()),
        dominant,
        simulation_mode: this._simulationActive,
        simulation_type: this._simulationType,
        utterance_n:     this._utteranceCount,
      });
    }

    // 5. Emit contradictions
    for (const { type, magnitude } of contradictedFrameworks) {
      const belief = this._beliefs[type];
      this._emit('alk.framework.contradiction', {
        framework:   type,
        label:       FRAMEWORK_DEFINITIONS[type].label,
        evidence:    text.slice(0, 100),
        sigma_type:  SIGMA.TEMPORAL,
        magnitude:   r4(magnitude),
        belief_now:  r4(belief.posterior),
        rigidity:    r4(belief.rigidity),
        note:        `§1.1 — Signal only. Framework contradiction detected in speech pattern.`,
      });
    }

    // 6. Emit belief updates for updating frameworks
    for (const type of updatingFrameworks) {
      const b = this._beliefs[type];
      this._emit('alk.framework.update', {
        framework:   type,
        label:       FRAMEWORK_DEFINITIONS[type].label,
        direction:   b.last_update_dir,
        old_conf:    r4(b.confidence - 0.05),
        new_conf:    r4(b.confidence),
        posterior:   r4(b.posterior),
        rigidity:    r4(b.rigidity),
      });
    }

    // 7. Global anomaly detection
    this._detectGlobalAnomalies(activeFrameworks, text);
  }

  // ── Simulation Detection ───────────────────────────────────────────────────

  _detectSimulation(text) {
    const result = { active: false, type: null, testing: null, hypothesis: null };
    const counts = {};

    for (const [type, patterns] of Object.entries(SIMULATION_PATTERNS)) {
      counts[type] = 0;
      for (const p of patterns) {
        if (p.test(text)) counts[type]++;
        p.lastIndex = 0;
      }
    }

    const dominated = Object.entries(counts).sort(([,a],[,b]) => b - a)[0];
    if (!dominated || dominated[1] === 0) return result;

    result.active    = true;
    result.type      = dominated[0];

    // Determine which framework is being tested
    if (counts.counterfactual > 0)  result.testing = 'CAUSAL';
    else if (counts.rehearsal > 0)  result.testing = 'SAFETY';
    else if (counts.replay > 0)     result.testing = 'RELATIONAL';
    else if (counts.hypothetical > 0) result.testing = 'REALITY';
    else if (counts.impersonation > 0) result.testing = 'SOCIAL';

    // Simple hypothesis extraction — first conditional clause
    const hyp = text.match(/\b(if|when|suppose|imagine|what if)\s+(.{5,50}?)(?:[,.]|$)/i);
    result.hypothesis = hyp ? hyp[0].slice(0, 80) : null;

    return result;
  }

  // ── Gap Detection ─────────────────────────────────────────────────────────

  _detectGap(framework, sigmaType, zScore, text) {
    const gap = {
      type:       'FRAMEWORK_GAP',
      framework,
      sigma_type: sigmaType,
      magnitude:  r4(Math.abs(zScore)),
      direction:  zScore > 0 ? 'positive' : 'negative',
      context:    text.slice(0, 80),
      ts:         Date.now(),
    };

    this._gapLog.push(gap);
    if (this._gapLog.length > 20) this._gapLog.shift();

    this._emit('alk.framework.anomaly', {
      ...gap,
      description: `Framework ${framework} showing ${sigmaType} deviation: ${Math.abs(zScore).toFixed(2)}σ`,
      note: '§1.1 — Statistical anomaly in framework activation pattern. Not diagnosis.',
    });
  }

  // ── Cross-framework Asymmetry ─────────────────────────────────────────────

  _computeAsymmetry(activeFrameworks) {
    // Check for coherence tensions
    for (const tension of COHERENCE_TENSIONS) {
      const a = this._beliefs[tension.a];
      const b = this._beliefs[tension.b];
      if (!a || !b) continue;

      if (tension.condition(a, b)) {
        a.pushSigma(SIGMA.ASYMMETRY, Math.abs(a.posterior - b.posterior));
        b.pushSigma(SIGMA.ASYMMETRY, Math.abs(a.posterior - b.posterior));

        const zAsym = a.getSigmaZ(SIGMA.ASYMMETRY);
        if (Math.abs(zAsym) > 1.5) {
          this._emit('alk.framework.anomaly', {
            type:       'COHERENCE_TENSION',
            sigma_type: SIGMA.ASYMMETRY,
            magnitude:  r4(Math.abs(zAsym)),
            tension:    tension.tension,
            framework_a: { type: tension.a, posterior: r4(a.posterior) },
            framework_b: { type: tension.b, posterior: r4(b.posterior) },
            description: `Incoherence between ${tension.a} and ${tension.b}: "${tension.tension}"`,
          });
        }
      }
    }
  }

  // ── Global Coherence Emission ─────────────────────────────────────────────

  _emitCoherence() {
    const active = Object.values(this._beliefs).filter(b => b.active);
    if (active.length === 0) return;

    // Global coherence = mean latent coherence weighted by framework confidence
    const weightedCoherence = mean(active.map(b => b.confidence * this._latent.coherence));

    // Edges: high-frequency, low-variance framework pairs
    const edges = [];
    for (const [id, e] of this._edges) {
      if (e.frequency > 3 && e.barrier < 0.3) {
        edges.push({ id, ...e });
      }
    }

    // Active gaps
    const recentGaps = this._gapLog.filter(g => Date.now() - g.ts < 10000);

    // Sigma map snapshot
    const sigmaMap = {};
    for (const [type, belief] of Object.entries(this._beliefs)) {
      if (belief.active || belief.activation_score > 0.1) {
        sigmaMap[type] = {
          noise:      r4(belief.getSigmaZ(SIGMA.NOISE)),
          temporal:   r4(belief.getSigmaZ(SIGMA.TEMPORAL)),
          structural: r4(belief.getSigmaZ(SIGMA.STRUCTURAL)),
          asymmetry:  r4(belief.getSigmaZ(SIGMA.ASYMMETRY)),
        };
      }
    }

    this._emit('alk.framework.coherence', {
      global_coherence: r4(clamp(weightedCoherence)),
      active_count:     active.length,
      gaps:             recentGaps,
      edges,
      sigma_map:        sigmaMap,
      suppression:      r4(this._suppressionW.avg()),
      session_ms:       Date.now() - (this._sessionStart ?? Date.now()),
    });
  }

  // ── Global Anomaly Detection ───────────────────────────────────────────────

  _detectGlobalAnomalies(activeFrameworks, text) {
    // Track total activation
    const totalActivation = Object.values(this._beliefs).reduce((s, b) => s + b.activation_score, 0);
    this._globalActivationW.push(totalActivation);

    const zGlobal = this._globalActivationW.z();

    // Spike in simultaneous framework activation = system under load
    if (zGlobal > this._cfg.anomalyThreshold && activeFrameworks.length > 4) {
      this._emit('alk.framework.anomaly', {
        type:       'ACTIVATION_SPIKE',
        sigma_type: SIGMA.STRUCTURAL,
        magnitude:  r4(zGlobal),
        active_frameworks: activeFrameworks,
        description: 'Simultaneous activation of multiple frameworks — system under significant load',
      });
    }

    // Suppression + high framework activation = concealed framework activity
    const suppAvg = this._suppressionW.avg();
    if (suppAvg > 0.60 && activeFrameworks.length > 2) {
      this._emit('alk.framework.anomaly', {
        type:       'SUPPRESSED_FRAMEWORK_ACTIVITY',
        sigma_type: SIGMA.ASYMMETRY,
        magnitude:  r4(suppAvg),
        active_frameworks: activeFrameworks,
        description: 'High suppression with active frameworks — beliefs may be more activated than expressed',
      });
    }

    // Update RELATIONAL edge tracking
    for (let i = 0; i < activeFrameworks.length - 1; i++) {
      for (let j = i + 1; j < activeFrameworks.length; j++) {
        const id = [activeFrameworks[i], activeFrameworks[j]].sort().join(':');
        if (!this._edges.has(id)) {
          this._edges.set(id, { a: activeFrameworks[i], b: activeFrameworks[j], frequency: 0, barrier: 1.0 });
        }
        const edge = this._edges.get(id);
        edge.frequency++;
        // Barrier decreases with frequency — edges become structural
        edge.barrier = r4(1 / (1 + Math.log(edge.frequency)));
      }
    }
  }

  // ── Summary emission ──────────────────────────────────────────────────────

  _emitSummary() {
    const snapshots = {};
    for (const [type, belief] of Object.entries(this._beliefs)) {
      if (belief.activation_score > 0.05 || belief.contradiction_count > 0) {
        snapshots[type] = belief.snapshot();
      }
    }

    const topEdges = [...this._edges.values()]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    this._emit('alk.framework.summary', {
      utterance_count:   this._utteranceCount,
      session_ms:        Date.now() - (this._sessionStart ?? Date.now()),
      frameworks:        snapshots,
      top_edges:         topEdges,
      total_gaps:        this._gapLog.length,
      simulation_active: this._simulationActive,
      note:              '§1.1 — All framework inferences are signals. Not diagnoses. Not truth claims.',
    });
  }

  // ── Direct API ────────────────────────────────────────────────────────────

  /** Get current snapshot of a specific framework */
  getFramework(type) {
    return this._beliefs[type]?.snapshot() ?? null;
  }

  /** Get all active frameworks */
  getActive() {
    return Object.entries(this._beliefs)
      .filter(([, b]) => b.active)
      .map(([t, b]) => ({ type: t, ...b.snapshot() }))
      .sort((a, b) => b.posterior - a.posterior);
  }

  /** Get global coherence score */
  getCoherence() {
    const active = Object.values(this._beliefs).filter(b => b.active);
    return active.length ? r4(mean(active.map(b => b.confidence))) : 0;
  }

  // ── Error surface ──────────────────────────────────────────────────────────

  _emit(type, payload) {
    try {
      this._kernel.emit(type, payload, { sourceUUID: MODULE_UUID });
    } catch (err) {
      this._kernel.emit('alk.framework.error', {
        source: type, message: err.message, payload,
      }, { sourceUUID: MODULE_UUID });
    }
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create and wire a FrameworkModel.
 *
 * @param {object} opts
 * @param {object} opts.kernel   — ALK kernel
 * @param {object} [opts.config]
 * @returns {FrameworkModel}
 *
 * Usage:
 *   import { createFrameworkModel } from './framework-model.js';
 *   const fm = createFrameworkModel({ kernel });
 *   fm.start();
 *   kernel.subscribe('alk.framework.contradiction', ev => console.log(ev.payload));
 */
export function createFrameworkModel({ kernel, config = {} } = {}) {
  return new FrameworkModel({ kernel, config });
}

export default {
  createFrameworkModel,
  FrameworkModel,
  BeliefState,
  FRAMEWORK_TYPES,
  FRAMEWORK_DEFINITIONS,
  SIGMA,
  MODULE_UUID,
  MODULE_VERSION,
};
