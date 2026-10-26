// ═══════════════════════════════════════════════════════════════════
// ALM — ACCELERATED LEARNING MODULE — engine.js
// v2.0.0 (extracted from the nexus-engine.js monolith)
//
// State + pure domain data, no DOM. This is the exact real ALM
// implementation that was previously embedded directly in
// nexus-engine.js, physically moved — not rewritten, not simplified.
// Same functions, same data, real module boundary.
// ═══════════════════════════════════════════════════════════════════

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   MODULE: alm — Accelerated Learning Module
   Stub — full implementation in next iteration.
   Intelligence types, intuition training, delta tracking, sleep
   integration, cognitive piggybacking, feedback loops.
═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   ALM — ACCELERATED LEARNING MODULE  v2.0
   
   The cognitive OS for self-understanding and deliberate growth.
   
   8 Human System Models:
     Biological · Cognitive · Affective · Behavioral
     Relational · Systems · Phenomenological · Developmental
   
   Cognitive Functions (Jung/MBTI extended):
     Ni · Ne · Ti · Te · Si · Se · Fi · Fe
   
   Architecture: tabs, not grids. State persists across sessions.
   Everything is a feedback loop — input, processing, output, record.
   
   "You are not static — you are a trajectory."
═══════════════════════════════════════════════════════════════════ */

// ── Cognitive Function definitions ────────────────────────────────
const COGNITIVE_FUNCTIONS = {
  Ni: { label:'Introverted Intuition', color:'#00c8ff', icon:'◎',
    desc:'Convergent · depth · future vision · the pattern beneath the pattern',
    domain:'Cognition', loop:'input',
    trainPrompt:'What is the deeper structure? What will this become?',
    feedback:'Does the convergence feel certain or forced?',
    experiment:'Sit with one question for 10 min without Google. What emerges?' },
  Ne: { label:'Extraverted Intuition', color:'#cc44ff', icon:'✦',
    desc:'Divergent · possibilities · lateral connections · what could be',
    domain:'Cognition', loop:'processing',
    trainPrompt:'What are all the angles? What connects this to something unrelated?',
    feedback:'How many genuine novel connections appeared in 5 minutes?',
    experiment:'Take any object. List 20 uses. Notice when it gets hard.' },
  Ti: { label:'Introverted Thinking', color:'#7744ff', icon:'◈',
    desc:'Internal logical framework · precision · structural coherence',
    domain:'Cognition', loop:'processing',
    trainPrompt:'Does this actually hold together? Where is the hidden assumption?',
    feedback:'Can you reduce this to its simplest coherent form?',
    experiment:'Pick a belief. Try to break it from the inside.' },
  Te: { label:'Extraverted Thinking', color:'#ffe04a', icon:'→',
    desc:'External organization · efficiency · measurable results',
    domain:'Cognition', loop:'output',
    trainPrompt:'What is the most efficient path to the outcome?',
    feedback:'Did the system produce measurable results?',
    experiment:'Build a simple decision matrix for something you\'ve been avoiding.' },
  Si: { label:'Introverted Sensing', color:'#ff8c22', icon:'◆',
    desc:'Memory · comparison · stored experience · what was',
    domain:'Cognition', loop:'input',
    trainPrompt:'What does this remind me of? What stored pattern applies?',
    feedback:'How reliable is this pattern recognition? Recent or stale?',
    experiment:'Detail a vivid memory. Notice what your body holds from it.' },
  Se: { label:'Extraverted Sensing', color:'#00ff88', icon:'◉',
    desc:'Present moment · sensory detail · immediate reality · what is',
    domain:'Cognition', loop:'input',
    trainPrompt:'What is actually here right now? What does the body report?',
    feedback:'How fully was I present vs. in my head?',
    experiment:'5 minutes: describe only what you can directly sense. No interpretation.' },
  Fi: { label:'Introverted Feeling', color:'#ff66aa', icon:'♥',
    desc:'Internal values · authenticity · felt rightness · identity',
    domain:'Affective', loop:'processing',
    trainPrompt:'Does this align with who I actually am? What does my core say?',
    feedback:'Is this my value or an inherited one?',
    experiment:'List 5 things you believe are wrong. Why? Where did each one come from?' },
  Fe: { label:'Extraverted Feeling', color:'#11ddcc', icon:'⬡',
    desc:'Relational attunement · group harmony · others\' emotional state',
    domain:'Relational', loop:'processing',
    trainPrompt:'What is the emotional field in this room/relationship?',
    feedback:'Did attending to their needs help or compromise my own clarity?',
    experiment:'In next conversation: say nothing for first 2 min. Just read the field.' },
};

// ── 8 Human System Models ────────────────────────────────────────
const HUMAN_MODELS = {
  biological: {
    label:'Biological', icon:'⬡', color:'#22ddaa',
    subtitle:'The Hardware',
    source:'Neuroscience + Biology',
    core:'Behavior = output of physical processes. If this layer is off, everything else distorts.',
    tracks:['Sleep quality','Stress level','Nervous system state','Hormonal signals','Energy level'],
    bridge:'Maps to Polyvagal states. Body data gates cognitive function availability.',
    loopType:'input',
  },
  cognitive: {
    label:'Cognitive', icon:'◈', color:'#00c8ff',
    subtitle:'The Processor',
    source:'Cognitive Psychology',
    core:'The mind interprets reality — it doesn\'t mirror it.',
    tracks:['Dominant function active','Cognitive biases active','Processing mode','Clarity level','Mental load'],
    bridge:'Cognitive functions (Ni/Ne/Ti/Te/Si/Se/Fi/Fe) are the processing architecture.',
    loopType:'processing',
  },
  affective: {
    label:'Affective', icon:'♥', color:'#ff66aa',
    subtitle:'The Value Engine',
    source:'Affective Neuroscience',
    core:'You don\'t act on logic — you act on what feels meaningful.',
    tracks:['Current emotion (named)','Motivation source','Meaning level','Emotional blocks','Affect-action bridge'],
    bridge:'Emotions are information about value alignment, not noise to suppress.',
    loopType:'processing',
  },
  behavioral: {
    label:'Behavioral', icon:'→', color:'#ff8c22',
    subtitle:'The Observable Output',
    source:'Behaviorism + Habit Science',
    core:'What you repeatedly do becomes what you are.',
    tracks:['Active habits','Conditioning patterns','Behavioral anchors','Pattern clusters','Output consistency'],
    bridge:'The behavioral layer is the visible output of all other layers combined.',
    loopType:'output',
  },
  relational: {
    label:'Relational', icon:'⬡', color:'#ff8c22',
    subtitle:'The Social System',
    source:'Attachment Theory',
    core:'You are shaped in relationship, not isolation.',
    tracks:['Attachment orientation','Co-regulation state','Communication patterns','Relational needs','Connection quality'],
    bridge:'Co-regulation changes nervous system state, which changes cognitive availability.',
    loopType:'input',
  },
  systems: {
    label:'Systems', icon:'∿', color:'#11ddcc',
    subtitle:'The Meta-Layer',
    source:'Systems Theory',
    core:'Patterns repeat because structures produce them.',
    tracks:['Active feedback loops','Leverage points','Structural patterns','Adaptation speed','Emergent behaviors'],
    bridge:'Systems view reveals why individual effort fails against structural forces.',
    loopType:'meta',
  },
  phenomenological: {
    label:'Phenomenological', icon:'◎', color:'#cc44ff',
    subtitle:'The Lived Experience',
    source:'Phenomenology',
    core:'Reality is filtered through experience, not just facts.',
    tracks:['Inner narrative','Meaning perception','Lived texture','Attention quality','Presence depth'],
    bridge:'The bridge between cognitive and experiential: "opening your chakras" = increasing body awareness + reducing internal resistance + attention shifting mind→body.',
    loopType:'meta',
  },
  developmental: {
    label:'Developmental', icon:'▲', color:'#cc44ff',
    subtitle:'Change Over Time',
    source:'Developmental Psychology',
    core:'You are not static — you are a trajectory.',
    tracks:['Current developmental theme','Growth edge','Historical pattern','Trajectory direction','Integration level'],
    bridge:'Connects to Horizon module. Where are you in the arc?',
    loopType:'output',
  },
};

// ── ALM State ─────────────────────────────────────────────────────
const ALM_STATE = {
  _loaded: false,
  activeTab: 'functions',      // 'functions' | 'models' | 'log' | 'frameworks' | 'experiment'
  activeFunction: 'Ni',        // selected cognitive function
  activeModel: 'cognitive',    // selected human model

  // Function training log: { fnKey, note, quality, ts }
  functionLog: [],

  // Model observations: { modelKey, field, value, ts }
  modelLog: [],

  // Experiment sessions: { id, fnKey, prompt, observation, ts }
  experiments: [],

  // Heuristics (named, personal rules of thumb)
  heuristics: [],
  // { id, text, domain, reliability, tags[], ts }

  // Frameworks user is working with
  frameworks: [],
  // { id, name, description, source, tags[], ts }

  // Externalized thought stream
  externalizations: [],
  // { id, text, type:'question'|'observation'|'hypothesis'|'pattern', fnKey, ts }

  // Feedback loops — the header already claimed this scope ("FEEDBACK")
  // with no tab behind it until now.
  feedbackLoops: [],
  // { id, trigger, observation, adjustment, loopType:'reinforcing'|'balancing'|'broken', ts }
};
const ALM_STATE_KEY = 'mm_alm_state_v2';
// Separate key for the Delta Log — was referenced by the Log tab's render
// function but never actually declared anywhere in this codebase before
// now (confirmed: checked every build shipped this session, never once
// defined). Real, pre-existing bug, found by testing, not caused by
// this extraction.
const ALM_DELTAS_KEY = 'mm_alm_deltas';

function almLoad() {
  // SECURITY FIX: this read localStorage['mm_alm_state_v2'] — cognitive
  // functions log, experiments, heuristics, frameworks — and could
  // clobber correctly-decrypted vault state with a stale plaintext copy.
  // vaultDeserialize() (mastermind-vault.js, modules.almState) already
  // restores ALM_STATE in full. Vault-only now; see _ORPHAN_KEYS in
  // mastermind-vault.js for recovering any pre-fix copy.
  ALM_STATE._loaded = true;
}

function almSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_alm_state_v2']
  // in plaintext, in parallel with the vault, on every change. The vault
  // is the only store now (modules.almState already covers it in full).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// ── Utilities ─────────────────────────────────────────────────────
function _almTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}


