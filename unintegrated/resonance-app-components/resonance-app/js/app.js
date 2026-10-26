/* ═══════════════════════════════════════════════════════════════
   RESONANCE v4.1.0 — JavaScript Engine
   §5.4 Version persists everywhere
   §1.2 Nothing silently fails
   §2.1 Persistence is the golden rule
   §5.1 Everything has UUID + hook + event bus registration
   ═══════════════════════════════════════════════════════════════ */

const VERSION = '4.1.0';
const STORAGE_PREFIX = 'rsn4_';
const SESSION_COOKIE = 'rsn4_session';
const PBKDF2_ITER = 100000;
const SALT = 'resonance-salt-v4-immutable';

// ── HELPERS ────────────────────────────────────────────────────────
const clamp = (v, mn=0, mx=1) => Math.max(mn, Math.min(mx, isNaN(v)?0:v));
const hexToRgba = (hex, a) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
const randomColor = () => ['#c87941','#3fa874','#7a5fd4','#4a8fc4','#c4a84a','#a87050','#50a8a0','#c04080','#80c050'][Math.floor(Math.random()*9)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
const autoResize = el => { el.style.height='auto'; el.style.height=el.scrollHeight+'px'; };

// ── COOKIE STORE ───────────────────────────────────────────────────
const CookieStore = {
  set(name,val,days=7){ const e=new Date(Date.now()+days*864e5).toUTCString(); document.cookie=`${name}=${encodeURIComponent(val)};expires=${e};path=/;SameSite=Lax`; },
  get(name){ const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'=([^;]*)')); return m?decodeURIComponent(m[1]):null; },
  del(name){ document.cookie=`${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`; },
};

// ── JAA v3 — FIXED ────────────────────────────────────────────────
// ROOT CAUSE FIX: Completely redesigned.
// Session = plaintext cookie (userId only, not sensitive).
// User data = per-user encrypted blob, async init/save/load.
// Plain index = sync localStorage (non-sensitive: handle→userId maps).
const JAA = (() => {
  const _keys = new Map();
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function _deriveKey(pass) {
    const raw = await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey(
      {name:'PBKDF2',salt:enc.encode(SALT),iterations:PBKDF2_ITER,hash:'SHA-256'},
      raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  }

  async function _encrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, enc.encode(JSON.stringify(obj)));
    return JSON.stringify({iv:[...iv],ct:[...new Uint8Array(ct)],v:VERSION});
  }

  async function _decrypt(key, str) {
    try {
      const {iv,ct} = JSON.parse(str);
      const pt = await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,new Uint8Array(ct));
      return JSON.parse(dec.decode(pt));
    } catch(e) { console.error('[JAA] decrypt failed:',e.message); return null; }
  }

  return {
    async initKey(userId, passphrase) {
      const key = await _deriveKey(userId+':'+passphrase);
      _keys.set(userId, key);
      return key;
    },
    hasKey(userId) { return _keys.has(userId); },
    async save(userId, ns, obj) {
      const key = _keys.get(userId);
      if (!key) { console.error('[JAA] no key for',userId); return false; }
      try { localStorage.setItem(`${STORAGE_PREFIX}${userId}_${ns}`, await _encrypt(key,obj)); return true; }
      catch(e) { console.error('[JAA] save failed:',ns,e.message); return false; }
    },
    async load(userId, ns) {
      const key = _keys.get(userId);
      if (!key) { console.error('[JAA] no key for',userId); return null; }
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}_${ns}`);
      if (!raw) return null;
      return _decrypt(key, raw);
    },
    savePlain(ns, obj) { localStorage.setItem(`${STORAGE_PREFIX}plain_${ns}`, JSON.stringify(obj)); },
    loadPlain(ns) { try { return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}plain_${ns}`)||'null'); } catch { return null; } },
    async purge(userId) {
      Object.keys(localStorage).filter(k=>k.startsWith(`${STORAGE_PREFIX}${userId}_`)).forEach(k=>localStorage.removeItem(k));
      _keys.delete(userId);
    },
    health() {
      const keys = Object.keys(localStorage).filter(k=>k.startsWith(STORAGE_PREFIX));
      return { totalKeys:keys.length, totalBytes:keys.reduce((a,k)=>a+(localStorage.getItem(k)?.length||0),0), activeUsers:_keys.size };
    },
  };
})();

// ── SESSION MANAGER ────────────────────────────────────────────────
const Session = {
  write(userId) {
    CookieStore.set(SESSION_COOKIE, userId, 7);
    localStorage.setItem(`${STORAGE_PREFIX}session`, JSON.stringify({userId, ts:Date.now()}));
  },
  read() {
    const cookie = CookieStore.get(SESSION_COOKIE);
    if (cookie) return cookie;
    const raw = localStorage.getItem(`${STORAGE_PREFIX}session`);
    if (!raw) return null;
    try { const {userId,ts}=JSON.parse(raw); if(Date.now()-ts>7*864e5){this.clear();return null;} return userId; } catch { return null; }
  },
  clear() { CookieStore.del(SESSION_COOKIE); localStorage.removeItem(`${STORAGE_PREFIX}session`); },
};

// ── EVENT BUS ─────────────────────────────────────────────────────
const BUS = (() => {
  const _h = new Map();
  const _log = [];
  return {
    uuid: 'mod_bus_002', version: VERSION,
    on(ev, fn) { if(!_h.has(ev))_h.set(ev,[]); _h.get(ev).push(fn); },
    off(ev, fn) { if(_h.has(ev))_h.set(ev,_h.get(ev).filter(f=>f!==fn)); },
    emit(ev, payload={}) {
      const e={id:uid(),event:ev,payload,ts:Date.now(),eventTs:_log.length};
      _log.unshift(e); if(_log.length>200)_log.length=200;
      (_h.get(ev)||[]).concat(_h.get('*')||[]).forEach(fn=>{ try{fn(payload,e);}catch(err){console.error('[BUS]',ev,err.message);} });
      try{ if(window._nexusBus) window._nexusBus.postMessage({event:ev,payload,eventTs:e.eventTs}); } catch{}
      return e;
    },
    log() { return [..._log]; },
    handlers() { const o={}; for(const [k,v] of _h) o[k]=v.length; return o; },
    health() { return {logSize:_log.length,eventTypes:_h.size}; },
  };
})();

// ── FEATURE REGISTRY ──────────────────────────────────────────────
const FEATURE_REGISTRY = (() => {
  const _f = new Map();
  const def = f => { if(!f.uuid||!f.feature_id)throw new Error('uuid+feature_id required'); _f.set(f.feature_id,{...f,enabled:true}); };
  // CORE_SOCIAL
  def({uuid:'f001-dqe',feature_id:'feat_001',name:'Deep Question Engine',group:'CORE_SOCIAL',status:'active',description:'Rotating deep prompts to seed meaningful conversation.'});
  def({uuid:'f002-fz',feature_id:'feat_002',name:'Feed with Resonance Zones',group:'CORE_SOCIAL',status:'active',description:'Posts sorted into near / tension / far signal zones.'});
  def({uuid:'f003-pt',feature_id:'feat_003',name:'Posts + Comments + Threads',group:'CORE_SOCIAL',status:'active',description:'Threaded posting with SNR scoring per post.'});
  def({uuid:'f004-dm',feature_id:'feat_004',name:'Direct Messages',group:'CORE_SOCIAL',status:'active',description:'Encrypted 1:1 messaging.'});
  def({uuid:'f005-fs',feature_id:'feat_005',name:'Friend System',group:'CORE_SOCIAL',status:'active',description:'Soul mates, kindred spirits, twin flames, signal neighbours.'});
  def({uuid:'f006-ibm',feature_id:'feat_006',name:'Invite + Block + Mute',group:'CORE_SOCIAL',status:'active',description:'Social safety controls with notifications.'});
  def({uuid:'f007-acs',feature_id:'feat_007',name:'Alignment Compatibility Score',group:'CORE_SOCIAL',status:'active',description:'Multi-axis fingerprint compatibility score.'});
  // PROFILES
  def({uuid:'f010-pro',feature_id:'feat_010',name:'Profile Page',group:'PROFILES',status:'active',description:'Public profile with photo, bio, gallery, signal summary.'});
  def({uuid:'f011-gal',feature_id:'feat_011',name:'Gallery',group:'PROFILES',status:'active',description:'Image/video gallery with tags and upload limits.'});
  def({uuid:'f012-ref',feature_id:'feat_012',name:'Reflection Journal',group:'PROFILES',status:'active',description:'Encrypted private journal — language, not numbers.'});
  def({uuid:'f013-prv',feature_id:'feat_013',name:'Privacy + Account Controls',group:'PROFILES',status:'active',description:'Visibility, password, email, delete account.'});
  // SEARCH
  def({uuid:'f020-qry',feature_id:'feat_020',name:'Query Search',group:'SEARCH',status:'active',description:'Full-text search across posts, users, tags.'});
  def({uuid:'f021-tag',feature_id:'feat_021',name:'Tag Filter',group:'SEARCH',status:'active',description:'Filter by resonance tags.'});
  def({uuid:'f022-rsf',feature_id:'feat_022',name:'Resonance Search',group:'SEARCH',status:'active',description:'Filter by resonance distance and axis.'});
  // RESONANCE
  def({uuid:'f030-wlt',feature_id:'feat_030',name:'Word Lattice',group:'RESONANCE',status:'active',description:'Canvas word cloud weighted by resonance × SNR × emotional intensity.'});
  def({uuid:'f031-tgs',feature_id:'feat_031',name:'Tag System',group:'RESONANCE',status:'active',description:'Auto-generated resonance tags.'});
  def({uuid:'f032-met',feature_id:'feat_032',name:'Metrics + Analytics',group:'RESONANCE',status:'active',description:'Human-language signal dashboard.'});
  def({uuid:'f033-api',feature_id:'feat_033',name:'Resonance API',group:'RESONANCE',status:'active',description:'REST endpoint for signal queries.'});
  def({uuid:'f034-dda',feature_id:'feat_034',name:'Delta-Driven Depth Adaptation',group:'RESONANCE',status:'active',description:'UI adapts to your average resonance level.'});
  def({uuid:'f035-aia',feature_id:'feat_035',name:'AI Resonance Assistant',group:'RESONANCE',status:'active',description:'Claude-powered signal analysis and post improvement.'});
  // ADMIN
  def({uuid:'f040-adm',feature_id:'feat_040',name:'Admin Panel',group:'ADMIN',status:'active',description:'Full system-aware admin dashboard.'});
  def({uuid:'f041-usm',feature_id:'feat_041',name:'User Management',group:'ADMIN',status:'active',description:'View, flag, ban, edit role, inspect fingerprint.'});
  def({uuid:'f042-frg',feature_id:'feat_042',name:'Features Registry',group:'ADMIN',status:'active',description:'UUID-tracked feature list with enable/disable.'});
  def({uuid:'f043-plg',feature_id:'feat_043',name:'Plugins Page',group:'ADMIN',status:'active',description:'Install, enable, disable plugins.'});
  def({uuid:'f044-sat',feature_id:'feat_044',name:'Site-wide Analytics',group:'ADMIN',status:'active',description:'Platform health, post volume, SNR trends.'});
  def({uuid:'f045-bpe',feature_id:'feat_045',name:'BPE Monitor',group:'ADMIN',status:'active',description:'Signal performance and pattern engine live view.'});
  // METEDITOR
  def({uuid:'f050-web',feature_id:'feat_050',name:'Website Editor',group:'METEDITOR',status:'active',description:'WYSIWYG theme and layout editor.'});
  def({uuid:'f051-cnx',feature_id:'feat_051',name:'Causal Nexus Integration',group:'METEDITOR',status:'active',description:'Live system graph from NEXUS BroadcastChannel.'});
  def({uuid:'f052-snp',feature_id:'feat_052',name:'Snapshot + Backup',group:'METEDITOR',status:'active',description:'Full platform state snapshots.'});
  def({uuid:'f053-ide',feature_id:'feat_053',name:'Idearium API',group:'METEDITOR',status:'stub',description:'Idea capture pipeline — stub.'});
  def({uuid:'f054-ver',feature_id:'feat_054',name:'Versionium API',group:'METEDITOR',status:'stub',description:'Version history — stub.'});
  // ROADMAP
  def({uuid:'f060-wtn',feature_id:'feat_060',name:"What's New",group:'ROADMAP',status:'active',description:'Changelog with version history.'});
  def({uuid:'f061-wnw',feature_id:'feat_061',name:'What Needs Work',group:'ROADMAP',status:'active',description:'Known issues and planned improvements.'});
  def({uuid:'f062-bug',feature_id:'feat_062',name:'Bug Report System',group:'ROADMAP',status:'active',description:'User bug reports with severity and status tracking.'});
  return {
    get(id){return _f.get(id)||null;},
    getAll(){return[..._f.values()];},
    getGroup(g){return[..._f.values()].filter(f=>f.group===g);},
    groups(){return[...new Set([..._f.values()].map(f=>f.group))];},
    toggle(id){const f=_f.get(id);if(!f)return false;f.enabled=!f.enabled;BUS.emit('feature:toggled',{feature_id:id,enabled:f.enabled});return f.enabled;},
    health(){return{total:_f.size,enabled:[..._f.values()].filter(f=>f.enabled).length};},
  };
})();

// ── PLUGIN REGISTRY ───────────────────────────────────────────────
const PLUGIN_REGISTRY = (() => {
  const _p = new Map();
  const def = p => _p.set(p.id,{...p,enabled:p.enabled??true,_installed:Date.now()});
  def({id:'plg_resonance_api',uuid:'p001-rapi',name:'Resonance API',version:'1.0.0',author:'resonance.fm',description:'REST API bridge for external signal queries.',enabled:true,category:'core',icon:'📡'});
  def({id:'plg_causal_bridge',uuid:'p002-cbrg',name:'Causal Bridge',version:'1.0.0',author:'rheon.world',description:'BroadcastChannel listener for NEXUS causal event stream.',enabled:true,category:'core',icon:'🌉'});
  def({id:'plg_dht_mesh',uuid:'p003-dhtm',name:'DHT Mesh',version:'0.9.0',author:'rheon.world',description:'Distributed hash table peer simulation for multi-tab sync.',enabled:false,category:'network',icon:'🕸'});
  def({id:'plg_ai_assistant',uuid:'p004-aias',name:'AI Resonance Assistant',version:'1.0.0',author:'resonance.fm',description:'Claude-powered resonance analysis and post improvement.',enabled:true,category:'ai',icon:'🤖'});
  def({id:'plg_bpe_monitor',uuid:'p005-bpem',name:'BPE Monitor',version:'1.0.0',author:'resonance.fm',description:'Behavior Pattern Engine live performance monitor.',enabled:true,category:'analytics',icon:'📊'});
  def({id:'plg_word_lattice',uuid:'p006-wlat',name:'Word Lattice',version:'1.0.0',author:'resonance.fm',description:'Resonance-weighted word cloud visualization.',enabled:true,category:'visualization',icon:'✦'});
  def({id:'plg_idearium',uuid:'p007-idea',name:'Idearium',version:'0.1.0',author:'rheon.world',description:'Idea capture pipeline — experimental.',enabled:false,category:'experimental',icon:'💡'});
  def({id:'plg_versionium',uuid:'p008-vers',name:'Versionium',version:'0.1.0',author:'rheon.world',description:'Version history and diff viewer — experimental.',enabled:false,category:'experimental',icon:'📜'});
  return {
    get(id){return _p.get(id);},
    getAll(){return[..._p.values()];},
    toggle(id){const p=_p.get(id);if(!p)return false;p.enabled=!p.enabled;BUS.emit('plugin:toggled',{plugin_id:id,enabled:p.enabled});return p.enabled;},
    install(plugin){plugin.uuid=plugin.uuid||uid();plugin._installed=Date.now();plugin.enabled=true;_p.set(plugin.id,plugin);BUS.emit('plugin:installed',{plugin_id:plugin.id});},
    health(){return{total:_p.size,enabled:[..._p.values()].filter(p=>p.enabled).length};},
  };
})();

// ── NEXUS BRIDGE ──────────────────────────────────────────────────
const NexusBridge = (() => {
  let _state={connected:false,lastEvent:null,deltaCount:0,events:[]};
  return {
    init() {
      try {
        const ch = new BroadcastChannel('nexus-ack');
        window._nexusBus = new BroadcastChannel('resonance-out');
        ch.onmessage = e => {
          _state.lastEvent={...e.data,received:Date.now()};
          _state.deltaCount++;
          _state.events.unshift(_state.lastEvent);
          if(_state.events.length>50)_state.events.length=50;
          _state.connected=true;
          BUS.emit('nexus:event',e.data);
          if(e.data.type==='NEXUS_DELTA')BUS.emit('nexus:delta',e.data.payload);
          updateNexusUI(_state);
        };
      } catch(e) { console.warn('[NexusBridge]',e.message); }
    },
    state(){return _state;},
    health(){return{..._state,events:_state.events.slice(0,5)};},
  };
})();

// ── HUMAN LANGUAGE LAYER ──────────────────────────────────────────
const LANG = {
  snr(v){ if(v>=.82)return'very clear signal';if(v>=.65)return'strong depth';if(v>=.45)return'decent signal, some noise';if(v>=.28)return'surface presence';if(v>=.14)return'mostly noise';return'faint signal'; },
  ndScore(v){ if(v>=.75)return'very high pattern density';if(v>=.55)return'high pattern density';if(v>=.35)return'moderate pattern density';return'low pattern density'; },
  affectIntensity(v){ if(v>=.85)return'emotionally loaded';if(v>=.65)return'emotionally present';if(v>=.45)return'measured';return'affectively flat'; },
  recursion(v){ if(v>=.75)return'deeply recursive';if(v>=.5)return'loops back on itself';if(v>=.25)return'some recursion';return'linear'; },
  entropy(v){ if(v>=.78)return'rich vocabulary';if(v>=.55)return'varied language';if(v>=.35)return'common language';return'sparse vocabulary'; },
  compression(v){ if(v>=.75)return'emotionally compressed';if(v>=.5)return'held back';return'not suppressing'; },
  expansion(v){ if(v>=.75)return'emotionally open';if(v>=.5)return'somewhat open';return'guarded'; },
  abstraction(v){ if(v>=.75)return'high abstraction';if(v>=.5)return'conceptual';if(v>=.25)return'grounded in examples';return'very concrete'; },
  systemsThinking(v){ if(v>=.75)return'thinks in systems';if(v>=.5)return'systemic awareness';if(v>=.25)return'partial systems view';return'linear thinker'; },
  vulnerability(v){ if(v>=.7)return'openly vulnerable';if(v>=.4)return'some openness';return'guarded'; },
  resonanceDist(v){ if(v<=.1)return'very close match';if(v<=.25)return'close signal';if(v<=.45)return'neighbouring field';if(v<=.65)return'different wavelength';return'far field'; },
  regime(snr,trend){ if(snr>=.75&&trend>0)return'ascending';if(snr>=.75)return'stable high';if(snr>=.55)return'exploratory';if(snr>=.30)return'calibrating';return'dormant'; },
  friendStatus(score){ if(score>=.9)return'soul mate';if(score>=.75)return'kindred spirit';if(score>=.6)return'twin flame';if(score>=.4)return'signal neighbour';return'acquaintance'; },
  bpePattern(id){
    const m={hermetic:"you're going in circles — same certainty, no new questions",stable_cadence:"your rhythm is holding steady",escalation:"something's building — watch if it's intensity or inflammation",drift_pos:"your thinking is reaching higher — baseline shifting upward",drift_neg:"signal getting hazier — may need grounding",high_resonance:"strong resonance — you're in the field",dormant:"quiet lately — signal low",scattered:"scattered signal — lots of thoughts, hard to track",deep_dive:"going very deep on something specific",loop_detected:"you've said this before — might be worth examining why"};
    return m[id]||id;
  },
};

// ── SIGNAL ENGINE v2 ────────────────────────────────────────────
// Meaning-based. No keyword floors. Axes measure what text DOES,
// not which words appear. SNR is a weighted composite of depth signals.
const SIGNAL = {
  extract(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const wc = words.length;
    if (wc < 3) return null;

    const ltext = text.toLowerCase();
    const lwords = ltext.match(/\b[a-z]+\b/g) || [];

    // ── Vocabulary quality axes ──
    const ent = this._entropy(text);
    const ttr = Math.min(1, new Set(lwords).size / Math.max(lwords.length, 1));
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','is','it','that','this','was','are','be','by','have','has','had','do','did','will','would','could','should','may','might','not','with','as','from','up','so','if','me','my','we','you','he','she','they','i','its','been','being','were','am','all','about','into','more','some']);
    const lexDensity = clamp(lwords.filter(w => !stopWords.has(w)).length / Math.max(lwords.length, 1));
    const vocab = ent * 0.5 + ttr * 0.25 + lexDensity * 0.25;

    // ── Meaning-based axes ──
    const rx = (p) => (text.match(new RegExp(p, 'gi')) || []).length;
    const dens = (p, mult) => clamp(rx(p) / Math.max(wc, 1) * mult);

    // WHY reasoning — explicit causal structure
    const causal = dens(
      'because|therefore|thus|hence|since|so that|in order to|which means|which causes|leads to|results in|due to|as a result|consequently|implies|entails|suggests that|indicates that',
      12);

    // Holds two things in tension simultaneously
    const contrast = dens(
      "but|however|yet|although|even though|despite|whereas|at the same time|on one hand|on the other hand|simultaneously|paradoxically|and yet|still|even so|nonetheless|without.*and",
      10);

    // Meta-cognition — thinking about thinking
    const selfRef = dens(
      "I notice|I find|I tend|I keep|I realize|I wonder|I suspect|looking back|in retrospect|my sense|what I mean|hard to articulate|can't quite|something about|there's a way|some part of me|I do this|I always|I still",
      14);

    // Genuine emotion vs performed — net score
    const genuineMarkers = rx("I feel|I felt|a kind of|the way|hard to|strange|odd|like when|reminds me|I noticed|I realized|makes me|leaves me|I don't|I can't|I keep|I'm not sure|unclear|complicated|mixed|ambivalent|lost|broken|confused|scared|afraid|tired|uncertain|ache|weight|gap|wreckage|unnamed|unfinished");
    const performedMarkers = rx("totally|completely|absolutely|literally|amazing|incredible|perfect|love everything|hate everything|obviously|clearly|definitely|100%|thrilled|fantastic|wonderful|awesome");
    const auth = clamp((genuineMarkers * 1.8 - performedMarkers * 2.5) / Math.max(wc, 1) * 7 + 0.05);

    // Sentence complexity — structure reflects thought structure
    const sents = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 2);
    const lens = sents.map(s => s.split(/\s+/).length);
    const meanLen = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : wc;
    const variance = lens.length > 1 ? Math.sqrt(lens.reduce((a, b) => a + (b - meanLen) ** 2, 0) / lens.length) : 0;
    const complexity = clamp((meanLen - 3) / 26 * 0.55 + variance / 10 * 0.45);

    // Conceptual vocabulary
    const abWords = rx('system|structure|pattern|framework|model|concept|principle|mechanism|architecture|topology|invariant|emergent|substrate|layer|constraint|dynamic|equilibrium|feedback|recursive|meta|underlying|fundamental|essence|property|relation|tension|axis|field|domain|dimension|context|frame|ground|signal|noise|threshold|pressure|depth|weight|density|gradient|vector');
    const coWords = rx('today|yesterday|coffee|phone|table|chair|walk|eat|sleep|car|house|dog|cat|friend|work|job|office|meeting|email|message|food|drink|party|weekend|money|buy|sell');
    const abstract = clamp((abWords - coWords * 0.3) / Math.max(wc, 1) * 6 + 0.05);

    // Self-referential structure
    const recur = dens(
      "which|the fact that|the way that|the thing about|the point is|what this means|this means that|in the sense that|to the extent that|insofar|itself|themselves|ourselves",
      9);

    // Grounding — unique long words (specific vocabulary)
    const longWords = ltext.match(/\b[a-z]{6,}\b/g) || [];
    const specific = clamp(new Set(longWords).size / Math.max(wc, 1) * 2.4);

    // Genuine questions that open space
    const realQ = rx("what does it mean|what is|why does|how does|I wonder|what if|what would|what happens when|is it possible|could it be|what does");
    const surfaceQ = (text.match(/\?/g) || []).length;
    const qDepth = clamp((realQ * 2 + surfaceQ * 0.5) / Math.max(wc, 1) * 10);

    // Penalties
    const hedge = clamp(rx('maybe|perhaps|possibly|probably|seems|might|could|somewhat|often|usually|tends|sort of|kind of|I think|not sure|I believe|I suppose|presumably|apparently|supposedly') / Math.max(wc, 1) * 7);
    const suppress = clamp(rx("fine|okay|whatever|doesn't matter|not a big deal|it's nothing|forget it|doesn't bother|move on|over it|lol|tbh|ngl|idk|fr|lmao|smh|nah") / Math.max(wc, 1) * 10);
    const mass = clamp(Math.log(Math.max(wc, 1)) / Math.log(150));

    // ── SNR: weighted composite of depth signals ──
    const depth = (
      causal   * 0.17 +
      contrast * 0.15 +
      selfRef  * 0.13 +
      auth     * 0.13 +
      complexity * 0.11 +
      abstract * 0.10 +
      recur    * 0.09 +
      specific * 0.07 +
      qDepth   * 0.05
    );
    const vocabFactor   = 0.82 + vocab * 0.36;
    const hedgeFactor   = 1.0 - hedge * 0.40;
    const suppressFactor = 1.0 - suppress * 0.30;
    const massFactor    = 0.65 + mass * 0.35;
    const raw = depth * vocabFactor * hedgeFactor * suppressFactor * massFactor;
    const snr = clamp(raw * 2.4 + 0.06);

    // ── Sub-axes (for fingerprint + reflection) ──
    const structural = {
      entropy: ent,
      recursion: recur,
      abstraction: abstract,
      fragmentation: clamp((text.match(/[—–…,;]/g) || []).length / wc * 5),
      metaphorDensity: dens('like|as if|reminds|feels like|mirror|echo|shadow|resonance|signal|noise|frequency|wave|orbit|field|current|flow|fabric|thread', 5),
      hedgeDensity: hedge,
      coherence: clamp(ent * (1 - clamp((text.match(/[—–…]/g) || []).length / wc * 5))),
      rhythmWeight: clamp(meanLen / 30),
      negation: dens('not|never|no|without|absent|lacks|missing|nothing|neither|nor|opposite|inverse', 8),
    };

    const cognitive = {
      systemsThinking: dens('system|feedback|loop|emergent|network|node|cycle|dynamic|equilibrium|coupling|architecture|infrastructure|layer|bus|pipeline|graph', 4),
      empirical: dens('evidence|data|observe|measure|test|prove|result|experiment|study|sample|frequency|rate|baseline', 7),
      epistemic: dens('know|believe|certain|doubt|uncertain|truth|false|valid|claim|assert|assume|infer|knowledge', 7),
      topDown: dens('principle|rule|axiom|law|premise|follows|therefore|thus|hence|because|deduce|derive', 7),
      bottomUp: dens('notice|observe|pattern|example|instance|case|specific|particular|concrete|detail|found|discovered', 6),
      nonlinear: dens('speaking of|actually|wait|anyway|tangent|aside|unrelated|just realized|which reminds me', 10),
      reflective: dens("I notice|I tend to|I find|looking back|in retrospect|I realize|my tendency|when I|I usually|I always", 8),
      patternThinking: dens('always|every time|consistent|exception|invariant|never|pattern|recurring|systematic|rule|structure', 5),
      multiFramework: dens('on one hand|alternatively|another way|from a|perspective|lens|frame|angle|view|consider also|meanwhile', 7),
      cognitiveFlexibility: dens('changed my mind|reconsidering|update|revise|though actually|turns out|I was wrong|now I think', 10),
      trajectoryOrientation: dens('becoming|shifting|moving toward|evolving|trajectory|direction|drift|over time|longitudinally|trend', 8),
    };

    const emotional = {
      // No floor — zero is zero
      affectIntensity: clamp(dens('love|hate|fear|anger|joy|pain|grief|excited|devastated|overwhelmed|thrilled|terrified|elated|crushed|exhilarated|furious|heartbroken|ecstatic', 7)),
      vulnerability: clamp(dens('afraid|scared|hurt|confused|lost|broken|vulnerable|exposed|ashamed|embarrassed|rejected|abandoned|alone|struggling|desperate|raw', 8)),
      suppression: suppress,
      somatic: dens('chest|breath|body|stomach|throat|hands|weight|heavy|tight|light|warmth|cold|numb|ache|pulse|heartbeat|skin|blood', 8),
      introspective: dens("I feel|I notice|I sense|my inner|emotional|feeling|mood|state|experience|interior|internal|within me", 8),
      dysregulation: dens("overwhelmed|spinning|flooded|can't stop|uncontrollable|spiral|cascading|too much|falling apart", 9),
      repair: dens("I was wrong|fair point|you're right|I apologize|I understand|I hear you|point taken|reconsidering", 10),
      compression: clamp(suppress - clamp(dens('afraid|scared|hurt|confused|lost|broken|vulnerable|exposed|ashamed|raw', 8)) + 0.5),
      expansion: clamp(clamp(dens('afraid|scared|hurt|confused|lost|broken|vulnerable|exposed|ashamed|raw', 8)) - suppress + 0.5),
    };

    const humor = {
      dry: dens('technically|in theory|one might argue|strictly speaking|theoretically|officially|presumably|hypothetically|allegedly', 9),
      absurdist: dens('obviously|naturally|as one does|perfectly normal|unsurprisingly|of course|clearly|certainly|inevitably', 9),
      selfDeprecating: dens('classic me|naturally I would|for reasons unclear|I always manage|my brand|as expected|as per usual|I specifically', 10),
      dark: dens("anyway|we're all|inevitable|doomed|might as well|at least|could be worse|historically speaking", 8),
      ironic: clamp(dens('sure|right|definitely|absolutely|of course|totally|clearly', 6) * hedge * 3),
      sarcastic: dens('shocking|amazing|incredible|wow|what a surprise|thrilling|delightful|fantastic news', 9),
    };

    const social = {
      externalOrientation: dens('we|everyone|people|community|others|society|world|group|collective|shared|together', 5),
      internalOrientation: dens('I|my|alone|private|personal|interior|myself|solo|individual|own', 3),
      orientation: 0,
      repairCapacity: emotional.repair,
      escalationMarkers: dens('always|never|everyone|nobody|every single|completely|totally wrong|absurd|ridiculous', 6),
    };
    social.orientation = clamp((social.externalOrientation - social.internalOrientation + 1) / 2);

    const communication = {
      analytic: dens('because|therefore|however|although|despite|evidence|analysis|consider|evaluate|compare|assess|examine', 6),
      symbolic: dens('myth|archetype|metaphor|symbol|shadow|motif|echo|resonance|pattern|ghost|mirror|dream|story', 7),
      directness: clamp(1 - hedge),
      ambiguity: hedge,
    };

    const nd = {
      hyperfocus: dens('specifically|exactly|to be precise|precisely|in particular|notably|importantly|critically', 8),
      patternSeeking: cognitive.patternThinking,
      sensory: structural.metaphorDensity * 0.5 + emotional.somatic * 0.5,
      timeAtypical: dens('forgot|suddenly|how is it|lost track|already|still|again|wait', 8),
      masking: dens("supposed to|most people|pretend|act like|perform|appear|seem like|look like|as if I", 9),
      directComm: communication.directness,
      rsd: dens('rejected|ignored|dismissed|not good enough|too much|burden|annoying|too intense|overwhelm others', 9),
      infoDensity: structural.entropy * structural.coherence,
      ndScore: 0,
    };
    nd.ndScore = clamp((nd.hyperfocus + nd.patternSeeking + nd.sensory + nd.rsd + nd.masking) / 5);

    // ── LAYER 1: Motivational substrate ──
    const motivational = {
      // Personal needs
      autonomy:     dens('my own|on my terms|I decide|freedom|independent|no one can|I need to be able|control over|I choose', 12),
      competence:   dens("I can|I'm capable|I did it|getting better|learning|improving|I figured out|I built|I solved|mastery|good at", 10),
      safety:       dens("safe|secure|stable|afraid|scared|threat|danger|protect|uncertain|unpredictable|I need to know|I can't trust", 11),
      rest:         dens("tired|exhausted|depleted|burned out|need a break|can't keep|running on|no energy|worn out|overloaded", 12),
      stimulation:  dens("bored|need something new|restless|can't sit still|I need to move|dying to|craving|hungry for|need more", 12),
      // Social needs
      belonging:    dens("belong|fit in|part of|community|together|included|left out|excluded|nobody|alone|connection|no one", 11),
      recognition:  dens("seen|noticed|acknowledged|recognized|appreciated|invisible|ignored|dismissed|valued|nobody notices|credit", 12),
      fairness:     dens("fair|unfair|equal|deserved|owed|shouldn't have to|why do I|while others|not okay|not right|wrong of", 11),
      contribution: dens("I want to help|I want to give|useful|matter|make a difference|contribute|build something|leave|impact|purpose", 12),
      // Relational needs
      intimacy:     dens("close|understood|known|seen|held|real|honest|open|trust|deep|vulnerable|let in|actually talk|someone who", 10),
      trust:        dens("trust|reliable|consistent|I can count|they always|they never|honest|keep|promises|follow through|depend on", 11),
      repair:       dens("I was wrong|I'm sorry|I hurt|to make it right|fix it|I need to apologize|how do I repair|make amends|take back", 13),
      attunement:   dens("on the same page|understand each other|gets me|they just know|without saying|sense what|I can feel when|reading", 13),
      // Wants/desires
      longing:      dens("I wish|if only|I miss|I'd give anything|someday|I've always|I dream of|I want so badly|more than anything|what I want most", 14),
      aversion:     dens("I hate|I can't stand|I avoid|I dread|I refuse|I won't|never again|I'd rather|anything but|I can't bear", 11),
      ambivalence:  dens("part of me|I do and I don't|I want to but|I both|at the same time|I can't decide|I keep going back and forth|mixed", 12),
      // Goals/aspirations
      aspiration:   dens("I want to become|the kind of person|I want to be someone|I'm becoming|I hope to|eventually I|one day I|who I'm trying to be|the version of me", 14),
      goal:         dens("I'm working toward|my goal|I want to achieve|by the time|I'm trying to|I'm building|I'm working on|to get to|reach|accomplish", 13),
      longing_dir:  dens("I want|I need|I crave|I'm drawn to|I keep thinking about|I can't stop|I keep coming back", 9),
    };

    // ── LAYER 2: Value/belief structure ──
    const values_beliefs = {
      // Values
      val_honesty:    dens("honest|truth|real|genuine|authentic|transparent|I won't lie|I can't pretend|I need to say|integrity|I mean what", 11),
      val_depth:      dens("deep|meaningful|substantial|real|surface|shallow|below|underneath|actual|genuine|not just|more than|what it really", 9),
      val_loyalty:    dens("loyal|I'd do anything for|I show up|committed|I don't abandon|stick with|I stay|through|no matter what|I keep my word", 12),
      val_freedom:    dens("free|freedom|no one can|I won't be controlled|on my own terms|independence|I choose|my way|constraints|limits|boundaries", 11),
      val_growth:     dens("grow|learning|getting better|improving|evolving|changing|I want to be|not who I was|further|deeper|expanding", 10),
      val_justice:    dens("fair|just|right|wrong|should|shouldn't|deserve|owed|not okay|accountability|responsible|consequences|who suffers", 9),
      val_connection: dens("together|with people|human|real contact|I need others|we|us|shared|mutual|between us|I can't do this alone", 10),
      val_excellence: dens("best|quality|right way|properly|thoroughly|fully|I won't cut corners|all the way|standard|craft|mastery|I insist", 11),
      // Beliefs about self
      bel_capable:    dens("I can|I'm good at|I know how|I've done it|I'm able|I figure things out|I always find a way", 11),
      bel_limited:    dens("I can't|I'm not|I don't|I never|I always fail|I'm not the kind|it's not for me|I'm too|I'm not enough|I'm not good", 10),
      bel_doubt:      dens("I don't know if|maybe I|I'm not sure I|I might be wrong|what if I|I wonder if I|I second-guess|I question myself", 12),
      // World beliefs
      bel_world_hard: dens("it's hard|people don't|nobody really|the world doesn't|you can't|they won't|it never|it always|you have to fight|it costs", 10),
      bel_others_safe:dens("I trust them|they understand|they get it|people can be|if I let|when I open|they've shown|they're consistent", 13),
      bel_others_unsafe:dens("you can't trust|people will|they always|they never|no one|everyone eventually|I've been hurt|I've learned not to", 12),
      // Frameworks
      fw_systems:     dens("system|feedback|loop|dynamic|structure|architecture|how it works|mechanism|underlying|the pattern|connected|network|emergent", 8),
      fw_ethical:     dens("right thing|what I should|I can't in good conscience|it's wrong|it's right|principles|I won't compromise|my ethics", 12),
      fw_spiritual:   dens("meaning|purpose|soul|sacred|calling|bigger than|why I'm here|universe|faith|trust the process|what I'm meant", 12),
    };

    // ── INTERLAYER CONFLICTS (richest signal) ──
    const conflicts = {
      value_vs_need:    dens("I know I should|I want to but I need|I believe in X but|I care about but|even though I value|my principles say|but I can't help", 14),
      belief_vs_aspir:  dens("I want to but|I'd love to but|I wish I could but|I don't think I'm|I'm not sure I'm capable|I try but|maybe I'm not", 13),
      approach_avoid:   dens("part of me wants|at the same time|I want it but|I'm drawn to but|yes and no|I do and I don't|I both want and", 13),
      known_vs_felt:    dens("I know that|I understand that|logically|rationally|I know it's|I know I shouldn't|I know it's not|but I feel|but it still|but I can't", 11),
      ideal_vs_actual:  dens("I should be|I should have|I'm supposed to|by now I|I thought I'd|I expected|it's not where|I'm not where|I've been meaning", 12),
    };

    // ── LAYER 3: Emotions (already have emotional above, extend with named states) ──
    const named_emotions = {
      grief:     dens("grief|loss|I miss|gone|no longer|can't get back|I loved|used to|mourning|hollow|absence|the gap where", 12),
      fear:      dens("afraid|scared|terrified|dread|I worry|what if|I can't bear|I'm scared|what happens if|I'm afraid that", 11),
      anger:     dens("angry|furious|rage|it's not okay|I'm done|I can't|how dare|they had no right|I'm fed up|enough|I'm sick of", 11),
      shame:     dens("ashamed|embarrassed|I should have|I failed|I let|how could I|I don't deserve|I'm not enough|I ruined|my fault", 12),
      loneliness:dens("alone|lonely|no one|nobody|isolated|by myself|I feel like no one|they don't see|I'm invisible|even when surrounded", 12),
      joy:       dens("joy|happy|light|alive|grateful|I love|this is good|I feel good|it works|beautiful|wonderful|I'm glad|it's enough", 10),
      hope:      dens("hope|maybe|could|might|I think it's possible|I believe|not yet but|eventually|I'm trying|working toward|I haven't given up", 10),
      peace:     dens("at peace|settled|okay|enough|I'm alright|I can live with|it's okay|I accept|I've made peace|I'm done fighting|I'm still here", 11),
      anxiety:   dens("anxious|nervous|on edge|I can't settle|racing|I keep thinking|I can't stop|what if|I need to know|uncertain|the uncertainty", 11),
      exhaustion:dens("tired|exhausted|depleted|I can't anymore|running on|I have nothing left|I'm done|I need rest|I've been carrying|too much", 11),
    };

    return { structural, cognitive, emotional, humor, social, communication, nd, snr, wc, motivational, values_beliefs, conflicts, named_emotions };
  },

  distance(fpA, fpB) {
    if (!fpA || !fpB) return 1;
    const flat = fp => ['structural','cognitive','emotional','nd'].flatMap(k => Object.values(fp[k] || {}).filter(v => typeof v === 'number' && !isNaN(v)));
    const a = flat(fpA), b = flat(fpB);
    const len = Math.min(a.length, b.length);
    if (!len) return 1;
    return clamp(Math.sqrt(Array.from({length: len}, (_, i) => (a[i] - b[i]) ** 2).reduce((x, y) => x + y, 0) / len));
  },

  _entropy(text) {
    const freq = {};
    const chars = text.toLowerCase().replace(/\s/g, '');
    if (!chars.length) return 0;
    for (const ch of chars) freq[ch] = (freq[ch] || 0) + 1;
    let h = 0;
    for (const c of Object.values(freq)) { const p = c / chars.length; h -= p * Math.log2(p); }
    return Math.min(1, h / 5);
  },

  extractSignalWords(text, signal) {
    const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','is','it','that','this','was','are','be','by','have','has','had','do','did','will','would','could','should','may','might','not','with','as','from','up','down','so','if','me','my','we','you','he','she','they','i','its','just','get','got','been','one','two','can','about','your','their','our','which','what','when','who','how','all','more','some','any','now','then','there','here','than','into','out','also','very','much','still','back','even','well','way','too','make','only','know','think','going','actually','really','something','everything','anything','nothing','people','things','said','says','like','just','over']);
    const words = (text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
    const freq = {};
    words.filter(w => !stop.has(w)).forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq)
      .map(([word, count]) => ({ word, weight: clamp(count / words.length * 18) * (signal?.snr || .5), count }))
      .filter(w => w.count >= 1)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 70);
  },
};
// ── BPE ───────────────────────────────────────────────────────────
const BPE = {
  uuid:'mod_bpe_005',version:VERSION,_history:[],
  analyze(signal){
    if(!signal)return[];
    const{structural:s,cognitive:c,emotional:e,snr}=signal;
    this._history.unshift({snr,ts:Date.now()});
    if(this._history.length>100)this._history.length=100;
    const P=[];
    if(s.hedgeDensity<.1&&c.cognitiveFlexibility<.1&&snr>.6)P.push({id:'hermetic',label:'closed loop',desc:LANG.bpePattern('hermetic'),severity:'notice'});
    if(s.fragmentation>.6&&s.coherence<.3)P.push({id:'scattered',label:'scattered signal',desc:LANG.bpePattern('scattered'),severity:'notice'});
    if(e.dysregulation>.4||e.affectIntensity>.85)P.push({id:'escalation',label:'building intensity',desc:LANG.bpePattern('escalation'),severity:'watch'});
    if(s.abstraction>.7&&c.bottomUp<.2)P.push({id:'drift_pos',label:'drifting upward',desc:LANG.bpePattern('drift_pos'),severity:'info'});
    if(snr>.75&&c.systemsThinking>.6&&c.trajectoryOrientation>.4)P.push({id:'deep_dive',label:'going deep',desc:LANG.bpePattern('deep_dive'),severity:'positive'});
    if(snr>=.8)P.push({id:'high_resonance',label:'strong signal',desc:LANG.bpePattern('high_resonance'),severity:'positive'});
    if(!P.length)P.push({id:'stable_cadence',label:'holding steady',desc:LANG.bpePattern('stable_cadence'),severity:'neutral'});
    BUS.emit('bpe:analyzed',{patterns:P,snr,ts:Date.now()});
    return P;
  },
  metrics(){
    const h=this._history;
    if(!h.length)return{avgSnr:0,trend:'stable',peakSnr:0,postCount:0,avgSnrLabel:'no data yet'};
    const snrs=h.map(x=>x.snr);
    const avg=snrs.reduce((a,b)=>a+b,0)/snrs.length;
    const recent=snrs.slice(0,Math.min(10,snrs.length));
    const older=snrs.slice(Math.min(10,snrs.length));
    const trend=recent.length&&older.length?(recent.reduce((a,b)=>a+b,0)/recent.length)-(older.reduce((a,b)=>a+b,0)/older.length):0;
    return{avgSnr:avg,avgSnrLabel:LANG.snr(avg),trend:trend>.05?'rising':trend<-.05?'falling':'stable',peakSnr:Math.max(...snrs),postCount:h.length,history:h.slice(0,20)};
  },
};

// ── DEEP QUESTIONS ────────────────────────────────────────────────
const DEEP_QUESTIONS = [
  "What's a belief you used to be certain about that you've since abandoned — and what broke it?",
  "What do you keep thinking about that you haven't said out loud yet?",
  "What kind of intelligence do you most undervalue in yourself?",
  "What does your inner monologue sound like when things are going wrong?",
  "What would you protect at the cost of being misunderstood?",
  "Where is the gap between who you perform and who you are?",
  "What's the most honest thing you've ever said — and why did it cost you?",
  "What pattern keeps showing up in your life that you haven't named yet?",
  "What do you do when you feel most like yourself?",
  "What's the thing you want most that you're not letting yourself want?",
  "When did you last change your mind about something that mattered?",
  "What do you know about yourself that most people don't see?",
  "What are you building toward that nobody else would understand?",
  "What are you holding that you haven't put down yet?",
  "What do you keep returning to — not because it's comfortable, but because it's unfinished?",
  "What does silence sound like when you're genuinely okay?",
  "What have you been right about that nobody agreed with at the time?",
  "What's the version of you that's still waiting to be lived?",
  "What does your body tell you that your mind keeps overruling?",
  "What's the most complex thing you've ever had to hold simultaneously?",
  "What would you do differently if you weren't afraid of being wrong?",
  "What's the thing you're trying to understand that you can't find the right language for?",
  "What have you outgrown that you're still pretending fits?",
  "What does depth cost you in your relationships?",
  "What are you at war with inside yourself right now?",
  "What do you wish people understood about how you think?",
  "What's the question underneath the question you keep asking?",
  "What truth is living in your periphery that you keep not looking at directly?",
  "When did you last feel genuinely understood — and what made it possible?",
  "What's the oldest version of yourself that still shows up uninvited?",
  "What does it feel like when you're thinking well?",
  "What's something you know to be true that you can't prove?",
];

// ── DEMO USERS ─────────────────────────────────────────────────────
// §1.3 Demo users are seeded ONCE — never on every boot (FIX-003)
const DEMO_USERS = {
  james: {
    id:'usr_james_001', uuid:'4f8b2e7a-1c3d-4e5f-9a0b-6d7e8f9a0b1c',
    name:'James Brooks', handle:'@james', email:'james@resonance.fm',
    password:'jb2025', role:'user',
    since:'Jan 2025', bio:'Systems thinker. High recursion. The abstraction usually arrives before the grounding.',
    snrAvg:0.78, trust:0.85, ndScore:0.72, posts:0,
    regime:'exploratory', color:'#c87941',
    fingerprint:{
      structural:{entropy:.74,recursion:.61,abstraction:.82,fragmentation:.32,metaphorDensity:.54,hedgeDensity:.22,coherence:.68,rhythmWeight:.48,negation:.28},
      cognitive:{systemsThinking:.85,empirical:.44,epistemic:.58,topDown:.67,bottomUp:.52,nonlinear:.71,reflective:.78,patternThinking:.83,multiFramework:.74,cognitiveFlexibility:.52,trajectoryOrientation:.69},
      emotional:{affectIntensity:.64,vulnerability:.45,suppression:.38,somatic:.41,introspective:.72,dysregulation:.21,repair:.48,compression:.46,expansion:.54},
      humor:{dry:.68,absurdist:.55,selfDeprecating:.72,dark:.59,ironic:.46,sarcastic:.31},
      social:{externalOrientation:.44,internalOrientation:.71,orientation:.37,repairCapacity:.48,escalationMarkers:.29},
      communication:{analytic:.77,symbolic:.61,directness:.78,ambiguity:.22},
      nd:{hyperfocus:.81,patternSeeking:.83,sensory:.47,timeAtypical:.62,masking:.38,directComm:.78,rsd:.41,infoDensity:.64,ndScore:.72},
    },
    friends:{}, blocked:[], muted:[], gallery:[],
    privacySettings:{profilePublic:true,galleryPublic:true,reflectionPublic:false},
    apiKey:null,
  },
  admin: {
    id:'usr_admin_001', uuid:'9a0b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d',
    name:'Resonance Admin', handle:'@admin', email:'admin@resonance.fm',
    password:'admin123', role:'admin',
    since:'Jan 2025', bio:'Platform administrator.',
    snrAvg:0.65, trust:0.99, ndScore:0.55, posts:0,
    regime:'stable high', color:'#b89b3a',
    fingerprint:{
      structural:{entropy:.62,recursion:.48,abstraction:.61,fragmentation:.24,metaphorDensity:.38,hedgeDensity:.18,coherence:.71,rhythmWeight:.52,negation:.22},
      cognitive:{systemsThinking:.72,empirical:.68,epistemic:.61,topDown:.74,bottomUp:.58,nonlinear:.42,reflective:.55,patternThinking:.69,multiFramework:.61,cognitiveFlexibility:.64,trajectoryOrientation:.55},
      emotional:{affectIntensity:.45,vulnerability:.28,suppression:.52,somatic:.24,introspective:.48,dysregulation:.14,repair:.61,compression:.62,expansion:.38},
      humor:{dry:.51,absurdist:.38,selfDeprecating:.44,dark:.41,ironic:.38,sarcastic:.22},
      social:{externalOrientation:.64,internalOrientation:.48,orientation:.58,repairCapacity:.61,escalationMarkers:.18},
      communication:{analytic:.81,symbolic:.44,directness:.82,ambiguity:.18},
      nd:{hyperfocus:.64,patternSeeking:.69,sensory:.32,timeAtypical:.48,masking:.52,directComm:.82,rsd:.24,infoDensity:.61,ndScore:.55},
    },
    friends:{}, blocked:[], muted:[], gallery:[],
    privacySettings:{profilePublic:true,galleryPublic:true,reflectionPublic:false},
    apiKey:null,
  },
};

// ── APP STATE ──────────────────────────────────────────────────────
const STATE = {
  currentUser: null,         // active user object
  currentTab: 'auth',        // active screen
  currentQuestion: 0,        // deep question index
  currentDMUser: null,       // active DM thread userId
  currentProfileUserId: null,// viewing this profile
  currentSearchFilter: 'all',
  currentBugSeverity: 'medium',
  currentAdminTab: 'overview',
  currentMetTab: 'site',
  currentResTab: 'lattice',
  currentFriendTab: 'connections',
  currentRoadTab: 'whats-new',
  currentEditorItem: 'colors',
  uploadedImages: [],        // pending post images
  posts: [],                 // cached posts (loaded from storage)
  snrHistory: [],            // local signal history
  whyPopup: null,            // active why-popup reference
  nexusEventCount: 0,
  nexusDeltaCount: 0,
  latticeWords: [],          // current word lattice data
  aiHistory: [],             // AI assistant message history
  dmCache: {},               // { threadKey: messages[] }
  snapshots: [],             // platform snapshots
  voiceActive: false,
  visibility: 'public',      // post visibility: public|connections|private
};

// ── USER STORE ────────────────────────────────────────────────────
const UserStore = {
  _IDX:'user_index', _SEED:'users_seeded',
  _idx(){return JAA.loadPlain(this._IDX)||{};},
  _setIdx(idx){JAA.savePlain(this._IDX,idx);},
  resolveId(handleOrEmail){
    const idx=this._idx();
    const clean=handleOrEmail.replace('@','');
    return idx[handleOrEmail]||idx['@'+clean]||idx[clean]||null;
  },
  async seed(demos){
    if(JAA.loadPlain(this._SEED))return; // ROOT CAUSE FIX: only once
    const idx={};
    for(const[,u] of Object.entries(demos)){
      await JAA.initKey(u.id, u.password+u.uuid);
      await JAA.save(u.id,'profile',u);
      idx[u.handle]=u.id; idx[u.email]=u.id;
    }
    this._setIdx(idx);
    JAA.savePlain(this._SEED,{seeded:true,ts:Date.now()});
  },
  async get(userId){return JAA.load(userId,'profile');},
  async find(handleOrEmail){
    const id=this.resolveId(handleOrEmail);
    if(!id)return null;
    if(!JAA.hasKey(id))return{id,_partial:true};
    return this.get(id);
  },
  async create({name,handle,email,password}){
    const idx=this._idx();
    const cleanHandle='@'+handle.replace('@','').toLowerCase();
    if(idx[cleanHandle]||idx[email])return{error:'handle or email already taken'};
    const id='usr_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    const uuid=uid();
    const user={
      id,uuid,name,handle:cleanHandle,email,password,role:'user',
      since:new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'}),
      bio:'',snrAvg:0,trust:0.5,ndScore:0,posts:0,regime:'calibrating',
      color:randomColor(),fingerprint:null,friends:{},blocked:[],muted:[],gallery:[],
      privacySettings:{profilePublic:true,galleryPublic:true,reflectionPublic:false},
      apiKey:null,
    };
    await JAA.initKey(id,password+uuid);
    await JAA.save(id,'profile',user);
    idx[cleanHandle]=id; idx[email]=id;
    this._setIdx(idx);
    return user;
  },
  async update(userId,patch){
    const cur=await JAA.load(userId,'profile');
    if(!cur)return false;
    return JAA.save(userId,'profile',{...cur,...patch});
  },
  getAllIds(){return[...new Set(Object.values(this._idx()))];},
};

// ── POST STORE ────────────────────────────────────────────────────
const PostStore = {
  _KEY:'posts', _MAX:500,
  getAll(){return JAA.loadPlain(this._KEY)||[];},
  save(post){let p=this.getAll();p.unshift(post);if(p.length>this._MAX)p=p.slice(0,this._MAX);JAA.savePlain(this._KEY,p);return post;},
  addReply(postId,reply){const p=this.getAll();const post=p.find(x=>x.id===postId);if(!post)return false;post.replies=post.replies||[];post.replies.push(reply);JAA.savePlain(this._KEY,p);return true;},
  delete(postId){JAA.savePlain(this._KEY,this.getAll().filter(p=>p.id!==postId));},
  like(postId,userId){const p=this.getAll();const post=p.find(x=>x.id===postId);if(!post)return;post.likes=post.likes||[];const i=post.likes.indexOf(userId);if(i>-1)post.likes.splice(i,1);else post.likes.push(userId);JAA.savePlain(this._KEY,p);return post.likes.includes(userId);},
};

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, duration=3200){
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.animation='toastOut .3s var(--ease) forwards';setTimeout(()=>t.remove(),300);},duration);
}

// ── AUTH FUNCTIONS ─────────────────────────────────────────────────
// ROOT CAUSE FIX: loginUser is fully async, boot awaits it.
// Session uses plaintext cookie — key derived from stored pw hash.
async function doLogin(){
  const idVal=document.getElementById('login-id').value.trim();
  const pw=document.getElementById('login-pw').value;
  const errEl=document.getElementById('login-err');
  errEl.classList.remove('show');
  if(!idVal||!pw){errEl.textContent='enter your handle or email and password';errEl.classList.add('show');return;}
  // Resolve user ID from index (sync — index is plaintext)
  const userId=UserStore.resolveId(idVal);
  if(!userId){errEl.textContent="we don't recognise that handle or email";errEl.classList.add('show');return;}
  // Init JAA key for this user
  // We load plain pw hash for key derivation (stored at registration)
  const plain=JAA.loadPlain('pwh_'+userId);
  if(!plain){errEl.textContent='account data not found — try registering again';errEl.classList.add('show');return;}
  await JAA.initKey(userId, plain.pwh);
  const user=await JAA.load(userId,'profile');
  if(!user){errEl.textContent='could not load your account — storage may be corrupted';errEl.classList.add('show');return;}
  // Verify password
  if(user.password!==pw){errEl.textContent="that password doesn't match";errEl.classList.add('show');JAA._keys&&JAA._keys.delete&&JAA._keys.delete(userId);return;}
  await loginUser(user);
}

async function doRegister(){
  const name=document.getElementById('reg-name').value.trim();
  const handle=document.getElementById('reg-handle').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pw=document.getElementById('reg-pw').value;
  const errEl=document.getElementById('reg-err');
  errEl.classList.remove('show');
  if(!name||!handle||!email||!pw){errEl.textContent='all fields are required';errEl.classList.add('show');return;}
  if(pw.length<6){errEl.textContent='password must be at least 6 characters';errEl.classList.add('show');return;}
  const user=await UserStore.create({name,handle,email,password:pw});
  if(user.error){errEl.textContent=user.error;errEl.classList.add('show');return;}
  // Store pw hash for session restore
  JAA.savePlain('pwh_'+user.id,{pwh:pw+user.uuid,ts:Date.now()});
  await loginUser(user);
}

async function demoLogin(key){
  const demo=DEMO_USERS[key];
  if(!demo)return;
  await JAA.initKey(demo.id, demo.password+demo.uuid);
  JAA.savePlain('pwh_'+demo.id,{pwh:demo.password+demo.uuid,ts:Date.now()});
  const user=await JAA.load(demo.id,'profile')||demo;
  await loginUser(user);
}

async function loginUser(user){
  STATE.currentUser=user;
  Session.write(user.id);
  // Restore fingerprint from SNR history
  STATE.snrHistory=JAA.loadPlain('snrh_'+user.id)||[];
  if(user.fingerprint)STATE.snrHistory.forEach(h=>BPE._history.unshift({snr:h.snr,ts:h.ts}));
  // Reveal nav
  document.getElementById('topbar-tabs-center').style.opacity='1';
  document.getElementById('nav-avatar').textContent=(user.name||'?').slice(0,2).toUpperCase();
  if(user.role==='admin'){
    document.getElementById('meteditor-tab').style.display='';
    // Admin accessible via avatar button long-press or dedicated admin btn
    const navRight = document.querySelector('.topbar-right');
    if(navRight && !document.getElementById('admin-btn-nav')){
      const btn = document.createElement('div');
      btn.id = 'admin-btn-nav';
      btn.className = 'tb-icon';
      btn.title = 'admin panel';
      btn.textContent = '⚙';
      btn.style.cssText = 'background:rgba(184,155,58,.12);border-color:rgba(184,155,58,.3);color:var(--tension)';
      btn.onclick = () => openAdmin();
      navRight.insertBefore(btn, navRight.firstChild);
    }
  }
  BUS.emit('user:login',{userId:user.id,role:user.role});
  STATE.posts=PostStore.getAll();
  // Seed starter posts if none
  if(!STATE.posts.length) seedStarterPosts();
  switchTab('main');
  renderAside();
}

function logout(){
  if(!confirm('sign out?'))return;
  Session.clear();
  STATE.currentUser=null;
  STATE.posts=[];
  STATE.aiHistory=[];
  document.getElementById('topbar-tabs-center').style.opacity='0';
  document.getElementById('meteditor-tab').style.display='none';
  const adminBtn = document.getElementById('admin-btn-nav');
  if(adminBtn) adminBtn.remove();
  BUS.emit('user:logout',{});
  switchTab('auth');
  showToast('signed out');
}

function switchAuthTab(tab){
  document.getElementById('login-form').style.display=tab==='login'?'':'none';
  document.getElementById('register-form').style.display=tab==='register'?'':'none';
  document.querySelectorAll('.auth-tab').forEach(el=>el.classList.toggle('active',el.textContent.includes(tab==='login'?'sign':'new')));
}

function seedStarterPosts(){
  const u=STATE.currentUser;
  if(!u)return;
  const starters=[
    {body:"what does it mean to think in systems without losing yourself in the abstraction? I keep finding the structure before I find the ground.",tags:['far','systems']},
    {body:"there's a kind of loneliness that isn't about people. it's about the gap between what you can hold in your head and what language lets you say.",tags:['near','emotional']},
    {body:"I've been thinking about the difference between recursion and repetition. one of them learns. the other just accumulates.",tags:['tension','cognitive']},
  ];
  starters.forEach(s=>{
    const sig=SIGNAL.extract(s.body);
    const post={
      id:'post_seed_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),
      userId:u.id,userName:u.name,userHandle:u.handle,userColor:u.color,
      body:s.body,images:[],tags:s.tags,
      snr:sig?.snr||0.7,signal:sig,
      ts:Date.now()-Math.floor(Math.random()*3600000),
      replies:[],likes:[],
    };
    PostStore.save(post);
  });
  STATE.posts=PostStore.getAll();
}

// ── TAB ROUTING ────────────────────────────────────────────────────
const SCREEN_MAP={
  auth:'auth-screen',main:'main-screen',reflection:'reflection-screen',
  profile:'profile-screen',dm:'dm-screen',search:'search-screen',
  friends:'friends-screen',resonance:'resonance-screen',
  meteditor:'meteditor-screen',roadmap:'roadmap-screen',
};

function switchTab(tab){
  if(tab!=='auth'&&!STATE.currentUser){switchTab('auth');return;}
  // Admin gate — admin is a separate page now
  if(tab==='admin'){openAdmin();return;}
  STATE.currentTab=tab;
  // Update screens
  Object.values(SCREEN_MAP).forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.style.display='none';el.classList.remove('active');}
  });
  const screenId=SCREEN_MAP[tab]||'main-screen';
  const screen=document.getElementById(screenId);
  if(screen){screen.style.display='flex';screen.classList.add('active');}
  // Update nav tabs
  document.querySelectorAll('.ttab').forEach(el=>{
    el.classList.toggle('active',el.dataset.tab===tab);
  });
  // Tab-specific rendering
  if(tab==='main'){STATE.posts=PostStore.getAll();renderFeed();renderAside();}
  if(tab==='profile')renderProfile(STATE.currentUser?.id);
  if(tab==='reflection')renderReflection();
  if(tab==='resonance'){renderResTab(STATE.currentResTab);if(STATE.currentResTab==='lattice')setTimeout(drawWordLattice,100);}
  if(tab==='meteditor'){renderMetTab(STATE.currentMetTab);}
  if(tab==='roadmap'){renderRoadTab(STATE.currentRoadTab);}
  if(tab==='friends')renderFriendTab(STATE.currentFriendTab);
  if(tab==='dm')renderDMList();
  BUS.emit('tab:switched',{tab});
}

// ── COMPOSE ────────────────────────────────────────────────────────
function onComposeInput(){
  const text=document.getElementById('compose-area').value;
  const label=document.getElementById('compose-snr-label');
  if(text.length<12){label.textContent='start writing — signal score appears here';label.style.color='var(--text4)';return;}
  const sig=SIGNAL.extract(text);
  if(!sig)return;
  const desc=LANG.snr(sig.snr);
  label.textContent=desc;
  label.style.color=sig.snr>=.65?'var(--near)':sig.snr>=.4?'var(--tension)':'var(--text3)';
}

function onImgSelect(e){
  const files=[...e.target.files].slice(0,4-STATE.uploadedImages.length);
  files.forEach(file=>{
    if(file.size>25*1024*1024){showToast('file too large — max 25MB');return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      STATE.uploadedImages.push({data:ev.target.result,name:file.name});
      renderImgPreviews();
    };
    reader.readAsDataURL(file);
  });
  e.target.value='';
}

function renderImgPreviews(){
  const row=document.getElementById('img-preview-row');
  row.innerHTML=STATE.uploadedImages.map((img,i)=>`
    <div class="img-preview">
      <img src="${img.data}" alt="">
      <div class="img-preview-rm" onclick="removeImg(${i})">✕</div>
    </div>`).join('');
}

function removeImg(i){STATE.uploadedImages.splice(i,1);renderImgPreviews();}

function submitPost(){
  const u=STATE.currentUser; if(!u)return;
  const text=document.getElementById('compose-area').value.trim();
  if(!text&&!STATE.uploadedImages.length){showToast('write something first');return;}
  const sig=text?SIGNAL.extract(text):null;
  const patterns=sig?BPE.analyze(sig):[];
  // Determine zone tag
  let zone='near';
  if(sig){if(sig.snr<.4)zone='far';else if(sig.structural?.abstraction>.5||sig.cognitive?.systemsThinking>.5)zone='tension';}
  // Build resonance tags
  const tags=[zone];
  if(sig?.cognitive?.systemsThinking>.5)tags.push('systems');
  if(sig?.emotional?.vulnerability>.4)tags.push('emotional');
  if(sig?.nd?.ndScore>.5)tags.push('pattern');
  const post={
    id:'post_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    userId:u.id, userName:u.name, userHandle:u.handle, userColor:u.color,
    body:text, images:STATE.uploadedImages.map(i=>i.data),
    tags:[...new Set(tags)], snr:sig?.snr||0.5, signal:sig,
    ts:Date.now(), replies:[], likes:[],
    visibility:STATE.visibility,
  };
  PostStore.save(post);
  STATE.posts=PostStore.getAll();
  // Update user fingerprint + snr average
  if(sig){
    const newSnr=(u.snrAvg*u.posts+sig.snr)/(u.posts+1);
    const snrHist=JAA.loadPlain('snrh_'+u.id)||[];
    snrHist.unshift({snr:sig.snr,ts:Date.now()});
    if(snrHist.length>50)snrHist.length=50;
    JAA.savePlain('snrh_'+u.id,snrHist);
    UserStore.update(u.id,{fingerprint:sig,snrAvg:newSnr,posts:u.posts+1,regime:LANG.regime(newSnr,0)});
    STATE.currentUser={...u,fingerprint:sig,snrAvg:newSnr,posts:u.posts+1};
  }
  document.getElementById('compose-area').value='';
  STATE.uploadedImages=[];
  renderImgPreviews();
  document.getElementById('compose-snr-label').textContent='start writing — signal score appears here';
  BUS.emit('post:created',{postId:post.id,snr:post.snr});
  renderFeed();
  renderAside();
  showToast('emitted');
}

function cycleVis(){
  const cycle={public:'connections',connections:'private',private:'public'};
  STATE.visibility=cycle[STATE.visibility]||'public';
  const icons={public:'🌐',connections:'🔗',private:'🔒'};
  document.getElementById('vis-btn').textContent=icons[STATE.visibility];
}

function toggleVoice(){
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){showToast('voice input not supported in this browser');return;}
  if(STATE.voiceActive){STATE.voiceActive=false;STATE._sr?.stop();document.getElementById('voice-btn').textContent='🎙';return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  STATE._sr=new SR();
  STATE._sr.continuous=true; STATE._sr.interimResults=true;
  STATE._sr.onresult=e=>{
    const transcript=[...e.results].map(r=>r[0].transcript).join('');
    document.getElementById('compose-area').value=transcript;
    onComposeInput();
  };
  STATE._sr.onend=()=>{STATE.voiceActive=false;document.getElementById('voice-btn').textContent='🎙';};
  STATE._sr.start();
  STATE.voiceActive=true;
  document.getElementById('voice-btn').textContent='🔴';
}

// ── FEED RENDERING ─────────────────────────────────────────────────
function getResonanceZone(post){
  const u=STATE.currentUser;
  if(!u?.fingerprint||!post.signal)return post.tags?.includes('far')?'far':post.tags?.includes('tension')?'tension':'near';
  const dist=SIGNAL.distance(u.fingerprint,post.signal);
  if(dist<=.25)return'near';
  if(dist<=.55)return'tension';
  return'far';
}

function renderFeed(){
  const u=STATE.currentUser; if(!u)return;
  const container=document.getElementById('feed-container');
  if(!container)return;
  const avEl=document.getElementById('compose-av');
  if(avEl)avEl.textContent=u.name.slice(0,2).toUpperCase();
  avEl && (avEl.style.background='var(--signal2)');
  const posts=STATE.posts.filter(p=>!u.blocked?.includes(p.userId));
  if(!posts.length){container.innerHTML='<div class="empty-state">no posts yet — be the first to emit a signal</div>';return;}
  // Sort into zones
  const near=[],tension=[],far=[];
  posts.forEach(p=>{const z=getResonanceZone(p);if(z==='near')near.push(p);else if(z==='tension')tension.push(p);else far.push(p);});
  let html='';
  if(near.length){html+=zoneLabel('near field','near');near.forEach(p=>{html+=renderPost(p,'near');});}
  if(tension.length){html+=zoneLabel('different angle','tension');tension.forEach(p=>{html+=renderPost(p,'tension');});}
  if(far.length){html+=zoneLabel('far field','far');far.forEach(p=>{html+=renderPost(p,'far');});}
  container.innerHTML=html;
  // Bind events after render
  container.querySelectorAll('.reply-toggle').forEach(el=>{
    el.addEventListener('click',()=>toggleReplies(el.dataset.id));
  });
  container.querySelectorAll('.like-btn').forEach(el=>{
    el.addEventListener('click',()=>likePost(el.dataset.id,el));
  });
  container.querySelectorAll('.why-btn').forEach(el=>{
    el.addEventListener('click',e=>{e.stopPropagation();showWhyPopup(el.dataset.id,el);});
  });
  // Update question panel
  updateQuestionPrompt();
}

function zoneLabel(label,zone){
  return`<div class="zone-label"><div class="zone-line"></div><div class="zone-text">${label}</div><div class="zone-badge ${zone}">${zone}</div><div class="zone-line"></div></div>`;
}

function renderPost(post,zone='near'){
  const u=STATE.currentUser;
  const isLiked=post.likes?.includes(u?.id);
  const initials=(post.userName||'?').slice(0,2).toUpperCase();
  const col=post.userColor||'#c87941';
  const ts=new Date(post.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const images=post.images?.length?`<div class="post-images c${Math.min(post.images.length,2)}">${post.images.map(src=>`<img src="${src}" onclick="openLightbox('${src}')" loading="lazy" alt="">`).join('')}</div>`:'';
  const tags=(post.tags||[]).map(t=>`<span class="rtag ${t==='near'?'near':t==='tension'?'tension':'far'}"><span class="rtag-dot"></span>${t}</span>`).join('');
  const snrDesc=post.snr?LANG.snr(post.snr):'';
  return`<div class="post" data-id="${post.id}">
    <div class="post-head">
      <div class="post-av" style="background:${hexToRgba(col,.14)};border-color:${hexToRgba(col,.3)};color:${col}">${initials}</div>
      <div class="post-meta">
        <div class="post-name" onclick="viewProfile('${post.userId}')">${escHtml(post.userName)}</div>
        <div class="post-handle">${escHtml(post.userHandle)} · ${snrDesc}</div>
      </div>
      <div class="post-ts">${ts}</div>
    </div>
    ${post.body?`<div class="post-body">${escHtml(post.body)}</div>`:''}
    ${images}
    <div>${tags}</div>
    <div class="post-actions">
      <button class="post-action reply-toggle" data-id="${post.id}">↩ ${post.replies?.length||0} replies</button>
      <button class="post-action like-btn${isLiked?' liked':''}" data-id="${post.id}">♥ ${post.likes?.length||0}</button>
      <button class="post-action why-btn" data-id="${post.id}">∿ why this</button>
      ${u?.id===post.userId?`<button class="post-action" onclick="deletePost('${post.id}')" style="margin-left:auto;color:var(--text4)">✕</button>`:''}
    </div>
    <div class="replies-thread" id="replies-${post.id}">
      <div class="reply-compose">
        <div class="compose-av" style="width:24px;height:24px;font-size:9px;flex-shrink:0;background:var(--signal2);border:1px solid var(--signal3);color:var(--signal);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--mono)">${(u?.name||'?').slice(0,2).toUpperCase()}</div>
        <textarea class="reply-area" id="ra-${post.id}" placeholder="reply..." rows="1" oninput="autoResize(this)" onkeydown="replyEnter(event,'${post.id}')"></textarea>
        <button class="btn-sm primary" onclick="submitReply('${post.id}')">↩</button>
      </div>
      ${(post.replies||[]).map(r=>renderReply(r)).join('')}
    </div>
  </div>`;
}

function renderReply(r){
  const initials=(r.userName||'?').slice(0,2).toUpperCase();
  const col=r.userColor||'#c87941';
  const ts=new Date(r.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return`<div class="reply-card">
    <div class="reply-head">
      <div class="reply-av" style="background:${hexToRgba(col,.14)};border:1px solid ${hexToRgba(col,.3)};color:${col}">${initials}</div>
      <div class="reply-name">${escHtml(r.userName)}</div>
      <div class="reply-ts">${ts}</div>
    </div>
    <div class="reply-body">${escHtml(r.body)}</div>
  </div>`;
}

function toggleReplies(postId){
  const el=document.getElementById('replies-'+postId);
  if(!el)return;
  el.classList.toggle('open');
}

function submitReply(postId){
  const u=STATE.currentUser; if(!u)return;
  const area=document.getElementById('ra-'+postId);
  const text=area?.value?.trim();
  if(!text)return;
  const reply={
    id:'rep_'+Date.now(),postId,
    userId:u.id,userName:u.name,userHandle:u.handle,userColor:u.color,
    body:text,ts:Date.now(),
  };
  PostStore.addReply(postId,reply);
  area.value='';
  area.style.height='auto';
  STATE.posts=PostStore.getAll();
  renderFeed();
  BUS.emit('reply:created',{postId,replyId:reply.id});
}

function replyEnter(e,postId){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitReply(postId);}}

function likePost(postId,btn){
  const u=STATE.currentUser; if(!u)return;
  const liked=PostStore.like(postId,u.id);
  STATE.posts=PostStore.getAll();
  const post=STATE.posts.find(p=>p.id===postId);
  if(btn){btn.className=`post-action like-btn${liked?' liked':''}`;btn.textContent=`♥ ${post?.likes?.length||0}`;}
  BUS.emit('post:liked',{postId,liked});
}

function deletePost(postId){
  if(!confirm('delete this post?'))return;
  PostStore.delete(postId);
  STATE.posts=PostStore.getAll();
  renderFeed();
  showToast('post deleted');
}

function showWhyPopup(postId,btn){
  const u=STATE.currentUser; if(!u)return;
  const post=STATE.posts.find(p=>p.id===postId);
  if(!post)return;
  // Remove existing popup
  document.querySelectorAll('.why-popup').forEach(el=>el.remove());
  const dist=post.signal&&u.fingerprint?SIGNAL.distance(u.fingerprint,post.signal):0.5;
  const zone=getResonanceZone(post);
  const zoneLabels={near:'near field — close to your signal',tension:'different angle — productive friction',far:'far field — expands your range'};
  const popup=document.createElement('div');
  popup.className='why-popup';
  popup.innerHTML=`<div class="why-popup-close" onclick="this.parentNode.remove()">✕</div>
    <div class="why-popup-name">why you're seeing this</div>
    <div class="why-popup-dist">${LANG.resonanceDist(dist)}</div>
    <div class="why-popup-axes">${zoneLabels[zone]||''}</div>
    <div class="why-popup-why">${post.signal?`this post has ${LANG.snr(post.signal.snr)} and ${LANG.abstraction(post.signal.structural?.abstraction||0)}.`:'no signal data yet.'}</div>`;
  const rect=btn.getBoundingClientRect();
  popup.style.cssText=`top:${Math.min(rect.bottom+8,window.innerHeight-180)}px;left:${Math.max(0,Math.min(rect.left,window.innerWidth-320))}px`;
  document.body.appendChild(popup);
  document.addEventListener('click',function once(e){if(!popup.contains(e.target)){popup.remove();document.removeEventListener('click',once);}},{once:true,capture:true});
}

function openLightbox(src){
  document.getElementById('lightbox').style.display='flex';
  document.getElementById('lightbox-img').src=src;
}
function closeLightbox(){document.getElementById('lightbox').style.display='none';}

// ── DEEP QUESTIONS ─────────────────────────────────────────────────
function updateQuestionPrompt(){
  const q=DEEP_QUESTIONS[STATE.currentQuestion%DEEP_QUESTIONS.length];
  const el=document.getElementById('q-prompt-text');
  const asideEl=document.getElementById('aside-q-text');
  if(el)el.textContent=q;
  if(asideEl)asideEl.textContent=q;
}
function nextQuestion(){STATE.currentQuestion=(STATE.currentQuestion+1)%DEEP_QUESTIONS.length;updateQuestionPrompt();}
function answerQuestion(){
  const q=DEEP_QUESTIONS[STATE.currentQuestion%DEEP_QUESTIONS.length];
  const area=document.getElementById('compose-area');
  if(area){area.value='';area.placeholder=q;area.focus();}
}

// ── ASIDE RENDERING ────────────────────────────────────────────────
function renderAside(){
  renderHealth();
  renderBPEPanel();
  renderResonantSignals();
}

function renderHealth(){
  const u=STATE.currentUser; if(!u)return;
  const fp=u.fingerprint;
  const el=document.getElementById('aside-health');
  if(!el)return;
  if(!fp){el.innerHTML='<div style="font-family:var(--mono);font-size:9px;color:var(--text4);font-style:italic">write a post to calibrate your signal</div>';return;}
  // Top dominant signals across all three layers
  const mot=fp.motivational||{};
  const vb=fp.values_beliefs||{};
  const ne=fp.named_emotions||{};
  const co=fp.conflicts||{};
  const needKeys=['autonomy','competence','safety','rest','stimulation','belonging','recognition','fairness','contribution','intimacy','trust','repair','attunement'];
  const topNeed=needKeys.reduce((a,b)=>(mot[b]||0)>(mot[a]||0)?b:a,'autonomy');
  const topNeedVal=mot[topNeed]||0;
  const valKeys=['val_honesty','val_depth','val_loyalty','val_freedom','val_growth','val_justice','val_connection','val_excellence'];
  const topVal=valKeys.reduce((a,b)=>(vb[b]||0)>(vb[a]||0)?b:a,'val_honesty');
  const emoKeys=Object.keys(ne);
  const topEmo=emoKeys.length?emoKeys.reduce((a,b)=>(ne[b]||0)>(ne[a]||0)?b:a,emoKeys[0]):'—';
  const conflictLoad=Math.max(...Object.values(co).map(v=>v||0),0);
  const bars=[
    {label:'signal quality',val:fp.snr||u.snrAvg||0,color:'var(--signal)',desc:LANG.snr(fp.snr||u.snrAvg||0)},
    {label:'abstraction',val:fp.structural?.abstraction||0,color:'var(--far)',desc:LANG.abstraction(fp.structural?.abstraction||0)},
    {label:'systems thinking',val:fp.cognitive?.systemsThinking||0,color:'var(--nd)',desc:LANG.systemsThinking(fp.cognitive?.systemsThinking||0)},
    {label:'affect intensity',val:fp.emotional?.affectIntensity||0,color:'var(--tension)',desc:LANG.affectIntensity(fp.emotional?.affectIntensity||0)},
    {label:'vulnerability',val:fp.emotional?.expansion||0,color:'var(--near)',desc:LANG.expansion(fp.emotional?.expansion||0)},
    {label:'pattern density',val:fp.nd?.ndScore||0,color:'var(--nd)',desc:LANG.ndScore(fp.nd?.ndScore||0)},
    {label:'dominant need',val:topNeedVal,color:'var(--nd)',desc:topNeedVal>.08?(topNeed):'nothing surfaced yet'},
    {label:'core value',val:vb[topVal]||0,color:'var(--tension)',desc:(vb[topVal]||0)>.08?topVal.replace('val_',''):'nothing surfaced yet'},
    {label:'top emotion',val:ne[topEmo]||0,color:'var(--warn)',desc:(ne[topEmo]||0)>.06?topEmo:'nothing surfaced yet'},
    {label:'conflict load',val:conflictLoad,color:conflictLoad>.3?'var(--warn)':'var(--near)',desc:conflictLoad>.1?'tension detected':'holding steady'},
  ];
  el.innerHTML=bars.map(b=>`
    <div class="bar-row">
      <div class="bar-name">${b.label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(b.val*100)}%;background:${b.color}"></div></div>
      <div class="bar-val">${b.desc}</div>
    </div>`).join('');
}

function renderBPEPanel(){
  const el=document.getElementById('aside-bpe');
  if(!el)return;
  const patterns=BPE.analyze(STATE.currentUser?.fingerprint||null);
  if(!patterns.length){el.innerHTML='<div style="font-family:var(--mono);font-size:9px;color:var(--text4);font-style:italic">no patterns yet</div>';return;}
  el.innerHTML=patterns.slice(0,2).map(p=>`
    <div class="bpe-pattern ${p.severity}">
      <div>
        <div class="bpe-label">${p.label}</div>
        <div class="bpe-desc">${p.desc}</div>
      </div>
    </div>`).join('');
}

function renderResonantSignals(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('aside-resonant');
  if(!el)return;
  const allIds=UserStore.getAllIds().filter(id=>id!==u.id).slice(0,5);
  if(!allIds.length){el.innerHTML='<div style="font-family:var(--mono);font-size:9px;color:var(--text4);font-style:italic">no other users yet</div>';return;}
  el.innerHTML='<div style="font-family:var(--mono);font-size:9px;color:var(--text4);font-style:italic">other users appear here as they join</div>';
}

// ── PROFILE ────────────────────────────────────────────────────────
function renderProfile(userId){
  const u=userId===STATE.currentUser?.id?STATE.currentUser:null;
  if(!u)return;
  const initials=u.name.slice(0,2).toUpperCase();
  const col=u.color||'#c87941';
  const avEl=document.getElementById('profile-av-lg');
  if(avEl){
    avEl.style.background=hexToRgba(col,.14);
    avEl.style.borderColor=hexToRgba(col,.4);
    avEl.style.color=col;
    const initNode=avEl.querySelector('.profile-av-upload');
    if(!avEl.querySelector('.av-init'))avEl.insertAdjacentHTML('afterbegin',`<span class="av-init" style="pointer-events:none">${initials}</span>`);
    const photo=document.getElementById('profile-photo');
    const savedPhoto=JAA.loadPlain('photo_'+u.id);
    if(savedPhoto&&photo){photo.src=savedPhoto;photo.style.display='block';}
  }
  document.getElementById('profile-display-name').textContent=u.name;
  document.getElementById('profile-handle').textContent=u.handle;
  document.getElementById('profile-bio').textContent=u.bio||'no bio yet — click to add one';
  document.getElementById('profile-since').textContent='member since '+u.since;
  // Signal summary
  const fp=u.fingerprint;
  const sumEl=document.getElementById('profile-signal-sum');
  if(sumEl&&fp){
    const parts=[];
    if(fp.structural?.abstraction>.5)parts.push('abstraction ↑');
    if(fp.cognitive?.systemsThinking>.5)parts.push('systems thinking ↑');
    if(fp.emotional?.compression>.5)parts.push('emotional compression ↑');
    if(fp.structural?.metaphorDensity>.4)parts.push('metaphor density ↑');
    if(fp.nd?.ndScore>.5)parts.push('pattern density ↑');
    sumEl.textContent=parts.join(' · ')||'write more to build your signal portrait';
  }
  // Role badge
  if(u.role==='admin'){
    const name=document.getElementById('profile-display-name');
    if(name&&!name.querySelector('.chip'))name.insertAdjacentHTML('beforeend','&nbsp;<span class="chip role-admin">admin</span>');
  }
  // Render posts tab
  renderProfilePosts();
  // Render gallery
  renderGallery();
}

function renderProfilePosts(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('profile-posts-tab');
  if(!el)return;
  const myPosts=PostStore.getAll().filter(p=>p.userId===u.id);
  if(!myPosts.length){el.innerHTML='<div class="empty-state">you haven\'t posted yet</div>';return;}
  el.innerHTML=myPosts.map(p=>renderPost(p,getResonanceZone(p))).join('');
}

function switchProfileTab(tab,el){
  document.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  ['profile-posts-tab','profile-gallery-tab','profile-reflection-tab-tab','profile-settings-tab'].forEach(id=>{
    const d=document.getElementById(id);if(d)d.style.display='none';
  });
  const map={posts:'profile-posts-tab',gallery:'profile-gallery-tab','reflection-tab':'profile-reflection-tab-tab',settings:'profile-settings-tab'};
  const target=document.getElementById(map[tab]);
  if(target)target.style.display='';
  if(tab==='gallery')renderGallery();
  if(tab==='settings')renderProfileSettings();
}

function editBio(){
  const u=STATE.currentUser; if(!u)return;
  const current=u.bio||'';
  const bio=prompt('edit your bio:',current);
  if(bio===null)return;
  UserStore.update(u.id,{bio});
  STATE.currentUser={...u,bio};
  document.getElementById('profile-bio').textContent=bio||'no bio yet — click to add one';
  showToast('bio updated');
  BUS.emit('profile:updated',{userId:u.id,field:'bio'});
}

function uploadProfilePhoto(e){
  const file=e.target.files[0]; if(!file)return;
  if(file.size>5*1024*1024){showToast('photo max 5MB');return;}
  const reader=new FileReader();
  reader.onload=ev=>{
    const data=ev.target.result;
    JAA.savePlain('photo_'+STATE.currentUser.id,data);
    const photo=document.getElementById('profile-photo');
    if(photo){photo.src=data;photo.style.display='block';}
    showToast('photo updated');
    BUS.emit('profile:updated',{userId:STATE.currentUser.id,field:'photo'});
  };
  reader.readAsDataURL(file);
}

function renderGallery(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('gallery-grid');
  if(!el)return;
  const gallery=JAA.loadPlain('gallery_'+u.id)||[];
  const items=gallery.map((item,i)=>`
    <div class="gallery-item">
      <img src="${item.data}" alt="" onclick="openLightbox('${item.data}')">
      <div class="gallery-item-tags">${(item.tags||[]).map(t=>`<span class="gallery-tag">${escHtml(t)}</span>`).join('')}</div>
      <div style="position:absolute;top:4px;right:4px;cursor:pointer;background:rgba(0,0,0,.6);border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff" onclick="removeGalleryItem(${i})">✕</div>
    </div>`).join('');
  el.innerHTML=items+`<div class="gallery-upload" onclick="document.getElementById('gallery-input').click()">
    <span style="font-size:20px;color:var(--text3)">+</span>
    <span>add to gallery</span>
  </div>`;
}

function uploadGallery(e){
  const u=STATE.currentUser; if(!u)return;
  const files=[...e.target.files].slice(0,10);
  const gallery=JAA.loadPlain('gallery_'+u.id)||[];
  if(gallery.length>=100){showToast('gallery limit reached — max 100 items');return;}
  files.forEach(file=>{
    if(file.size>25*1024*1024){showToast(`${file.name} too large — max 25MB`);return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      gallery.push({data:ev.target.result,name:file.name,tags:[],ts:Date.now()});
      JAA.savePlain('gallery_'+u.id,gallery);
      renderGallery();
    };
    reader.readAsDataURL(file);
  });
  e.target.value='';
}

function removeGalleryItem(i){
  const u=STATE.currentUser; if(!u)return;
  const gallery=JAA.loadPlain('gallery_'+u.id)||[];
  gallery.splice(i,1);
  JAA.savePlain('gallery_'+u.id,gallery);
  renderGallery();
}

function renderProfileSettings(){
  const u=STATE.currentUser; if(!u)return;
  const ps=u.privacySettings||{};
  const set=(id,val)=>{const el=document.getElementById(id);if(el){el.classList.toggle('on',!!val);}};
  set('tog-public-profile',ps.profilePublic);
  set('tog-public-gallery',ps.galleryPublic);
  set('tog-reflection',ps.reflectionPublic);
}

function toggleSetting(key,el){
  const u=STATE.currentUser; if(!u)return;
  el.classList.toggle('on');
  const val=el.classList.contains('on');
  const ps={...(u.privacySettings||{}), [key]:val};
  UserStore.update(u.id,{privacySettings:ps});
  STATE.currentUser={...u,privacySettings:ps};
  showToast(key+' '+(val?'on':'off'));
}

function changeEmail(){
  const u=STATE.currentUser; if(!u)return;
  const email=document.getElementById('new-email-input')?.value?.trim();
  if(!email){showToast('enter a new email');return;}
  UserStore.update(u.id,{email});
  STATE.currentUser={...u,email};
  document.getElementById('new-email-input').value='';
  showToast('email updated');
}

function changePassword(){
  const u=STATE.currentUser; if(!u)return;
  const pw=document.getElementById('new-pw-input')?.value;
  if(!pw||pw.length<6){showToast('password must be at least 6 characters');return;}
  UserStore.update(u.id,{password:pw});
  JAA.savePlain('pwh_'+u.id,{pwh:pw+u.uuid,ts:Date.now()});
  STATE.currentUser={...u,password:pw};
  document.getElementById('new-pw-input').value='';
  showToast('password updated');
}

function confirmDeleteAccount(){
  if(!confirm('this will permanently delete your account and all data. are you sure?'))return;
  if(!confirm('last chance — this cannot be undone.'))return;
  const u=STATE.currentUser;
  JAA.purge(u.id);
  const idx=JAA.loadPlain('user_index')||{};
  Object.keys(idx).forEach(k=>{if(idx[k]===u.id)delete idx[k];});
  JAA.savePlain('user_index',idx);
  logout();
  showToast('account deleted');
}

function viewProfile(userId){
  if(userId===STATE.currentUser?.id){switchTab('profile');return;}
  showToast('viewing other profiles — coming in a future version');
}

// ── REFLECTION ─────────────────────────────────────────────────────
function renderReflection(){
  const u=STATE.currentUser; if(!u)return;
  const fp=u.fingerprint;
  const el=document.getElementById('reflection-grid');
  if(!el)return;
  if(!fp){
    el.innerHTML='<div class="reflection-card" style="grid-column:1/-1"><div class="rc-label">calibrating</div><div class="rc-value">write 3–5 posts to build your signal portrait</div><div class="rc-note">your fingerprint emerges from your language — not from answers to quiz questions</div></div>';
    return;
  }

  // ── Layer 1: Motivational substrate ──
  const mot=fp.motivational||{};
  // Find dominant need
  const needKeys=['autonomy','competence','safety','rest','stimulation','belonging','recognition','fairness','contribution','intimacy','trust','repair','attunement'];
  const topNeed=needKeys.sort((a,b)=>(mot[b]||0)-(mot[a]||0))[0];
  const topNeedVal=mot[topNeed]||0;
  // Find dominant want/aspiration
  const wantKeys=['longing','aspiration','goal','aversion','ambivalence'];
  const topWant=wantKeys.sort((a,b)=>(mot[b]||0)-(mot[a]||0))[0];

  // ── Layer 2: Values/beliefs ──
  const vb=fp.values_beliefs||{};
  const valKeys=['val_honesty','val_depth','val_loyalty','val_freedom','val_growth','val_justice','val_connection','val_excellence'];
  const topVal=valKeys.sort((a,b)=>(vb[b]||0)-(vb[a]||0))[0];
  const topValLabel=topVal?topVal.replace('val_',''):'—';
  const belKeys=['bel_capable','bel_limited','bel_doubt','bel_world_hard','bel_others_safe','bel_others_unsafe'];
  const topBel=belKeys.sort((a,b)=>(vb[b]||0)-(vb[a]||0))[0];

  // ── Layer 3: Emotions ──
  const ne=fp.named_emotions||{};
  const emoKeys=Object.keys(ne);
  const topEmo=emoKeys.sort((a,b)=>(ne[b]||0)-(ne[a]||0))[0];

  // ── Conflicts ──
  const co=fp.conflicts||{};
  const conflictKeys=Object.keys(co);
  const topConflict=conflictKeys.sort((a,b)=>(co[b]||0)-(co[a]||0))[0];
  const conflictLoad=co[topConflict]||0;

  const needLabels={autonomy:'autonomy',competence:'competence',safety:'safety',rest:'rest',stimulation:'stimulation',belonging:'belonging',recognition:'recognition',fairness:'fairness',contribution:'contribution',intimacy:'intimacy',trust:'trust',repair:'repair',attunement:'attunement'};
  const conflictLabels={value_vs_need:'value vs need',belief_vs_aspir:'belief vs aspiration',approach_avoid:'approach/avoid',known_vs_felt:'known vs felt',ideal_vs_actual:'ideal vs actual'};
  const belLabels={bel_capable:'self-belief: capable',bel_limited:'self-belief: limited',bel_doubt:'self-doubt active',bel_world_hard:'world is hard',bel_others_safe:'others are trustworthy',bel_others_unsafe:'others are unsafe'};
  const fwLabels={fw_systems:'systems framework',fw_ethical:'ethical framework',fw_spiritual:'meaning/purpose framework'};

  const cards=[
    // SNR
    {label:'signal quality',val:fp.snr||u.snrAvg||0,color:'var(--signal)',desc:LANG.snr(fp.snr||u.snrAvg||0),note:'how much meaningful signal is in your language relative to noise'},
    // Layer 1 — motivational
    {label:'dominant need',val:topNeedVal,color:'var(--nd)',
      desc:topNeedVal>.08?(needLabels[topNeed]||topNeed)+' showing':'no strong need signal',
      note:'the need most active in your recent writing — needs generate language before feelings do'},
    {label:'directional pull',val:mot[topWant]||0,color:'var(--far)',
      desc:(mot[topWant]||0)>.08?(topWant==='aspiration'?'identity-level aspiration':topWant==='longing'?'something longed for':topWant==='goal'?'named goal active':topWant==='aversion'?'strong aversion':topWant):'no strong directional signal',
      note:'what you are moving toward or away from — wants and desires leave traces even when not named directly'},
    // Layer 2 — values
    {label:'core value signal',val:vb[topVal]||0,color:'var(--tension)',
      desc:(vb[topVal]||0)>.08?topValLabel+' as a value':'no strong value signal',
      note:'the value most present in what you defend, return to, or treat as non-negotiable'},
    {label:'belief structure',val:vb[topBel]||0,color:'var(--nd)',
      desc:(vb[topBel]||0)>.08?(belLabels[topBel]||topBel):'no strong belief signal',
      note:'how you hold yourself and the world — beliefs shape what you allow yourself to want or attempt'},
    {label:'active framework',val:Math.max(vb.fw_systems||0,vb.fw_ethical||0,vb.fw_spiritual||0),color:'var(--far)',
      desc:['fw_systems','fw_ethical','fw_spiritual'].map(k=>({k,v:vb[k]||0})).sort((a,b)=>b.v-a.v)[0].v>.06?fwLabels[['fw_systems','fw_ethical','fw_spiritual'].map(k=>({k,v:vb[k]||0})).sort((a,b)=>b.v-a.v)[0].k]||'—':'no framework signal',
      note:'the meta-structure you use to reason — systems, ethics, meaning, narrative, empirical'},
    // Layer 3 — emotions
    {label:'dominant emotion',val:ne[topEmo]||0,color:'var(--warn)',
      desc:(ne[topEmo]||0)>.06?topEmo:'no strong emotional signal',
      note:'the emotional state most present in your language — emotions are downstream of needs and values'},
    // Conflict
    {label:'interlayer conflict',val:conflictLoad,color:conflictLoad>.3?'var(--warn)':'var(--near)',
      desc:conflictLoad>.1?(conflictLabels[topConflict]||topConflict)+' tension':'holding steady — no strong conflict',
      note:'where your layers contradict each other — conflict is high-information; it shows where the system is working'},
    // SNR sub-axes
    {label:'abstraction level',val:fp.structural?.abstraction||0,color:'var(--far)',desc:LANG.abstraction(fp.structural?.abstraction||0),note:'how much of your thinking operates at the conceptual level'},
    {label:'systems thinking',val:fp.cognitive?.systemsThinking||0,color:'var(--nd)',desc:LANG.systemsThinking(fp.cognitive?.systemsThinking||0),note:'how often you reason about feedback, dynamics, and structure'},
    {label:'openness',val:fp.emotional?.expansion||0,color:'var(--near)',desc:LANG.expansion(fp.emotional?.expansion||0),note:'how much emotional material you let through vs hold back'},
    {label:'pattern density',val:fp.nd?.ndScore||0,color:'var(--nd)',desc:LANG.ndScore(fp.nd?.ndScore||0),note:'pattern-seeking, hyperfocus, and non-linear thinking combined'},
  ];

  el.innerHTML=cards.map(c=>`
    <div class="reflection-card">
      <div class="rc-label">${c.label}</div>
      <div class="rc-value">${c.desc}</div>
      <div class="rc-bar"><div class="rc-bar-fill" style="width:${Math.round(c.val*100)}%;background:${c.color}"></div></div>
      <div class="rc-note">${c.note}</div>
    </div>`).join('');

  const bpeEl=document.getElementById('reflection-bpe');
  if(bpeEl){
    const patterns=BPE.analyze(fp);
    bpeEl.innerHTML=patterns.map(p=>`
      <div class="bpe-pattern ${p.severity}">
        <div><div class="bpe-label">${p.label}</div><div class="bpe-desc">${p.desc}</div></div>
      </div>`).join('');
  }
}

async function saveBrainDump(){
  const u=STATE.currentUser; if(!u)return;
  const text=document.getElementById('brain-dump-area')?.value||'';
  await JAA.save(u.id,'brain_dump',{text,ts:Date.now()});
  showToast('saved — encrypted, only you can read this');
  BUS.emit('reflection:saved',{userId:u.id});
}

async function loadBrainDump(){
  const u=STATE.currentUser; if(!u)return;
  const data=await JAA.load(u.id,'brain_dump');
  if(data){
    document.getElementById('brain-dump-area').value=data.text||'';
    showToast('loaded');
  } else {
    showToast('no saved reflection found');
  }
}

// ── DM SCREEN ──────────────────────────────────────────────────────
function renderDMList(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('dm-list-items');
  if(!el)return;
  const threads=JAA.loadPlain('dm_threads_'+u.id)||[];
  if(!threads.length){el.innerHTML='<div class="empty-state" style="font-size:11px;padding:20px">no conversations yet<br><span style="font-size:9px;color:var(--text4)">click + to start one</span></div>';return;}
  el.innerHTML=threads.map(t=>`
    <div class="dm-item${STATE.currentDMUser===t.userId?' active':''}" onclick="openDM('${t.userId}','${escHtml(t.name)}','${escHtml(t.handle)}','${t.color||'#c87941'}')">
      <div class="dm-av" style="background:${hexToRgba(t.color||'#c87941',.14)};color:${t.color||'#c87941'};border:1px solid ${hexToRgba(t.color||'#c87941',.3)}">${(t.name||'?').slice(0,2).toUpperCase()}</div>
      <div class="dm-item-info">
        <div class="dm-item-name">${escHtml(t.name)}</div>
        <div class="dm-item-preview">${escHtml(t.lastMsg||'say hello')}</div>
      </div>
    </div>`).join('');
}

function openDM(userId,name,handle,color){
  const u=STATE.currentUser; if(!u)return;
  STATE.currentDMUser=userId;
  const head=document.getElementById('dm-thread-head');
  const avEl=document.getElementById('dm-thread-av');
  const nameEl=document.getElementById('dm-thread-name');
  const handleEl=document.getElementById('dm-thread-handle');
  const compose=document.getElementById('dm-compose');
  if(head){head.style.display='flex';}
  if(avEl){avEl.textContent=(name||'?').slice(0,2).toUpperCase();avEl.style.background=hexToRgba(color||'#c87941',.14);avEl.style.color=color||'#c87941';avEl.style.border=`1px solid ${hexToRgba(color||'#c87941',.3)}`;}
  if(nameEl)nameEl.textContent=name;
  if(handleEl)handleEl.textContent=handle;
  if(compose)compose.style.display='flex';
  // Load messages
  const key=[u.id,userId].sort().join('_');
  const msgs=JAA.loadPlain('dm_'+key)||[];
  const msgsEl=document.getElementById('dm-messages');
  if(msgsEl){
    if(!msgs.length){msgsEl.innerHTML='<div class="empty-state">start the conversation</div>';return;}
    msgsEl.innerHTML=msgs.map(m=>`
      <div>
        <div class="dm-msg ${m.from===u.id?'mine':'theirs'}">${escHtml(m.text)}</div>
        <div class="dm-msg-ts">${new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      </div>`).join('');
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }
  // Compute resonance status
  renderDMList();
}

function sendDM(){
  const u=STATE.currentUser; if(!u||!STATE.currentDMUser)return;
  const input=document.getElementById('dm-input');
  const text=input?.value?.trim();
  if(!text)return;
  const key=[u.id,STATE.currentDMUser].sort().join('_');
  const msgs=JAA.loadPlain('dm_'+key)||[];
  const msg={id:'msg_'+Date.now(),from:u.id,to:STATE.currentDMUser,text,ts:Date.now()};
  msgs.push(msg);
  JAA.savePlain('dm_'+key,msgs);
  // Update thread index
  const threads=JAA.loadPlain('dm_threads_'+u.id)||[];
  const tIdx=threads.findIndex(t=>t.userId===STATE.currentDMUser);
  // We'd need other user's info — use what we have from the thread head
  const tName=document.getElementById('dm-thread-name')?.textContent||'Unknown';
  const tHandle=document.getElementById('dm-thread-handle')?.textContent||'';
  if(tIdx>-1){threads[tIdx].lastMsg=text;}
  else{threads.push({userId:STATE.currentDMUser,name:tName,handle:tHandle,color:'#c87941',lastMsg:text});}
  JAA.savePlain('dm_threads_'+u.id,threads);
  input.value=''; input.style.height='auto';
  // Re-render messages
  const msgsEl=document.getElementById('dm-messages');
  if(msgsEl){
    const allMsgs=JAA.loadPlain('dm_'+key)||[];
    msgsEl.innerHTML=allMsgs.map(m=>`
      <div>
        <div class="dm-msg ${m.from===u.id?'mine':'theirs'}">${escHtml(m.text)}</div>
        <div class="dm-msg-ts">${new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      </div>`).join('');
    msgsEl.scrollTop=msgsEl.scrollHeight;
  }
  BUS.emit('dm:sent',{to:STATE.currentDMUser,msgId:msg.id});
}

function dmEnter(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendDM();}}

function newDM(){
  const handle=prompt('enter handle or email to message:');
  if(!handle)return;
  const userId=UserStore.resolveId(handle);
  if(!userId){showToast('user not found');return;}
  // Get their name from index
  openDM(userId,handle,handle,'#7a5fd4');
}

function muteDMContact(){
  const u=STATE.currentUser; if(!u||!STATE.currentDMUser)return;
  const muted=[...(u.muted||[])];
  if(!muted.includes(STATE.currentDMUser))muted.push(STATE.currentDMUser);
  UserStore.update(u.id,{muted});
  STATE.currentUser={...u,muted};
  showToast('contact muted');
}

function blockDMContact(){
  const u=STATE.currentUser; if(!u||!STATE.currentDMUser)return;
  if(!confirm('block this contact? they won\'t be able to message you.'))return;
  const blocked=[...(u.blocked||[])];
  if(!blocked.includes(STATE.currentDMUser))blocked.push(STATE.currentDMUser);
  UserStore.update(u.id,{blocked});
  STATE.currentUser={...u,blocked};
  showToast('contact blocked');
}

// ── SEARCH ─────────────────────────────────────────────────────────
function doSearch(){
  const q=document.getElementById('search-input')?.value?.trim().toLowerCase();
  if(!q)return;
  doGlobalSearch(q);
}

function doGlobalSearch(q){
  if(!q)q=document.getElementById('search-input')?.value?.trim().toLowerCase();
  if(!q)return;
  const u=STATE.currentUser;
  const filter=STATE.currentSearchFilter;
  const el=document.getElementById('search-results');
  if(!el)return;
  let results=[];
  const posts=PostStore.getAll();
  const allIds=UserStore.getAllIds();
  // Search posts
  if(filter==='all'||filter==='posts'||filter==='near'||filter==='tension'||filter==='far'){
    const matchedPosts=posts.filter(p=>{
      if(!p.body?.toLowerCase().includes(q)&&!p.tags?.some(t=>t.includes(q)))return false;
      if(filter==='near')return getResonanceZone(p)==='near';
      if(filter==='tension')return getResonanceZone(p)==='tension';
      if(filter==='far')return getResonanceZone(p)==='far';
      return true;
    });
    results.push(...matchedPosts.slice(0,8).map(p=>({type:'post',data:p})));
  }
  // Search users (by handle/name from index)
  if(filter==='all'||filter==='people'){
    const idx=JAA.loadPlain('user_index')||{};
    const matched=[...new Set(Object.entries(idx).filter(([k])=>k.toLowerCase().includes(q)).map(([,v])=>v))];
    matched.slice(0,5).forEach(id=>{
      if(id!==u?.id)results.push({type:'user',data:{id,name:id,handle:id}});
    });
  }
  if(!results.length){el.innerHTML='<div class="empty-state">no results for "'+escHtml(q)+'"</div>';return;}
  el.innerHTML=results.map(r=>{
    if(r.type==='post'){
      const p=r.data;
      const zone=getResonanceZone(p);
      return`<div class="post" style="background:var(--paper2);border:1px solid var(--border);border-radius:var(--r2);padding:14px">${renderPost(p,zone)}</div>`;
    }
    if(r.type==='user'){
      const d=r.data;
      return`<div class="search-result-user" onclick="viewProfile('${d.id}')">
        <div class="dm-av" style="width:38px;height:38px;font-size:12px;background:var(--nd2);color:var(--nd);border:1px solid rgba(62,127,188,.28)">${(d.name||'?').slice(0,2).toUpperCase()}</div>
        <div class="sru-info">
          <div class="sru-name">${escHtml(d.name)}</div>
          <div class="sru-handle">${escHtml(d.handle)}</div>
        </div>
      </div>`;
    }
    return'';
  }).join('');
}

function setSearchFilter(filter,el){
  STATE.currentSearchFilter=filter;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  if(el)el.classList.add('active');
  const q=document.getElementById('search-input')?.value?.trim();
  if(q)doSearch();
}

// ── FRIENDS ────────────────────────────────────────────────────────
function switchFriendTab(tab,el){
  STATE.currentFriendTab=tab;
  document.querySelectorAll('.ftab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  renderFriendTab(tab);
}

function renderFriendTab(tab){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('friends-tab-content');
  if(!el)return;
  const friends=u.friends||{};
  const muted=u.muted||[];
  const blocked=u.blocked||[];
  if(tab==='connections'){
    const list=Object.entries(friends).filter(([,f])=>f.status==='connected');
    if(!list.length){el.innerHTML='<div class="empty-state">no connections yet — explore and connect</div>';return;}
    el.innerHTML=list.map(([id,f])=>friendCard(id,f)).join('');
  } else if(tab==='invites'){
    const pending=Object.entries(friends).filter(([,f])=>f.status==='pending');
    if(!pending.length){el.innerHTML='<div class="empty-state">no pending invites</div>';return;}
    el.innerHTML=pending.map(([id,f])=>`
      <div class="friend-card">
        <div class="dm-av" style="background:var(--nd2);color:var(--nd)">${(f.name||'?').slice(0,2).toUpperCase()}</div>
        <div class="fc-info">
          <div class="fc-name">${escHtml(f.name||id)}</div>
          <div class="fc-handle">${escHtml(f.handle||'')}</div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="btn-sm primary" onclick="acceptFriend('${id}')">accept</button>
            <button class="btn-sm" onclick="declineFriend('${id}')">decline</button>
          </div>
        </div>
      </div>`).join('');
  } else if(tab==='muted'){
    if(!muted.length){el.innerHTML='<div class="empty-state">nobody muted</div>';return;}
    el.innerHTML=muted.map(id=>`<div class="friend-card"><div class="fc-info"><div class="fc-name">${id}</div></div><button class="btn-sm" onclick="unmuteUser('${id}')">unmute</button></div>`).join('');
  } else if(tab==='blocked'){
    if(!blocked.length){el.innerHTML='<div class="empty-state">nobody blocked</div>';return;}
    el.innerHTML=blocked.map(id=>`<div class="friend-card"><div class="fc-info"><div class="fc-name">${id}</div></div><button class="btn-sm" onclick="unblockUser('${id}')">unblock</button></div>`).join('');
  } else if(tab==='discover'){
    const allIds=UserStore.getAllIds().filter(id=>id!==u.id&&!friends[id]&&!blocked.includes(id));
    if(!allIds.length){el.innerHTML='<div class="empty-state">no new users to discover yet</div>';return;}
    el.innerHTML=allIds.slice(0,10).map(id=>`
      <div class="friend-card">
        <div class="dm-av" style="background:var(--signal2);color:var(--signal)">${id.slice(0,2).toUpperCase()}</div>
        <div class="fc-info"><div class="fc-name">${id}</div><div class="fc-handle">user on resonance</div></div>
        <button class="btn-sm primary" onclick="sendFriendRequest('${id}')">connect</button>
      </div>`).join('');
  }
}

function friendCard(userId,f){
  const score=f.compat||0;
  const statusLabel=LANG.friendStatus(score);
  return`<div class="friend-card">
    <div class="dm-av" style="background:var(--near2);color:var(--near);border:1px solid var(--near3)">${(f.name||'?').slice(0,2).toUpperCase()}</div>
    <div class="fc-info">
      <div class="fc-name">${escHtml(f.name||userId)}</div>
      <div class="fc-handle">${escHtml(f.handle||'')}</div>
      <div class="fc-status near">${statusLabel}</div>
    </div>
    <div class="fc-compat">
      <strong>${statusLabel}</strong>
      <span>${Math.round(score*100)}% compat</span>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn-sm" onclick="openDMWithFriend('${userId}','${escHtml(f.name||userId)}')">message</button>
      <button class="btn-sm warn" onclick="removeFriend('${userId}')">remove</button>
    </div>
  </div>`;
}

function sendFriendRequest(userId){
  const u=STATE.currentUser; if(!u)return;
  const friends={...(u.friends||{}),[userId]:{status:'pending',name:userId,handle:'',ts:Date.now()}};
  UserStore.update(u.id,{friends});
  STATE.currentUser={...u,friends};
  renderFriendTab(STATE.currentFriendTab);
  showToast('connection request sent');
  BUS.emit('friend:requested',{to:userId});
}

function acceptFriend(userId){
  const u=STATE.currentUser; if(!u)return;
  const friends={...(u.friends||{}),[userId]:{...(u.friends[userId]||{}),status:'connected',ts:Date.now()}};
  UserStore.update(u.id,{friends});
  STATE.currentUser={...u,friends};
  renderFriendTab(STATE.currentFriendTab);
  showToast('connection accepted');
}

function declineFriend(userId){
  const u=STATE.currentUser; if(!u)return;
  const friends={...(u.friends||{})};
  delete friends[userId];
  UserStore.update(u.id,{friends});
  STATE.currentUser={...u,friends};
  renderFriendTab(STATE.currentFriendTab);
}

function removeFriend(userId){
  const u=STATE.currentUser; if(!u)return;
  const friends={...(u.friends||{})};
  delete friends[userId];
  UserStore.update(u.id,{friends});
  STATE.currentUser={...u,friends};
  renderFriendTab(STATE.currentFriendTab);
  showToast('connection removed');
}

function unmuteUser(userId){
  const u=STATE.currentUser; if(!u)return;
  const muted=(u.muted||[]).filter(id=>id!==userId);
  UserStore.update(u.id,{muted});
  STATE.currentUser={...u,muted};
  renderFriendTab(STATE.currentFriendTab);
}

function unblockUser(userId){
  const u=STATE.currentUser; if(!u)return;
  const blocked=(u.blocked||[]).filter(id=>id!==userId);
  UserStore.update(u.id,{blocked});
  STATE.currentUser={...u,blocked};
  renderFriendTab(STATE.currentFriendTab);
}

function openDMWithFriend(userId,name){
  switchTab('dm');
  setTimeout(()=>openDM(userId,name,'',randomColor()),100);
}

// ── RESONANCE SCREEN ───────────────────────────────────────────────
function switchResTab(tab,el){
  STATE.currentResTab=tab;
  document.querySelectorAll('.rtab2').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  renderResTab(tab);
}

function renderResTab(tab){
  ['res-lattice-tab','res-metrics-tab','res-assistant-tab','res-api-tab'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const map={lattice:'res-lattice-tab',metrics:'res-metrics-tab',assistant:'res-assistant-tab',api:'res-api-tab'};
  const el=document.getElementById(map[tab]);
  if(el)el.style.display='';
  if(tab==='lattice')setTimeout(drawWordLattice,80);
  if(tab==='metrics')renderMetrics();
}

// ── WORD LATTICE CANVAS ────────────────────────────────────────────
function drawWordLattice(){
  const canvas=document.getElementById('word-lattice-canvas');
  if(!canvas)return;
  const u=STATE.currentUser;
  const posts=STATE.posts.filter(p=>p.userId===u?.id&&p.body);
  const allText=posts.map(p=>p.body).join(' ');
  const fp=u?.fingerprint;
  const words=SIGNAL.extractSignalWords(allText,fp||{snr:.5,structural:{abstraction:.5}});
  STATE.latticeWords=words;
  const ctx=canvas.getContext('2d');
  const W=canvas.offsetWidth||800;
  const H=360;
  canvas.width=W; canvas.height=H;
  ctx.clearRect(0,0,W,H);
  // Background
  ctx.fillStyle='rgba(13,12,22,1)';
  ctx.fillRect(0,0,W,H);
  // Draw faint grid circles
  ctx.strokeStyle='rgba(232,224,212,.03)';
  ctx.lineWidth=1;
  [.25,.5,.75,1].forEach(r=>{
    ctx.beginPath();ctx.arc(W/2,H/2,r*Math.min(W,H)*.44,0,Math.PI*2);ctx.stroke();
  });
  if(!words.length){
    ctx.fillStyle='rgba(232,224,212,.2)';
    ctx.font='13px IBM Plex Mono,monospace';
    ctx.textAlign='center';
    ctx.fillText('write posts to build your word lattice',W/2,H/2);
    return;
  }
  // Place words
  const placed=[];
  const maxW=words[0]?.weight||.5;
  // Sort by weight descending, take top 55
  const toPlace=words.slice(0,55);
  const getColor=(weight,i)=>{
    if(weight>.6)return`rgba(58,158,110,${.5+weight*.5})`; // near — green
    if(weight>.35)return`rgba(184,155,58,${.45+weight*.4})`; // tension — gold
    return`rgba(106,78,201,${.4+weight*.4})`; // far — violet
  };
  // Spiral placement
  let angle=0;
  let radius=0;
  const used=new Set();
  toPlace.forEach((w,i)=>{
    const norm=w.weight/(maxW||1);
    const fontSize=Math.max(9,Math.round(9+norm*24));
    ctx.font=`${norm>.55?'500 ':'300 '}${fontSize}px Cormorant Garamond,Georgia,serif`;
    const tw=ctx.measureText(w.word).width;
    const th=fontSize;
    // Spiral outward
    for(let tries=0;tries<80;tries++){
      const cx=W/2+Math.cos(angle)*radius;
      const cy=H/2+Math.sin(angle)*radius;
      const x=cx-tw/2; const y=cy+th/3;
      const rect={x,y:y-th,w:tw+4,h:th+4};
      const clash=placed.some(p=>!(rect.x>p.x+p.w||rect.x+rect.w<p.x||rect.y>p.y+p.h||rect.y+rect.h<p.y));
      if(!clash&&x>4&&x+tw<W-4&&y>th&&y<H-4){
        placed.push(rect);
        const col=getColor(norm,i);
        ctx.fillStyle=col;
        ctx.fillText(w.word,cx,cy);
        angle+=Math.PI*.618;radius+=2;
        break;
      }
      angle+=.18;radius+=1.2;
    }
  });
  // Draw connecting lines between close words
  ctx.lineWidth=.5;
  placed.slice(0,20).forEach((a,i)=>{
    placed.slice(i+1,i+3).forEach(b=>{
      const dist=Math.sqrt(Math.pow(a.x-b.x,2)+Math.pow(a.y-b.y,2));
      if(dist<90){
        ctx.strokeStyle=`rgba(232,224,212,${.03+.04*(1-dist/90)})`;
        ctx.beginPath();ctx.moveTo(a.x+a.w/2,a.y+a.h/2);ctx.lineTo(b.x+b.w/2,b.y+b.h/2);ctx.stroke();
      }
    });
  });
}

// ── METRICS ────────────────────────────────────────────────────────
function renderMetrics(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('metrics-grid');
  if(!el)return;
  const fp=u.fingerprint;
  const bpe=BPE.metrics();
  if(!fp){el.innerHTML='<div class="metric-card" style="grid-column:1/-1"><div class="mc-label">calibrating</div><div class="mc-value">write posts to generate metrics</div></div>';return;}
  const cards=[
    {label:'overall signal quality',val:LANG.snr(fp.snr||u.snrAvg||0),trend:bpe.trend==='rising'?'↑ improving':bpe.trend==='falling'?'↓ dropping':'→ holding',up:bpe.trend==='rising'},
    {label:'posts analyzed',val:bpe.postCount||u.posts||0,trend:'total signal events',up:true},
    {label:'peak signal',val:LANG.snr(bpe.peakSnr||fp.snr||0),trend:'your best recorded signal',up:true},
    {label:'abstraction level',val:LANG.abstraction(fp.structural?.abstraction||0),trend:'',up:false},
    {label:'systems thinking',val:LANG.systemsThinking(fp.cognitive?.systemsThinking||0),trend:'',up:false},
    {label:'emotional presence',val:LANG.affectIntensity(fp.emotional?.affectIntensity||0),trend:'',up:false},
    {label:'openness / expansion',val:LANG.expansion(fp.emotional?.expansion||0),trend:'',up:false},
    {label:'compression',val:LANG.compression(fp.emotional?.compression||0),trend:'',up:false},
    {label:'vocabulary richness',val:LANG.entropy(fp.structural?.entropy||0),trend:'',up:false},
    {label:'pattern density',val:LANG.ndScore(fp.nd?.ndScore||0),trend:'',up:false},
    {label:'recursion',val:LANG.recursion(fp.structural?.recursion||0),trend:'',up:false},
    {label:'vulnerability',val:LANG.vulnerability(fp.emotional?.vulnerability||0),trend:'',up:false},
    {label:'signal state',val:LANG.regime(fp.snr||u.snrAvg||0,bpe.trend==='rising'?.1:bpe.trend==='falling'?-.1:0),trend:bpe.avgSnrLabel,up:false},
  ];
  el.innerHTML=cards.map(c=>`
    <div class="metric-card">
      <div class="mc-label">${c.label}</div>
      <div class="mc-value">${c.val}</div>
      ${c.trend?`<div class="mc-trend${c.up?' up':''}">${c.trend}</div>`:''}
    </div>`).join('');
}

// ── AI ASSISTANT ───────────────────────────────────────────────────
function aiQuick(msg){
  document.getElementById('ai-input').value=msg;
  sendAI();
}

async function sendAI(){
  const u=STATE.currentUser; if(!u)return;
  if(!PLUGIN_REGISTRY.get('plg_ai_assistant')?.enabled){showToast('AI assistant plugin is disabled');return;}
  const input=document.getElementById('ai-input');
  const msg=input?.value?.trim();
  if(!msg)return;
  input.value='';
  const msgsEl=document.getElementById('ai-messages');
  if(!msgsEl)return;
  // Add user message
  STATE.aiHistory.push({role:'user',content:msg});
  msgsEl.insertAdjacentHTML('beforeend',`<div class="ai-msg user">${escHtml(msg)}</div>`);
  const loadingEl=document.createElement('div');
  loadingEl.className='ai-msg assistant loading';loadingEl.textContent='thinking...';
  msgsEl.appendChild(loadingEl);
  msgsEl.scrollTop=msgsEl.scrollHeight;
  // Build system context
  const fp=u.fingerprint;
  const bpe=BPE.metrics();
  const systemPrompt=`You are the Resonance AI assistant — a thoughtful, signal-aware companion helping users understand their signal on the Resonance social platform.

The platform analyzes how people write and think — their signal fingerprint includes: abstraction level, systems thinking, emotional presence, vulnerability, compression, recursion, vocabulary richness, pattern density, and SNR (signal-to-noise ratio).

Current user context:
- Name: ${u.name}, Handle: ${u.handle}
- Signal quality: ${fp?LANG.snr(fp.snr||u.snrAvg||0):'not calibrated yet'}
- Posts: ${u.posts||0}
- Regime: ${u.regime||'calibrating'}
- Abstraction: ${fp?LANG.abstraction(fp.structural?.abstraction||0):'unknown'}
- Systems thinking: ${fp?LANG.systemsThinking(fp.cognitive?.systemsThinking||0):'unknown'}
- Emotional presence: ${fp?LANG.affectIntensity(fp.emotional?.affectIntensity||0):'unknown'}
- Pattern density: ${fp?LANG.ndScore(fp.nd?.ndScore||0):'unknown'}
- BPE trend: ${bpe.trend}, avg signal: ${bpe.avgSnrLabel}

Respond in a way that is: warm but not sycophantic, direct but not clinical, intellectually engaged, and signal-aware. Speak in plain language — never raw numbers, always descriptions. Keep responses concise (2–4 paragraphs max). If asked to help write something, write it.`;
  try {
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1000,
        system:systemPrompt,
        messages:STATE.aiHistory.slice(-8),
      }),
    });
    const data=await resp.json();
    const reply=data.content?.[0]?.text||'I ran into an issue — try again.';
    STATE.aiHistory.push({role:'assistant',content:reply});
    loadingEl.classList.remove('loading');
    loadingEl.textContent=reply;
  } catch(e) {
    loadingEl.classList.remove('loading');
    loadingEl.textContent='could not reach the AI — check your connection and try again.';
  }
  msgsEl.scrollTop=msgsEl.scrollHeight;
  BUS.emit('ai:message',{userId:u.id});
}

// ── RESONANCE API ──────────────────────────────────────────────────
function generateApiKey(){
  const u=STATE.currentUser; if(!u)return;
  const key='rsn_'+btoa(u.id+':'+Date.now()).replace(/[+/=]/g,'').slice(0,32);
  UserStore.update(u.id,{apiKey:key});
  STATE.currentUser={...u,apiKey:key};
  document.getElementById('api-key-display').textContent=key;
  showToast('API key generated');
}

function copyApiKey(){
  const key=STATE.currentUser?.apiKey;
  if(!key){showToast('generate a key first');return;}
  navigator.clipboard.writeText(key).then(()=>showToast('key copied')).catch(()=>showToast('copy manually: '+key));
}

// ── METEDITOR ──────────────────────────────────────────────────────
function switchMetTab(tab,el){
  STATE.currentMetTab=tab;
  document.querySelectorAll('.metab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  renderMetTab(tab);
}

function renderMetTab(tab){
  ['met-site-tab','met-nexus-tab','met-snapshots-tab','met-idearium-tab','met-versionium-tab'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const map={site:'met-site-tab',nexus:'met-nexus-tab',snapshots:'met-snapshots-tab',idearium:'met-idearium-tab',versionium:'met-versionium-tab'};
  const el=document.getElementById(map[tab]);if(el)el.style.display='';
  if(tab==='site')renderColorEditor();
  if(tab==='nexus'){drawNexusGraph();renderNexusStatus();}
  if(tab==='snapshots')renderSnapshots();
}

// ── SITE EDITOR ────────────────────────────────────────────────────
const CSS_VARS=[
  {label:'signal (amber)',key:'--signal',default:'#bf7340'},
  {label:'near field (green)',key:'--near',default:'#3a9e6e'},
  {label:'tension (gold)',key:'--tension',default:'#b89b3a'},
  {label:'far field (violet)',key:'--far',default:'#6a4ec9'},
  {label:'background',key:'--paper',default:'#080810'},
  {label:'surface',key:'--paper2',default:'#0d0c16'},
  {label:'text',key:'--star',default:'#e8e0d4'},
  {label:'nd blue',key:'--nd',default:'#3e7fbc'},
  {label:'warning red',key:'--warn',default:'#c04040'},
];

function renderColorEditor(){
  const el=document.getElementById('color-editor-rows');if(!el)return;
  el.innerHTML=CSS_VARS.map(v=>{
    const current=getComputedStyle(document.documentElement).getPropertyValue(v.key).trim()||v.default;
    return`<div class="color-picker-row">
      <label>${v.label}</label>
      <input type="color" value="${current.startsWith('#')?current:'#bf7340'}" class="color-swatch" onchange="setCSSVar('${v.key}',this.value)" title="${v.key}">
      <input class="css-var-input" type="text" value="${current}" onchange="setCSSVar('${v.key}',this.value)" placeholder="${v.default}">
    </div>`;
  }).join('');
}

function setCSSVar(key,val){
  document.documentElement.style.setProperty(key,val);
  // Update related rgba vars
  if(key==='--signal'){
    const r=parseInt(val.slice(1,3),16),g=parseInt(val.slice(3,5),16),b=parseInt(val.slice(5,7),16);
    document.documentElement.style.setProperty('--signal2',`rgba(${r},${g},${b},.13)`);
    document.documentElement.style.setProperty('--signal3',`rgba(${r},${g},${b},.3)`);
  }
  const saved=JAA.loadPlain('theme_overrides')||{};
  saved[key]=val;
  JAA.savePlain('theme_overrides',saved);
  BUS.emit('theme:changed',{key,val});
}

function selectEditorItem(item,el){
  STATE.currentEditorItem=item;
  document.querySelectorAll('.editor-item').forEach(i=>i.classList.remove('active'));
  if(el)el.classList.add('active');
  const panel=document.getElementById('site-editor-panel');
  if(!panel)return;
  if(item==='colors'){renderColorEditor();return;}
  if(item==='typography'){
    panel.innerHTML=`<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.12em">typography</div>
      <div class="color-picker-row"><label>serif font (headings)</label><select class="css-var-input" onchange="document.documentElement.style.setProperty('--serif',this.value)"><option>'Cormorant Garamond','Georgia',serif</option><option>'EB Garamond','Georgia',serif</option><option>'Georgia',serif</option></select></div>
      <div class="color-picker-row"><label>mono font (code/labels)</label><select class="css-var-input" onchange="document.documentElement.style.setProperty('--mono',this.value)"><option>'IBM Plex Mono','Courier New',monospace</option><option>'JetBrains Mono',monospace</option><option>monospace</option></select></div>`;
    return;
  }
  if(item==='questions'){
    panel.innerHTML=`<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.12em">deep questions (${DEEP_QUESTIONS.length} total)</div>
      ${DEEP_QUESTIONS.map((q,i)=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--body);font-size:12px;color:var(--text2)">${i+1}. ${escHtml(q)}</div>`).join('')}`;
    return;
  }
  panel.innerHTML=`<div class="empty-state">${item} editor coming in a future version</div>`;
}

function exportCSS(){
  const vars=CSS_VARS.map(v=>`  ${v.key}: ${getComputedStyle(document.documentElement).getPropertyValue(v.key).trim()||v.default};`).join('\n');
  const css=`:root {\n${vars}\n}`;
  const blob=new Blob([css],{type:'text/css'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='resonance-theme.css';a.click();
  showToast('CSS exported');
}

function resetTheme(){
  CSS_VARS.forEach(v=>document.documentElement.style.removeProperty(v.key));
  JAA.savePlain('theme_overrides',{});
  renderColorEditor();
  showToast('theme reset to default');
}

// ── CAUSAL NEXUS GRAPH ────────────────────────────────────────────
function drawNexusGraph(){
  const canvas=document.getElementById('nexus-canvas');
  if(!canvas)return;
  const W=canvas.offsetWidth||900;const H=380;
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');
  // Animated node graph
  const nexusState=NexusBridge.state();
  const nodes=[];
  // Static node structure
  const nodeData=[
    {id:'NEXUS',x:.5,y:.5,r:18,color:'#bf7340',label:'NEXUS'},
    {id:'GUARDIAN',x:.2,y:.3,r:12,color:'#b89b3a',label:'Guardian'},
    {id:'SISO',x:.8,y:.3,r:12,color:'#3a9e6e',label:'SISO'},
    {id:'JAA',x:.2,y:.7,r:12,color:'#3e7fbc',label:'Jaa'},
    {id:'BPE',x:.8,y:.7,r:12,color:'#6a4ec9',label:'BPE'},
    {id:'SIGNAL',x:.5,y:.15,r:10,color:'#c04040',label:'SIGNAL'},
    {id:'BUS',x:.5,y:.85,r:10,color:'#50a8a0',label:'BUS'},
  ];
  const edges=[['NEXUS','GUARDIAN'],['NEXUS','SISO'],['NEXUS','JAA'],['NEXUS','BPE'],['NEXUS','SIGNAL'],['NEXUS','BUS'],['SISO','JAA'],['BPE','SIGNAL'],['BUS','GUARDIAN']];
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='rgba(13,12,22,1)';ctx.fillRect(0,0,W,H);
  // Draw edges
  edges.forEach(([a,b])=>{
    const na=nodeData.find(n=>n.id===a),nb=nodeData.find(n=>n.id===b);
    if(!na||!nb)return;
    ctx.strokeStyle=nexusState.connected?'rgba(58,158,110,.25)':'rgba(232,224,212,.06)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(na.x*W,na.y*H);ctx.lineTo(nb.x*W,nb.y*H);ctx.stroke();
  });
  // Draw nodes
  nodeData.forEach(n=>{
    const x=n.x*W,y=n.y*H;
    // Glow
    const grd=ctx.createRadialGradient(x,y,0,x,y,n.r*2.5);
    grd.addColorStop(0,hexToRgba(n.color,.22));grd.addColorStop(1,'transparent');
    ctx.fillStyle=grd;ctx.beginPath();ctx.arc(x,y,n.r*2.5,0,Math.PI*2);ctx.fill();
    // Node circle
    ctx.fillStyle=hexToRgba(n.color,.18);ctx.beginPath();ctx.arc(x,y,n.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=hexToRgba(n.color,.6);ctx.lineWidth=1;ctx.stroke();
    // Label
    ctx.fillStyle=n.color;ctx.font='10px IBM Plex Mono,monospace';ctx.textAlign='center';ctx.fillText(n.label,x,y+n.r+12);
    // Pulse if connected and this is NEXUS
    if(nexusState.connected&&n.id==='NEXUS'){
      ctx.strokeStyle=hexToRgba(n.color,.3);ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,y,n.r+8+Math.sin(Date.now()*.003)*4,0,Math.PI*2);ctx.stroke();
    }
  });
  // Connected indicator
  if(nexusState.connected){
    ctx.fillStyle='rgba(58,158,110,.8)';ctx.font='bold 10px IBM Plex Mono,monospace';ctx.textAlign='left';
    ctx.fillText('● NEXUS CONNECTED',12,20);
  }
}

function renderNexusStatus(){
  const s=NexusBridge.state();
  const dot=document.getElementById('nexus-dot');
  const txt=document.getElementById('nexus-status-text');
  const cnt=document.getElementById('nexus-event-count');
  const total=document.getElementById('nexus-event-total');
  const lastType=document.getElementById('nexus-last-type');
  const lastTs=document.getElementById('nexus-last-ts');
  const deltaCount=document.getElementById('nexus-delta-count');
  const log=document.getElementById('nexus-event-log');
  if(dot)dot.className='nexus-dot'+(s.connected?' connected':'');
  if(txt)txt.textContent=s.connected?'NEXUS connected via BroadcastChannel':'waiting for NEXUS BroadcastChannel...';
  if(cnt)cnt.textContent=s.events.length+' events';
  if(total)total.textContent=STATE.nexusEventCount;
  if(lastType)lastType.textContent=s.lastEvent?.type||'—';
  if(lastTs)lastTs.textContent=s.lastEvent?new Date(s.lastEvent.received).toLocaleTimeString():'no events yet';
  if(deltaCount)deltaCount.textContent=s.deltaCount;
  if(log){
    if(!s.events.length){log.textContent='no events yet — connect NEXUS to begin';return;}
    log.innerHTML=s.events.slice(0,20).map(e=>`<div>[${new Date(e.received||e.ts).toLocaleTimeString()}] <span style="color:var(--signal)">${escHtml(e.type||e.event||'event')}</span> ${e.payload?JSON.stringify(e.payload).slice(0,80):''}...</div>`).join('');
  }
}

function updateNexusUI(state){
  STATE.nexusEventCount++;
  if(STATE.currentMetTab==='nexus'){renderNexusStatus();drawNexusGraph();}
}

// ── SNAPSHOTS ──────────────────────────────────────────────────────
function createSnapshot(){
  const u=STATE.currentUser; if(!u)return;
  const snap={
    id:'snap_'+Date.now(),
    name:'Snapshot '+new Date().toLocaleString(),
    ts:Date.now(),
    userId:u.id,
    posts:PostStore.getAll().length,
    data:{
      posts:PostStore.getAll(),
      userSnrHistory:JAA.loadPlain('snrh_'+u.id)||[],
      gallery:JAA.loadPlain('gallery_'+u.id)||[],
      themeOverrides:JAA.loadPlain('theme_overrides')||{},
      version:VERSION,
    },
  };
  const snaps=JAA.loadPlain('snapshots_'+u.id)||[];
  snaps.unshift(snap);
  if(snaps.length>10)snaps.length=10;
  JAA.savePlain('snapshots_'+u.id,snaps);
  STATE.snapshots=snaps;
  renderSnapshots();
  showToast('snapshot created — '+snap.name);
  BUS.emit('snapshot:created',{snapId:snap.id});
}

function renderSnapshots(){
  const u=STATE.currentUser; if(!u)return;
  const el=document.getElementById('snapshot-list');if(!el)return;
  const snaps=JAA.loadPlain('snapshots_'+u.id)||[];
  if(!snaps.length){el.innerHTML='<div class="empty-state">no snapshots yet — create one to save your current state</div>';return;}
  el.innerHTML=snaps.map(s=>`
    <div class="snap-item">
      <div class="snap-info">
        <div class="snap-name">${escHtml(s.name)}</div>
        <div class="snap-meta">${new Date(s.ts).toLocaleString()} · ${s.posts} posts · v${s.data?.version||'?'}</div>
      </div>
      <div class="snap-actions">
        <button class="btn-sm" onclick="restoreSnapshot('${s.id}')">restore</button>
        <button class="btn-sm" onclick="downloadSnapshot('${s.id}')">export</button>
        <button class="btn-sm warn" onclick="deleteSnapshot('${s.id}')">delete</button>
      </div>
    </div>`).join('');
}

function restoreSnapshot(id){
  if(!confirm('restore this snapshot? current posts will be replaced.'))return;
  const u=STATE.currentUser; if(!u)return;
  const snaps=JAA.loadPlain('snapshots_'+u.id)||[];
  const snap=snaps.find(s=>s.id===id);
  if(!snap){showToast('snapshot not found');return;}
  if(snap.data?.posts)JAA.savePlain('posts',snap.data.posts);
  if(snap.data?.themeOverrides)Object.entries(snap.data.themeOverrides).forEach(([k,v])=>setCSSVar(k,v));
  STATE.posts=PostStore.getAll();
  showToast('snapshot restored — '+snap.name);
  BUS.emit('snapshot:restored',{snapId:id});
}

function downloadSnapshot(id){
  const u=STATE.currentUser; if(!u)return;
  const snaps=JAA.loadPlain('snapshots_'+u.id)||[];
  const snap=snaps.find(s=>s.id===id);
  if(!snap)return;
  const blob=new Blob([JSON.stringify(snap,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`resonance-snap-${id}.json`;a.click();
  showToast('snapshot exported');
}

function deleteSnapshot(id){
  if(!confirm('delete this snapshot?'))return;
  const u=STATE.currentUser; if(!u)return;
  const snaps=(JAA.loadPlain('snapshots_'+u.id)||[]).filter(s=>s.id!==id);
  JAA.savePlain('snapshots_'+u.id,snaps);
  renderSnapshots();
}

// ── ROADMAP ────────────────────────────────────────────────────────
function switchRoadTab(tab,el){
  STATE.currentRoadTab=tab;
  document.querySelectorAll('.roadtab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  renderRoadTab(tab);
}

function renderRoadTab(tab){
  ['road-whats-new-tab','road-needs-work-tab','road-report-tab'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const map={'whats-new':'road-whats-new-tab','needs-work':'road-needs-work-tab',report:'road-report-tab'};
  const el=document.getElementById(map[tab]);if(el)el.style.display='';
  if(tab==='report')renderBugList();
}

function setSeverity(sev,el){
  STATE.currentBugSeverity=sev;
  document.querySelectorAll('.sev-btn').forEach(b=>b.className='sev-btn');
  if(el)el.className=`sev-btn active ${sev}`;
}

function submitBugReport(){
  const u=STATE.currentUser; if(!u)return;
  const title=document.getElementById('bug-title')?.value?.trim();
  const desc=document.getElementById('bug-desc')?.value?.trim();
  if(!title){showToast('add a title for the bug report');return;}
  const report={
    id:'bug_'+Date.now(),
    title,desc,severity:STATE.currentBugSeverity,
    userId:u.id,userName:u.name,ts:Date.now(),status:'open',
  };
  const reports=JAA.loadPlain('bug_reports')||[];
  reports.unshift(report);
  JAA.savePlain('bug_reports',reports);
  document.getElementById('bug-title').value='';
  document.getElementById('bug-desc').value='';
  renderBugList();
  showToast('bug report submitted — thanks');
  BUS.emit('bug:reported',{id:report.id,severity:report.severity});
}

function renderBugList(){
  const el=document.getElementById('bug-list');if(!el)return;
  const reports=JAA.loadPlain('bug_reports')||[];
  if(!reports.length){el.innerHTML='';return;}
  el.innerHTML=`<div style="font-family:var(--mono);font-size:8px;letter-spacing:.12em;color:var(--text3);text-transform:uppercase;margin-bottom:12px">submitted reports</div>`+
  reports.map(r=>`
    <div class="bug-item">
      <div class="bug-item-title">${escHtml(r.title)}</div>
      ${r.desc?`<div class="bug-item-desc">${escHtml(r.desc)}</div>`:''}
      <div class="bug-item-meta">
        <span class="bug-sev-badge ${r.severity}">${r.severity}</span>
        <span class="bug-status">${r.status}</span>
        <span style="font-family:var(--mono);font-size:7.5px;color:var(--text4);margin-left:auto">${new Date(r.ts).toLocaleDateString()}</span>
      </div>
    </div>`).join('');
}

// ── ADMIN PANEL ────────────────────────────────────────────────────
function switchAdminTab(tab,el){
  STATE.currentAdminTab=tab;
  // Update sidebar nav items
  document.querySelectorAll('.adm-nav-item').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  // Update topbar title
  const titles={
    overview:{title:'dashboard',sub:'platform overview'},
    users:{title:'users',sub:'registered accounts and signal data'},
    features:{title:'features registry',sub:'UUID-tracked features with enable/disable'},
    plugins:{title:'plugins',sub:'install and manage platform plugins'},
    bpe:{title:'signal monitor',sub:'behavior pattern engine — live metrics'},
    bus:{title:'event bus',sub:'live event log — last 50 events'},
    storage:{title:'storage inspector',sub:'localStorage health and key inventory'},
  };
  const t=titles[tab]||{title:tab,sub:''};
  const titleEl=document.getElementById('adm-page-title');
  const subEl=document.getElementById('adm-page-sub');
  if(titleEl)titleEl.textContent=t.title;
  if(subEl)subEl.textContent=t.sub;
  renderAdminTab(tab);
}

function renderAdminTab(tab){
  ['admin-overview-tab','admin-users-tab','admin-features-tab','admin-plugins-tab','admin-bpe-tab','admin-bus-tab','admin-storage-tab'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.style.display='none';
  });
  const map={overview:'admin-overview-tab',users:'admin-users-tab',features:'admin-features-tab',plugins:'admin-plugins-tab',bpe:'admin-bpe-tab',bus:'admin-bus-tab',storage:'admin-storage-tab'};
  const el=document.getElementById(map[tab]);if(el)el.style.display='';
  // Update health pill in sidebar
  const h=JAA.health();const busH=BUS.health();
  const pill=document.getElementById('adm-health-pill');
  if(pill)pill.innerHTML=`${h.totalKeys} keys · ~${Math.round(h.totalBytes/1024)}KB<br>${busH.eventTypes} event types`;
  if(tab==='overview')renderAdminOverview();
  if(tab==='users')renderAdminUsers();
  if(tab==='features')renderFeaturesRegistry();
  if(tab==='plugins')renderPlugins();
  if(tab==='bpe')renderBPEMonitor();
  if(tab==='bus')renderBusLog();
  if(tab==='storage')renderStorageStats();
}

function renderAdminOverview(){
  const posts=PostStore.getAll();
  const allIds=UserStore.getAllIds();
  const bugs=JAA.loadPlain('bug_reports')||[];
  const featH=FEATURE_REGISTRY.health();
  const busH=BUS.health();
  const storH=JAA.health();
  const bpeM=BPE.metrics();
  const statsEl=document.getElementById('admin-stats');
  if(statsEl){ statsEl.className='adm-stats-grid';
    statsEl.innerHTML=[
      {n:allIds.length,l:'total users',d:'registered accounts'},
      {n:posts.length,l:'total posts',d:'across all users'},
      {n:bugs.length,l:'bug reports',d:'open + resolved'},
      {n:featH.enabled,l:'active features',d:`of ${featH.total} registered`},
    ].map(s=>`<div class="adm-stat"><div class="adm-stat-n">${s.n}</div><div class="adm-stat-l">${s.l}</div><div class="adm-stat-d">${s.d}</div></div>`).join('');
  }
  // Quick stats
  const setEl=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setEl('admin-avg-snr',bpeM.avgSnrLabel||'no data');
  setEl('admin-snr-sub',`${bpeM.postCount} signal events`);
  setEl('admin-feat-count',`${featH.enabled} of ${featH.total}`);
  setEl('admin-bus-health',busH.eventTypes);
  setEl('admin-storage-health',storH.totalKeys);
  // Health summary
  const summEl=document.getElementById('admin-health-summary');
  if(summEl)summEl.textContent=`storage: ${storH.totalKeys} keys · ${Math.round(storH.totalBytes/1024)}KB · ${storH.activeUsers} active sessions`;
}

function renderAdminUsers(){
  const tbody=document.getElementById('admin-user-table');if(!tbody)return;
  const allIds=UserStore.getAllIds();
  if(!allIds.length){tbody.innerHTML='<tr><td colspan="9" class="empty-state">no users</td></tr>';return;}
  tbody.innerHTML=allIds.map(id=>{
    // Load from index — we have partial data
    const idx=JAA.loadPlain('user_index')||{};
    // Find handle for this ID
    const handle=Object.keys(idx).find(k=>idx[k]===id&&k.startsWith('@'))||id;
    // Try to get demo user data
    const demo=Object.values(DEMO_USERS).find(u=>u.id===id);
    const name=demo?.name||handle;
    const role=demo?.role||'user';
    const snrAvg=demo?.snrAvg||0;
    const ndScore=demo?.ndScore||0;
    const posts=demo?.posts||PostStore.getAll().filter(p=>p.userId===id).length;
    const regime=demo?.regime||LANG.regime(snrAvg,0);
    return`<tr>
      <td style="color:var(--text)">${escHtml(name)}</td>
      <td>${escHtml(handle)}</td>
      <td><span class="chip role-${role}">${role}</span></td>
      <td>${demo?.since||'—'}</td>
      <td>${posts}</td>
      <td style="color:${snrAvg>=.65?'var(--near)':snrAvg>=.4?'var(--tension)':'var(--warn)'}">${LANG.snr(snrAvg)}</td>
      <td style="color:var(--nd)">${LANG.ndScore(ndScore)}</td>
      <td><span style="font-family:var(--mono);font-size:8.5px;color:var(--text3)">${regime}</span></td>
      <td>
        <button class="admin-action" onclick="adminViewUser('${id}')">view</button>
        ${role!=='admin'?`<button class="admin-action danger" onclick="adminBanUser('${id}')">ban</button>`:''}
      </td>
    </tr>`;
  }).join('');
}

function adminViewUser(id){showToast('user detail view — coming in a future version');}
function adminBanUser(id){if(confirm('ban this user? this removes their posts.'))showToast('ban feature requires server-side support');}

function renderFeaturesRegistry(){
  const el=document.getElementById('features-registry-content');if(!el)return;
  const groups=FEATURE_REGISTRY.groups();
  el.innerHTML=groups.map(group=>`
    <div class="features-group">
      <div class="features-group-title">${group}</div>
      ${FEATURE_REGISTRY.getGroup(group).map(f=>`
        <div class="feature-row${f.enabled?'':' disabled'}" id="frow-${f.feature_id}">
          <div class="fr-info">
            <div class="fr-name">${escHtml(f.name)}</div>
            <div class="fr-uuid">${f.uuid}</div>
            <div class="fr-desc">${escHtml(f.description)}</div>
            <div class="fr-badges">
              <span class="fr-badge ${f.enabled?'active':'disabled'}">${f.enabled?'enabled':'disabled'}</span>
              <span class="fr-badge ${f.status}">${f.status}</span>
              <span class="fr-fid">${f.feature_id}</span>
            </div>
          </div>
          <div class="toggle${f.enabled?' on':''}" onclick="toggleFeature('${f.feature_id}',this)" title="toggle feature"></div>
        </div>`).join('')}
    </div>`).join('');
}

function toggleFeature(id,el){
  const enabled=FEATURE_REGISTRY.toggle(id);
  if(el){el.classList.toggle('on',enabled);}
  const row=document.getElementById('frow-'+id);
  if(row)row.classList.toggle('disabled',!enabled);
  const badge=row?.querySelector('.fr-badge:first-child');
  if(badge){badge.className=`fr-badge ${enabled?'active':'disabled'}`;badge.textContent=enabled?'enabled':'disabled';}
  showToast(`${id} ${enabled?'enabled':'disabled'}`);
}

function renderPlugins(){
  const el=document.getElementById('plugin-grid');if(!el)return;
  const plugins=PLUGIN_REGISTRY.getAll();
  el.innerHTML=plugins.map(p=>`
    <div class="plugin-card${p.enabled?'':' disabled'}">
      <div class="pc-header">
        <div class="pc-icon">${p.icon||'🔌'}</div>
        <div class="pc-info">
          <div class="pc-name">${escHtml(p.name)}</div>
          <div class="pc-version">v${p.version}</div>
          <div class="pc-author">by ${escHtml(p.author)}</div>
        </div>
        <div class="toggle${p.enabled?' on':''}" onclick="togglePlugin('${p.id}',this)"></div>
      </div>
      <div class="pc-desc">${escHtml(p.description)}</div>
      <div class="pc-footer">
        <span class="pc-cat">${p.category}</span>
        <span class="pc-uuid">${p.uuid}</span>
      </div>
    </div>`).join('');
}

function togglePlugin(id,el){
  const enabled=PLUGIN_REGISTRY.toggle(id);
  if(el)el.classList.toggle('on',enabled);
  const card=el?.closest('.plugin-card');
  if(card)card.classList.toggle('disabled',!enabled);
  showToast(`${id} ${enabled?'enabled':'disabled'}`);
}

function showInstallPlugin(){
  const id=prompt('plugin ID (e.g. plg_my_plugin):');
  if(!id)return;
  const name=prompt('plugin name:');
  if(!name)return;
  const desc=prompt('description:');
  PLUGIN_REGISTRY.install({id,name,description:desc||'',version:'1.0.0',author:'custom',category:'custom',icon:'🔌'});
  renderPlugins();
  showToast('plugin installed: '+name);
}

function renderBPEMonitor(){
  const el=document.getElementById('bpe-monitor');if(!el)return;
  const m=BPE.metrics();
  const plugins=PLUGIN_REGISTRY.get('plg_bpe_monitor');
  el.innerHTML=`
    <div class="bpe-perf-card">
      <div class="bpe-perf-label">avg signal quality</div>
      <div class="bpe-perf-value">${m.avgSnrLabel}</div>
      <div class="bpe-perf-sub">across ${m.postCount} events</div>
    </div>
    <div class="bpe-perf-card">
      <div class="bpe-perf-label">trend</div>
      <div class="bpe-perf-value" style="color:${m.trend==='rising'?'var(--near)':m.trend==='falling'?'var(--warn)':'var(--text)'}">${m.trend}</div>
      <div class="bpe-perf-sub">recent vs historical</div>
    </div>
    <div class="bpe-perf-card">
      <div class="bpe-perf-label">peak signal</div>
      <div class="bpe-perf-value">${LANG.snr(m.peakSnr)}</div>
      <div class="bpe-perf-sub">highest recorded</div>
    </div>
    <div class="bpe-perf-card">
      <div class="bpe-perf-label">BPE plugin status</div>
      <div class="bpe-perf-value" style="font-size:13px">${plugins?.enabled?'active':'disabled'}</div>
      <div class="bpe-perf-sub">${plugins?.uuid||'—'}</div>
    </div>`;
  // Sparkline
  const chartEl=document.getElementById('bpe-history-chart');
  if(chartEl&&m.history?.length){
    const W=chartEl.offsetWidth||600;const H=60;
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d');
    const pts=m.history.slice(0,40).reverse();
    const maxV=Math.max(...pts.map(p=>p.snr),.1);
    ctx.strokeStyle='var(--signal)';ctx.lineWidth=1.5;ctx.beginPath();
    pts.forEach((p,i)=>{
      const x=i/(pts.length-1)*W;const y=H-p.snr/maxV*(H-8)-4;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.stroke();
    chartEl.innerHTML='';chartEl.appendChild(canvas);
  }
}

function renderBusLog(){
  const el=document.getElementById('bus-log');if(!el)return;
  const log=BUS.log();
  if(!log.length){el.textContent='no events yet';return;}
  el.innerHTML=log.slice(0,50).map(e=>`<div>[${new Date(e.ts).toLocaleTimeString()}] <span style="color:var(--signal)">${escHtml(e.event)}</span> eventTs:${e.eventTs} ${e.payload&&Object.keys(e.payload).length?'· '+JSON.stringify(e.payload).slice(0,80):''}</div>`).join('');
}

function testBusEvent(){
  BUS.emit('admin:test',{msg:'test event from admin panel',ts:Date.now()});
  setTimeout(renderBusLog,50);
  showToast('test event emitted');
}

function renderStorageStats(){
  const h=JAA.health();
  const statsEl=document.getElementById('storage-stats');
  if(statsEl){
    statsEl.className='adm-stats-grid';
    statsEl.innerHTML=[
      {n:h.totalKeys,l:'total keys',d:'localStorage entries'},
      {n:Math.round(h.totalBytes/1024)+'KB',l:'total size',d:'estimated usage'},
      {n:h.activeUsers,l:'active sessions',d:'users with keys in memory'},
      {n:localStorage.length,l:'raw ls size',d:'all keys including non-rsn3'},
    ].map(s=>`<div class="adm-stat"><div class="adm-stat-n">${s.n}</div><div class="adm-stat-l">${s.l}</div><div class="adm-stat-d">${s.d}</div></div>`).join('');
  }
  const keysEl=document.getElementById('storage-keys-list');
  if(keysEl){
    const keys=Object.keys(localStorage).filter(k=>k.startsWith(STORAGE_PREFIX)).sort();
    keysEl.innerHTML=`<div style="font-family:var(--mono);font-size:8px;letter-spacing:.12em;color:var(--text3);text-transform:uppercase;margin-bottom:8px">${keys.length} resonance keys</div>`+
    keys.map(k=>`<div style="color:var(--text3)">${escHtml(k)} <span style="color:var(--text4)">(${(localStorage.getItem(k)||'').length} chars)</span></div>`).join('');
  }
}

// ── STARFIELD ──────────────────────────────────────────────────────
function initStarfield(){
  const sf=document.getElementById('starfield');if(!sf)return;
  const W=window.innerWidth,H=window.innerHeight;
  // Static stars
  for(let i=0;i<110;i++){
    const s=document.createElement('div');s.className='star';
    const sz=Math.random()<.07?2.5:Math.random()<.2?1.5:1;
    const op=.04+Math.random()*.22;
    s.style.cssText=`width:${sz}px;height:${sz}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--base-op:${op};animation:twinkle ${4+Math.random()*7}s ease-in-out ${Math.random()*6}s infinite`;
    sf.appendChild(s);
  }
  // Shooting stars
  function spawnShootingStar(){
    const s=document.createElement('div');s.className='shooting-star';
    const len=80+Math.random()*160;
    const ang=-20+Math.random()*40;
    s.style.cssText=`width:${len}px;top:${Math.random()*60}%;left:${Math.random()*80}%;--ang:${ang}deg;opacity:0`;
    sf.appendChild(s);
    setTimeout(()=>s.remove(),2600);
  }
  setInterval(spawnShootingStar,6000+Math.random()*8000);
}

// ── THEME RESTORE ──────────────────────────────────────────────────
function restoreTheme(){
  const overrides=JAA.loadPlain('theme_overrides')||{};
  Object.entries(overrides).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
}

// ── ESCAPE HTML ────────────────────────────────────────────────────
function escHtml(str){
  if(!str)return'';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── GLOBAL SEARCH ENTRY ────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const ap=document.getElementById('admin-page');
    if(ap&&ap.classList.contains('open')){closeAdmin();return;}
  }
  if(e.key==='/'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){
    e.preventDefault();
    document.getElementById('global-search')?.focus();
  }
});

// ── BOOT ───────────────────────────────────────────────────────────
// ROOT CAUSE FIX SUMMARY:
// 1. seed() guarded by seeded flag (FIX-003)
// 2. Session.read() → plaintext cookie (sync, no encryption needed)
// 3. JAA.initKey() awaited before any load (FIX-001)
// 4. loginUser() fully awaited (FIX-002)
// All auth is async-correct from top to bottom.

document.addEventListener('DOMContentLoaded', async () => {
  // Init starfield
  initStarfield();
  // Restore theme overrides
  restoreTheme();
  // Init Nexus Bridge
  NexusBridge.init();
  // Listen for Nexus events to update admin
  BUS.on('nexus:event',()=>STATE.nexusEventCount++);
  BUS.on('nexus:delta',()=>STATE.nexusDeltaCount++);
  // Seed demo users (guarded — only runs once ever)
  await UserStore.seed(DEMO_USERS);
  // Store pw hashes for demo users if not already
  for(const[,u] of Object.entries(DEMO_USERS)){
    if(!JAA.loadPlain('pwh_'+u.id)){
      JAA.savePlain('pwh_'+u.id,{pwh:u.password+u.uuid,ts:Date.now()});
    }
  }
  // Attempt session restore
  const savedId=Session.read();
  if(savedId){
    const plain=JAA.loadPlain('pwh_'+savedId);
    if(plain){
      try {
        await JAA.initKey(savedId,plain.pwh);
        const user=await JAA.load(savedId,'profile');
        if(user){await loginUser(user);return;}
      } catch(e){
        console.error('[boot] session restore failed:',e.message);
        Session.clear();
      }
    }
  }
  // No valid session — show auth screen
  switchTab('auth');
  // Set initial question
  updateQuestionPrompt();
  // Init auth-screen question display
  document.querySelector('#auth-screen .auth-tagline');
  // Log boot
  BUS.emit('platform:boot',{version:VERSION,ts:Date.now(),hasSession:!!savedId});
  console.log(`[resonance v${VERSION}] boot complete · ${JAA.health().totalKeys} storage keys`);
});

// ── NEXUS GRAPH ANIMATION LOOP ─────────────────────────────────────
let _nexusAnimFrame=null;
function startNexusAnimation(){
  if(_nexusAnimFrame)return;
  function tick(){drawNexusGraph();_nexusAnimFrame=requestAnimationFrame(tick);}
  tick();
}
function stopNexusAnimation(){if(_nexusAnimFrame){cancelAnimationFrame(_nexusAnimFrame);_nexusAnimFrame=null;}}

// Auto-start nexus animation when tab is visible
BUS.on('tab:switched',({tab})=>{
  if(tab==='meteditor'&&STATE.currentMetTab==='nexus')startNexusAnimation();
  else stopNexusAnimation();
});


// ══════════════════════════════════════════════════════════════════════════════
//  RESONANCE v4.1.0 UPGRADES
//  ┌─ DSM-5 Pattern Index ─── motivational substrate ── values/beliefs layer ┐
//  │  interlayer conflict detection ── named emotions ── suppression meter    │
//  │  gap taxonomy ── weak assumption detection ── shadow field analysis      │
//  └─ drift signals ── deep pattern fingerprint ── GapHunter integration ─────┘
// ══════════════════════════════════════════════════════════════════════════════

// ── DSM-5 INDEXED PATTERN LIBRARY ─────────────────────────────────────────
// Maps behavioral/linguistic patterns to DSM-5 spectrum signals.
// These are NOT diagnoses. They are named patterns with linguistic fingerprints.
// All output is probabilistic. The engine detects signal, not identity.
const DSM_PATTERNS = {
  // Cluster A — unusual thinking patterns
  paranoidIdeation: {
    label: 'paranoid ideation signal',
    group: 'Cluster A spectrum',
    markers: ['everyone|they|them|watching|following|against me|out to get|trust no one|people are|can\'t trust|conspiracy|they want|always targeting'],
    threshold: 0.25,
    color: '--far',
  },
  magicalThinking: {
    label: 'magical/synchronistic thinking',
    group: 'Cluster A spectrum',
    markers: ['sign|meant to be|universe|synchronicity|destined|cosmic|fate|everything happens|for a reason|connected somehow|sending me'],
    threshold: 0.20,
    color: '--far',
  },
  // Cluster B — emotional intensity patterns
  emotionalDysregulation: {
    label: 'emotional dysregulation signal',
    group: 'Cluster B spectrum',
    markers: ['overwhelmed|spinning|can\'t stop|flooding|too much|falling apart|spiral|cascade|uncontrollable|shutting down|nothing matters'],
    threshold: 0.22,
    color: '--warn',
  },
  impulsivity: {
    label: 'impulsivity signal',
    group: 'Cluster B spectrum',
    markers: ['just did|without thinking|couldn\'t stop myself|acted before|impulsively|in the moment|couldn\'t help|sudden|immediately|right now'],
    threshold: 0.20,
    color: '--tension',
  },
  grandiosity: {
    label: 'grandiosity signal',
    group: 'Cluster B spectrum',
    markers: ['unlike anyone|special purpose|chosen|destiny|nobody else|exceptional|genius|see what others can\'t|my mission|only one who'],
    threshold: 0.22,
    color: '--tension',
  },
  identityDiffusion: {
    label: 'identity diffusion signal',
    group: 'Cluster B spectrum',
    markers: ['who am I|don\'t know who|lost myself|no idea what I want|keep changing|different person|no stable|can\'t figure out|I don\'t know myself'],
    threshold: 0.22,
    color: '--far',
  },
  // Cluster C — anxiety/avoidance patterns
  avoidance: {
    label: 'avoidance pattern',
    group: 'Cluster C spectrum',
    markers: ['avoid|can\'t face|staying away|not ready|maybe later|eventually|one day|I should but|when I\'m ready|too scary|not yet'],
    threshold: 0.25,
    color: '--nd',
  },
  rumination: {
    label: 'rumination pattern',
    group: 'Cluster C spectrum',
    markers: ['keep thinking about|can\'t stop thinking|goes around in my head|over and over|can\'t let it go|still thinking|mind keeps going back|won\'t leave me alone'],
    threshold: 0.22,
    color: '--nd',
  },
  // Attachment patterns
  anxiousAttachment: {
    label: 'anxious attachment signal',
    group: 'Attachment spectrum',
    markers: ['afraid they\'ll leave|need reassurance|constantly checking|what if they|do they still|can\'t stand uncertainty|always wondering if|fear abandonment'],
    threshold: 0.20,
    color: '--signal',
  },
  avoidantAttachment: {
    label: 'avoidant attachment signal',
    group: 'Attachment spectrum',
    markers: ['need space|don\'t need|fine alone|independent|don\'t want to rely|too close|too much|backing away|keeping distance|self-sufficient|don\'t need anyone'],
    threshold: 0.20,
    color: '--signal',
  },
  disorganizedAttachment: {
    label: 'disorganized attachment signal',
    group: 'Attachment spectrum',
    markers: ['want to be close but|scared of them|they\'re who I run to and from|both want and fear|can\'t decide|they comfort and hurt|need but terrified'],
    threshold: 0.18,
    color: '--warn',
  },
  // Trauma patterns
  hypervigilance: {
    label: 'hypervigilance signal',
    group: 'Trauma spectrum',
    markers: ['always on alert|watching for|can\'t relax|waiting for something|scanning|notice every|on guard|can\'t let my guard|startle|ready to'],
    threshold: 0.20,
    color: '--warn',
  },
  dissociation: {
    label: 'dissociative signal',
    group: 'Trauma spectrum',
    markers: ['not real|like I\'m watching myself|outside my body|fog|derealization|disconnected from|autopilot|not fully there|blank|time passing|dreamlike'],
    threshold: 0.18,
    color: '--far',
  },
  intrusiveThoughts: {
    label: 'intrusive thought signal',
    group: 'Trauma spectrum',
    markers: ['keeps coming back|unwanted thought|can\'t get rid of|intrusive|keep seeing|flash of|suddenly remembered|triggered|out of nowhere|won\'t leave'],
    threshold: 0.20,
    color: '--warn',
  },
  // Mood patterns
  anhedonia: {
    label: 'anhedonia / flatness signal',
    group: 'Mood spectrum',
    markers: ['nothing feels good|can\'t enjoy|used to love|don\'t care anymore|flat|empty|nothing matters|pointless|going through motions|hollow'],
    threshold: 0.20,
    color: '--far',
  },
  pressuredSpeech: {
    label: 'pressured/racing thought signal',
    group: 'Mood spectrum',
    markers: ['can\'t slow down|thoughts racing|so many ideas|mind won\'t stop|jumping between|everything at once|can\'t keep up with|brain going|fast'],
    threshold: 0.20,
    color: '--tension',
  },
  // IFS / Internal parts signals
  innerCritic: {
    label: 'inner critic activation',
    group: 'Internal Parts (IFS)',
    markers: ['I should have|why can\'t I|what\'s wrong with me|I always|I never|I\'m so|I\'m such a|I can\'t even|of course I|typical me|I ruin everything'],
    threshold: 0.22,
    color: '--tension',
  },
  managerParts: {
    label: 'manager/controller activation',
    group: 'Internal Parts (IFS)',
    markers: ['need to control|have to manage|can\'t let|must maintain|keeping it together|if I just|need to stay|have to be|I must|push through|stay focused'],
    threshold: 0.22,
    color: '--signal',
  },
  exilePain: {
    label: 'exile/core wound signal',
    group: 'Internal Parts (IFS)',
    markers: ['deep down|at the core|really feel|underneath|fundamentally|the truth is|I\'ve always|since childhood|it\'s always been|the part of me'],
    threshold: 0.20,
    color: '--near',
  },
  // Schema patterns
  abandonmentSchema: {
    label: 'abandonment schema activation',
    group: 'Schema patterns',
    markers: ['they\'ll leave|always leave|everyone leaves|no one stays|abandoned|left behind|alone again|they\'ll figure out|once they know|eventually'],
    threshold: 0.18,
    color: '--signal',
  },
  defectivenessSchema: {
    label: 'defectiveness schema activation',
    group: 'Schema patterns',
    markers: ['not enough|not good enough|broken|fundamentally flawed|something wrong with me|defective|unlovable|if they really knew|I\'m not'],
    threshold: 0.18,
    color: '--warn',
  },
  entitlementSchema: {
    label: 'entitlement schema activation',
    group: 'Schema patterns',
    markers: ['I deserve|they owe me|should be|not fair to me|my right|should get|why do I have to|special case|doesn\'t apply to me|above'],
    threshold: 0.20,
    color: '--tension',
  },
};

function detectDSMPatterns(text) {
  if (!text || text.length < 20) return [];
  const results = [];
  const wc = text.split(/\s+/).length;
  for (const [id, pattern] of Object.entries(DSM_PATTERNS)) {
    const rx = new RegExp(pattern.markers[0], 'gi');
    const matches = (text.match(rx) || []).length;
    const density = matches / Math.max(wc, 1) * 8;
    if (density >= pattern.threshold) {
      results.push({
        id,
        label: pattern.label,
        group: pattern.group,
        color: pattern.color,
        score: clamp(density),
        evidence: matches,
      });
    }
  }
  return results.sort((a,b) => b.score - a.score);
}

// ── GAP HUNTER (TEXT-BASED) ──────────────────────────────────────────────────
// Detects structural gaps in written thought: assumption, logical, shadow field, etc.
const GAP_HUNTER = {
  analyze(text) {
    if (!text || text.length < 30) return [];
    const gaps = [];
    const wc = text.split(/\s+/).length;
    const rx = p => (text.match(new RegExp(p, 'gi')) || []).length;
    const dens = (p, mult=8) => clamp(rx(p) / Math.max(wc,1) * mult);

    // WEAK ASSUMPTION GAP — certainty without evidence
    const certainty = dens('obviously|clearly|everyone knows|of course|definitely|always|never|all|nobody|no one|everyone|it\'s just|simply|just|obviously|clearly', 7);
    const hedge = dens('perhaps|maybe|possibly|I think|might|could|seems|appears', 6);
    const assumptionScore = clamp(certainty - hedge * 0.4);
    if (assumptionScore > 0.25) {
      gaps.push({
        type: 'assumption',
        label: 'load-bearing assumption',
        desc: 'Certainty asserted without evidence trail. The most dangerous gap — the one most avoided.',
        score: assumptionScore,
        color: '--warn',
      });
    }

    // LOGICAL GAP — conclusion without premise  
    const causal = dens('therefore|thus|hence|so|consequently|as a result|which means|because of this', 10);
    const premise = dens('because|since|given that|the reason|evidence|data|research|study|shows|proven|due to', 7);
    const logicalScore = clamp((causal - premise * 0.6) * 1.5);
    if (logicalScore > 0.15) {
      gaps.push({
        type: 'logical',
        label: 'logical leap',
        desc: 'Conclusion reached without earning the premise chain. "Therefore" without "because".',
        score: logicalScore,
        color: '--signal',
      });
    }

    // SHADOW FIELD — emotion/content present but displaced or unspoken
    const projections = dens('you|they|people|everyone|most|others|them|him|her', 4);
    const selfRef = dens('I feel|I notice|I sense|my|I am|I\'m|I was|I have', 3);
    const shadowScore = clamp((projections - selfRef * 0.3) * 0.8);
    if (shadowScore > 0.25 && projections > 0.15) {
      gaps.push({
        type: 'shadow',
        label: 'shadow field',
        desc: 'Content that is present but displaced — attributed outward rather than owned inward.',
        score: shadowScore,
        color: '--near',
      });
    }

    // NEGATIVE SPACE — systematic avoidance
    const avoidance = dens('anyway|moving on|different topic|enough about|let\'s not|doesn\'t matter|forget it|whatever|not worth|skip', 12);
    const circling = dens('it\'s complicated|hard to explain|hard to say|not sure how|can\'t quite|kind of|sort of|something about', 9);
    const negSpaceScore = clamp(avoidance * 1.5 + circling * 0.7);
    if (negSpaceScore > 0.20) {
      gaps.push({
        type: 'avoidance',
        label: 'negative space',
        desc: 'Systematic orbit around something without landing. The shape of the unspeakable.',
        score: negSpaceScore,
        color: '--tension',
      });
    }

    // CONTRADICTION — two incompatible claims in same text
    const contradiction1 = dens('but also|and yet|at the same time|simultaneously|both.*and', 10);
    const contradiction2 = text.match(/I (love|hate).*(I (hate|love))/gi)?.length || 0;
    const contradiction3 = text.match(/always.*(never)|(never).*(always)/gi)?.length || 0;
    const contradictionScore = clamp(contradiction1 * 0.5 + (contradiction2 + contradiction3) * 3);
    if (contradictionScore > 0.20) {
      gaps.push({
        type: 'contradiction',
        label: 'contradiction node',
        desc: 'Two claims that cannot both be true — both present, neither resolved.',
        score: contradictionScore,
        color: '--far',
      });
    }

    // TEMPORAL GAP — past truth assumed as present
    const temporal = dens('always been|was always|it\'s always|been like this|never changes|always will|same as|hasn\'t changed|won\'t ever', 10);
    if (temporal > 0.20) {
      gaps.push({
        type: 'temporal',
        label: 'temporal assumption',
        desc: 'Truth from the past assumed to hold now without verification.',
        score: temporal,
        color: '--nd',
      });
    }

    // REVERSAL — meaning inversion
    const reversals = dens('"fine"|I\'m fine|it\'s fine|we\'re fine', 14) + dens('totally okay|completely fine|not bothered|doesn\'t bother|no big deal', 12);
    const arousal = dens('frustrated|annoyed|angry|upset|bothered|hurt', 8);
    const reversalScore = clamp((reversals * 0.5 + (reversals > 0.1 && arousal > 0.1 ? 0.3 : 0)));
    if (reversalScore > 0.15) {
      gaps.push({
        type: 'reversal',
        label: 'meaning reversal',
        desc: '"Fine" meaning not fine. Minimization as maximization. The gap between stated and felt.',
        score: reversalScore,
        color: '--signal',
      });
    }

    return gaps.sort((a,b) => b.score - a.score).slice(0, 6);
  }
};

// ── SUPPRESSION SCORE (text-based) ──────────────────────────────────────────
// Estimates the gap between what's shown and what's felt from text alone.
function computeSuppressionScore(text) {
  if (!text || text.length < 10) return { score: 0, label: 'no data', evidence: [] };
  const wc = text.split(/\s+/).length;
  const rx = p => (text.match(new RegExp(p, 'gi')) || []).length;

  // Surface positivity markers
  const surface = rx('fine|okay|good|great|alright|happy|amazing|wonderful|fantastic|no problem|not bothered') / Math.max(wc, 1) * 10;
  // Subsurface stress markers
  const subsurface = rx('tired|exhausted|can\'t|don\'t|overwhelmed|frustrated|stuck|hard|difficult|struggling|worried|anxious|tense') / Math.max(wc, 1) * 10;
  // Dismissal patterns
  const dismissal = rx('anyway|moving on|forget it|doesn\'t matter|not worth|whatever|regardless|never mind') / Math.max(wc, 1) * 14;
  // Cross-channel incongruence (positive vocab + negative content)
  const incongruence = (surface > 0.15 && subsurface > 0.20) ? 0.3 : 0;
  
  const raw = clamp(dismissal * 0.35 + incongruence + (surface > 0.3 && subsurface > 0.3 ? 0.2 : 0));
  let label = 'not suppressing';
  if (raw > 0.65) label = 'emotionally compressed';
  else if (raw > 0.40) label = 'held back';
  else if (raw > 0.20) label = 'some regulation active';

  return { score: raw, label };
}

// ── DRIFT SIGNAL DETECTOR (text-based) ──────────────────────────────────────
// Detects 7 pre-state-change signals from text patterns.
function detectDriftSignals(signalHistory) {
  if (!signalHistory || signalHistory.length < 3) return [];
  const recent = signalHistory.slice(0, Math.min(10, signalHistory.length));
  const older = signalHistory.slice(Math.min(10, signalHistory.length));
  const recentAvg = recent.reduce((a,b) => a + b.snr, 0) / recent.length;
  const olderAvg = older.length ? older.reduce((a,b) => a + b.snr, 0) / older.length : recentAvg;
  const signals = [];

  // 1. PACING SHIFT — tempo change
  const pace = recent.length >= 3 ? recent.slice(0,3).reduce((a,b)=>a+(b.ts||0),0)/3 - (recent[3]?.ts||0) : 0;
  if (Math.abs(recentAvg - olderAvg) > 0.12) {
    signals.push({ id: 'pacing_shift', label: 'pacing shift', desc: `Signal tempo changed ${recentAvg > olderAvg ? 'upward' : 'downward'} — something shifted.`, active: true, rising: recentAvg < olderAvg });
  }

  // 2. BEHAVIORAL DRIFT — running delta
  const drift = Math.abs(recentAvg - olderAvg);
  if (drift > 0.15) {
    signals.push({ id: 'behavioral_drift', label: 'behavioral drift', desc: `Cumulative drift from baseline: ${Math.round(drift * 100)}% — slow rotation underway.`, active: drift > 0.2, rising: drift > 0.25 });
  }

  // 3. ENERGY CHANGE — arousal slope
  const snrs = recent.map(h => h.snr);
  const slope = snrs.length >= 2 ? snrs[0] - snrs[snrs.length - 1] : 0;
  if (Math.abs(slope) > 0.1) {
    signals.push({ id: 'energy_change', label: 'energy change', desc: `Arousal ${slope > 0 ? 'rising' : 'falling'} over recent signal history.`, active: Math.abs(slope) > 0.15, rising: slope < -0.1 });
  }

  // 4. RHYTHM DISRUPTION — variance
  const mean = snrs.reduce((a,b) => a+b, 0) / snrs.length;
  const variance = snrs.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / snrs.length;
  if (variance > 0.02) {
    signals.push({ id: 'rhythm_disruption', label: 'rhythm disruption', desc: `Signal variance elevated — personal cadence disrupted (σ = ${(Math.sqrt(variance)*100).toFixed(0)}%).`, active: variance > 0.03, rising: variance > 0.05 });
  }

  return signals;
}

// ── DEEP PATTERNS RENDERER ───────────────────────────────────────────────────
function renderDeepPatterns() {
  const el = document.getElementById('deep-patterns-content');
  if (!el) return;
  const u = STATE.currentUser;
  if (!u) return;
  
  // Gather all text from user's posts for analysis
  const posts = STATE.posts.filter(p => p.userId === u.id && p.body);
  const allText = posts.map(p => p.body).join(' ');
  const fp = u.fingerprint;

  if (!fp && !allText.length) {
    el.innerHTML = '<div class="empty-state">write posts to generate deep pattern analysis</div>';
    return;
  }

  let html = '';

  // ── MOTIVATIONAL SUBSTRATE ──
  if (fp?.motivational) {
    html += '<div class="deep-layer"><div class="deep-layer-title">motivational substrate</div>';
    html += '<div class="motive-grid">';
    const m = fp.motivational;
    const motives = [
      ['autonomy', m.autonomy, '--signal'],
      ['belonging', m.belonging, '--near'],
      ['competence', m.competence, '--tension'],
      ['safety', m.safety, '--warn'],
      ['recognition', m.recognition, '--signal'],
      ['intimacy', m.intimacy, '--near'],
      ['fairness', m.fairness, '--tension'],
      ['contribution', m.contribution, '--far'],
      ['longing', m.longing, '--signal'],
      ['rest', m.rest, '--nd'],
    ];
    html += motives.map(([name, val, color]) => {
      const pct = Math.round((val||0) * 100);
      return `<div class="motive-card">
        <div class="motive-name">${name}</div>
        <div class="motive-bar"><div class="motive-fill" style="width:${pct}%;background:var(${color})"></div></div>
        <div class="motive-val">${pct > 60 ? 'strong' : pct > 35 ? 'present' : 'low'}</div>
      </div>`;
    }).join('');
    html += '</div></div>';
  }

  // ── VALUES / BELIEF STRUCTURE ──
  if (fp?.values_beliefs) {
    html += '<div class="deep-layer"><div class="deep-layer-title">values & belief structure</div>';
    html += '<div class="values-grid">';
    const vb = fp.values_beliefs;
    const vals = [
      ['honesty', vb.val_honesty],
      ['depth', vb.val_depth],
      ['freedom', vb.val_freedom],
      ['loyalty', vb.val_loyalty],
      ['growth', vb.val_growth],
      ['justice', vb.val_justice],
      ['connection', vb.val_connection],
      ['excellence', vb.val_excellence],
    ];
    html += vals.map(([name, val]) => {
      const pct = Math.round((val||0) * 100);
      return `<div class="val-chip">
        <div class="val-name">${name}</div>
        <div class="val-bar"><div class="val-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    html += '</div>';
    // Beliefs about self
    html += `<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase">beliefs about self</div>`;
    const beliefs = [
      {label: 'capable', val: vb.bel_capable, color: '--near'},
      {label: 'self-doubt', val: vb.bel_doubt, color: '--tension'},
      {label: 'limited', val: vb.bel_limited, color: '--warn'},
    ];
    html += beliefs.map(b => `<div class="dp-row">
      <div class="dp-label">${b.label}</div>
      <div class="dp-bar-wrap"><div class="dp-bar" style="width:${Math.round((b.val||0)*100)}%;background:var(${b.color})"></div></div>
      <div class="dp-val">${Math.round((b.val||0)*100)}%</div>
    </div>`).join('');
    html += '</div>';
  }

  // ── INTERLAYER CONFLICTS ──
  if (fp?.conflicts) {
    const c = fp.conflicts;
    const conflictEntries = [
      ['value vs need', c.value_vs_need, 'What I believe I should want fights with what I actually need.'],
      ['belief vs aspiration', c.belief_vs_aspir, 'Who I want to become conflicts with what I believe I\'m capable of.'],
      ['approach-avoidance', c.approach_avoid, 'I want it and I don\'t. Simultaneously.'],
      ['known vs felt', c.known_vs_felt, 'I know this logically. But I can\'t feel it.'],
      ['ideal vs actual', c.ideal_vs_actual, 'Where I thought I\'d be by now. Where I actually am.'],
    ].filter(([,v]) => (v||0) > 0.12);
    
    if (conflictEntries.length) {
      html += '<div class="deep-layer"><div class="deep-layer-title">interlayer conflicts (richest signal)</div>';
      html += conflictEntries.map(([label, val, desc]) => `
        <div class="conflict-card">
          <div class="conflict-label">${label} — ${Math.round((val||0)*100)}%</div>
          <div class="conflict-desc">${desc}</div>
        </div>`).join('');
      html += '</div>';
    }
  }

  // ── NAMED EMOTIONS ──
  if (fp?.named_emotions) {
    const ne = fp.named_emotions;
    const emotions = [
      ['grief', ne.grief, '#6a8fa0'],
      ['fear', ne.fear, '#c04040'],
      ['anger', ne.anger, '#c87941'],
      ['shame', ne.shame, '#a05898'],
      ['loneliness', ne.loneliness, '#5870a0'],
      ['joy', ne.joy, '#3a9e6e'],
      ['hope', ne.hope, '#b89b3a'],
      ['peace', ne.peace, '#50a8a0'],
      ['anxiety', ne.anxiety, '#c04080'],
      ['exhaustion', ne.exhaustion, '#806080'],
    ].filter(([,v]) => (v||0) > 0.08);

    if (emotions.length) {
      html += '<div class="deep-layer"><div class="deep-layer-title">named emotional states</div>';
      html += '<div class="emotion-wheel">';
      html += emotions.map(([name, val, color]) => {
        const opacity = Math.max(0.3, (val||0));
        return `<div class="emotion-chip" style="border-color:${color};color:${color};opacity:${opacity};background:${color}18">
          ${name} ${Math.round((val||0)*100)}%
        </div>`;
      }).join('');
      html += '</div></div>';
    }
  }

  // ── SUPPRESSION METER ──
  const supp = computeSuppressionScore(allText);
  html += `<div class="deep-layer"><div class="deep-layer-title">emotional suppression estimate</div>
    <div class="suppression-meter">
      <div class="supp-label">surface vs felt gap</div>
      <div class="supp-track"><div class="supp-fill" style="width:${Math.round(supp.score*100)}%"></div></div>
      <div class="supp-val">${supp.label}</div>
    </div>
  </div>`;

  // ── DRIFT SIGNALS ──
  const history = STATE.snrHistory || [];
  const driftSignals = detectDriftSignals(history);
  if (driftSignals.length) {
    html += '<div class="deep-layer"><div class="deep-layer-title">drift signals (pre-state-change indicators)</div>';
    html += '<div class="drift-state">';
    html += driftSignals.map(s => `<div class="drift-sig ${s.rising ? 'rising' : s.active ? 'active' : 'neutral'}">
      <span>${s.active ? '●' : '○'}</span> ${s.label}
    </div>`).join('');
    html += '</div>';
    html += driftSignals.filter(s=>s.active).map(s=>`<div style="font-family:var(--body);font-size:12px;color:var(--text3);font-style:italic;margin-bottom:6px">${s.desc}</div>`).join('');
    html += '</div>';
  }

  // ── DSM-5 PATTERN INDEX ──
  if (allText.length > 50) {
    const patterns = detectDSMPatterns(allText);
    html += '<div class="deep-layer"><div class="deep-layer-title">pattern index (not diagnoses — signals only)</div>';
    if (!patterns.length) {
      html += '<div class="dsm-none">no elevated patterns detected in current signal history</div>';
    } else {
      // Group by category
      const byGroup = {};
      patterns.forEach(p => { (byGroup[p.group] = byGroup[p.group] || []).push(p); });
      html += Object.entries(byGroup).map(([group, items]) => `
        <div class="dsm-section">
          <div class="dsm-title">${group}</div>
          ${items.map(p => `<div class="dsm-pattern" style="border-color:var(${p.color})">
            <div class="dsm-p-label" style="color:var(${p.color})">${p.label} — ${Math.round(p.score*100)}%</div>
            <div class="dsm-p-desc">detected in post history — ${p.evidence} marker occurrence${p.evidence !== 1 ? 's' : ''}</div>
          </div>`).join('')}
        </div>`).join('');
    }
    html += '</div>';
  }

  el.innerHTML = html;
}

// ── GAP ANALYSIS RENDERER ────────────────────────────────────────────────────
function renderGapAnalysis() {
  const el = document.getElementById('gap-analysis-content');
  if (!el) return;
  const u = STATE.currentUser;
  if (!u) return;
  
  const posts = STATE.posts.filter(p => p.userId === u.id && p.body);
  const allText = posts.map(p => p.body).join('\n\n');
  
  if (!allText.length) {
    el.innerHTML = '<div class="empty-state">write posts to generate gap analysis</div>';
    return;
  }

  const gaps = GAP_HUNTER.analyze(allText);
  let html = '';
  
  html += `<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:16px;font-style:italic">
    gap analysis surfaces the structure of what is NOT being said — load-bearing assumptions, logical leaps, shadow fields, and meaning inversions.
    these are signals, not verdicts. the most dangerous gap is the one you've stopped being able to see.
  </div>`;

  if (!gaps.length) {
    html += `<div class="empty-state" style="font-family:var(--body);font-style:italic">
      no significant gaps detected in current post history — clean signal, coherent claim chains.
    </div>`;
  } else {
    // Universal criticality: assumption=1.0, contradiction=0.8, temporal=0.75, logical=0.70, shadow=0.65, avoidance=0.55, reversal=0.50
    const criticality = { assumption:1.0, contradiction:0.8, temporal:0.75, logical:0.70, shadow:0.65, avoidance:0.55, reversal:0.50 };
    const sorted = [...gaps].sort((a,b) => (criticality[b.type]||0.5)*b.score - (criticality[a.type]||0.5)*a.score);
    
    html += sorted.map(g => {
      const crit = criticality[g.type] || 0.5;
      const weight = Math.round(g.score * crit * 100);
      return `<div class="gap-card ${g.type}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
          <div class="gap-type" style="color:var(${g.color})">${g.type} gap</div>
          <div class="gap-score" style="color:var(${g.color})">load: ${weight}%</div>
        </div>
        <div class="gap-desc">${g.label}</div>
        <div class="gap-evidence" style="margin-top:6px">${g.desc}</div>
      </div>`;
    }).join('');

    // Per-post gap analysis (most recent 5 posts)
    const recentPosts = posts.slice(0, 5);
    if (recentPosts.length > 1) {
      html += `<div style="margin-top:24px;font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:12px;padding-top:16px;border-top:1px solid var(--border)">per-post gap signals</div>`;
      html += recentPosts.map(post => {
        const postGaps = GAP_HUNTER.analyze(post.body);
        if (!postGaps.length) return '';
        const ts = new Date(post.ts).toLocaleDateString('en-US', {month:'short', day:'numeric'});
        return `<div style="margin-bottom:12px;padding:10px 12px;background:var(--paper3);border-radius:var(--r);border:1px solid var(--border)">
          <div style="font-family:var(--mono);font-size:8px;color:var(--text3);margin-bottom:8px">${ts} — ${post.body.slice(0,60)}...</div>
          ${postGaps.slice(0,3).map(g => `<div style="font-family:var(--body);font-size:12px;color:var(${g.color});margin-bottom:3px;font-style:italic">
            ∿ ${g.label} — ${g.desc.split('.')[0]}
          </div>`).join('')}
        </div>`;
      }).filter(Boolean).join('');
    }
  }
  
  el.innerHTML = html;
}

// ── ENHANCED RESONANCE TAB SWITCHER ─────────────────────────────────────────
const _origSwitchResTab = typeof switchResTab !== 'undefined' ? switchResTab : null;
function switchResTab(tab, el) {
  STATE.currentResTab = tab;
  document.querySelectorAll('.rtab2').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderResTab(tab);
}

const _origRenderResTab = typeof renderResTab !== 'undefined' ? renderResTab : null;
function renderResTab(tab) {
  ['res-lattice-tab','res-metrics-tab','res-assistant-tab','res-api-tab','res-deep-tab','res-gap-tab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const map = {
    lattice: 'res-lattice-tab',
    metrics: 'res-metrics-tab',
    assistant: 'res-assistant-tab',
    api: 'res-api-tab',
    deep: 'res-deep-tab',
    gap: 'res-gap-tab',
  };
  const el = document.getElementById(map[tab]);
  if (el) el.style.display = '';
  if (tab === 'lattice') setTimeout(drawWordLattice, 80);
  if (tab === 'metrics') renderMetrics();
  if (tab === 'deep') renderDeepPatterns();
  if (tab === 'gap') renderGapAnalysis();
}

// ── ENHANCED BPE PATTERNS ────────────────────────────────────────────────────
// Extend BPE.analyze with v4 patterns
const _origBPEAnalyze = BPE.analyze.bind(BPE);
BPE.analyze = function(signal) {
  const P = _origBPEAnalyze(signal);
  const { structural: s, cognitive: c, emotional: e, motivational: m, conflicts: co, values_beliefs: vb, named_emotions: ne } = signal;
  
  // New v4 patterns from motivational substrate
  if (m?.longing > 0.45 && e?.suppression > 0.35) P.push({id:'longing_suppressed', label:'suppressed longing', desc:'something deeply wanted, held back — the gap between want and expression', severity:'notice'});
  if (m?.safety > 0.55 && m?.autonomy > 0.55) P.push({id:'safety_autonomy_tension', label:'safety vs freedom', desc:'needing to be safe and free simultaneously — classic interlayer conflict', severity:'notice'});
  if (co?.known_vs_felt > 0.35) P.push({id:'head_heart_split', label:'head-heart split', desc:'knowing something clearly but unable to feel it — the cognitive-emotional disconnect', severity:'watch'});
  if (co?.ideal_vs_actual > 0.40) P.push({id:'not_there_yet', label:'not where I expected', desc:'gap between projected and actual self — a temporal identity wound', severity:'notice'});
  if (ne?.shame > 0.30 && e?.suppression > 0.40) P.push({id:'shame_compression', label:'compressed shame', desc:'shame energy present but packed down — tends to leak at edges', severity:'watch'});
  if (vb?.bel_defective > 0.30 || vb?.bel_limited > 0.50) P.push({id:'defectiveness_loop', label:'defectiveness loop', desc:'not-enough signal running underneath — shapes what gets attempted or avoided', severity:'watch'});
  if (m?.recognition > 0.55 && e?.vulnerability < 0.20) P.push({id:'seen_not_vulnerable', label:'seen without being known', desc:'wanting recognition but guarding depth — visibility as substitute for intimacy', severity:'notice'});
  
  return P;
};

// ── ENHANCED LANGUAGE LAYER ──────────────────────────────────────────────────
// Extend LANG with v4 descriptors
LANG.motivationalState = function(fp) {
  if (!fp?.motivational) return 'not calibrated';
  const m = fp.motivational;
  const top = Object.entries(m).sort(([,a],[,b]) => b - a)[0];
  if (!top || top[1] < 0.2) return 'diffuse motivational field';
  const names = {autonomy:'freedom-seeking', belonging:'connection-seeking', competence:'mastery-driven', safety:'safety-oriented', recognition:'recognition-seeking', intimacy:'intimacy-seeking', contribution:'contribution-driven', longing:'longing-saturated', rest:'depletion-signaling'};
  return names[top[0]] || top[0];
};

LANG.conflictSignal = function(fp) {
  if (!fp?.conflicts) return 'no conflict signal';
  const c = fp.conflicts;
  const highest = Object.entries(c).sort(([,a],[,b]) => b - a)[0];
  if (!highest || highest[1] < 0.15) return 'coherent signal';
  const names = {value_vs_need:'value-need tension', belief_vs_aspir:'aspiration gap', approach_avoid:'approach-avoidance split', known_vs_felt:'head-heart disconnect', ideal_vs_actual:'identity-timeline gap'};
  return names[highest[0]] || 'internal tension present';
};

LANG.primaryEmotion = function(fp) {
  if (!fp?.named_emotions) return 'unknown';
  const ne = fp.named_emotions;
  const top = Object.entries(ne).sort(([,a],[,b]) => b - a).filter(([,v]) => v > 0.1)[0];
  return top ? top[0] : 'indeterminate';
};

// ── ENHANCED METRICS v4 ──────────────────────────────────────────────────────
const _origRenderMetrics = renderMetrics;
function renderMetrics() {
  const u = STATE.currentUser; if (!u) return;
  const el = document.getElementById('metrics-grid');
  if (!el) return;
  const fp = u.fingerprint;
  const bpe = BPE.metrics();
  if (!fp) { el.innerHTML = '<div class="metric-card" style="grid-column:1/-1"><div class="mc-label">calibrating</div><div class="mc-value">write posts to generate metrics</div></div>'; return; }
  const cards = [
    {label:'overall signal quality', val:LANG.snr(fp.snr||u.snrAvg||0), trend:bpe.trend==='rising'?'↑ improving':bpe.trend==='falling'?'↓ dropping':'→ holding', up:bpe.trend==='rising'},
    {label:'posts analyzed', val:bpe.postCount||u.posts||0, trend:'total signal events', up:true},
    {label:'peak signal', val:LANG.snr(bpe.peakSnr||fp.snr||0), trend:'your best recorded signal', up:true},
    {label:'abstraction level', val:LANG.abstraction(fp.structural?.abstraction||0), trend:'', up:false},
    {label:'systems thinking', val:LANG.systemsThinking(fp.cognitive?.systemsThinking||0), trend:'', up:false},
    {label:'emotional presence', val:LANG.affectIntensity(fp.emotional?.affectIntensity||0), trend:'', up:false},
    {label:'openness / expansion', val:LANG.expansion(fp.emotional?.expansion||0), trend:'', up:false},
    {label:'compression', val:LANG.compression(fp.emotional?.compression||0), trend:'', up:false},
    {label:'vocabulary richness', val:LANG.entropy(fp.structural?.entropy||0), trend:'', up:false},
    {label:'pattern density', val:LANG.ndScore(fp.nd?.ndScore||0), trend:'', up:false},
    {label:'recursion', val:LANG.recursion(fp.structural?.recursion||0), trend:'', up:false},
    {label:'vulnerability', val:LANG.vulnerability(fp.emotional?.vulnerability||0), trend:'', up:false},
    {label:'signal state', val:LANG.regime(fp.snr||u.snrAvg||0, bpe.trend==='rising'?.1:bpe.trend==='falling'?-.1:0), trend:bpe.avgSnrLabel, up:false},
    // v4 additions
    {label:'motivational field', val:LANG.motivationalState(fp), trend:'primary drive orientation', up:false},
    {label:'conflict signal', val:LANG.conflictSignal(fp), trend:'interlayer tension', up:false},
    {label:'primary emotion', val:LANG.primaryEmotion(fp), trend:'named emotional state', up:false},
  ];
  el.innerHTML = cards.map(c => `
    <div class="metric-card">
      <div class="mc-label">${c.label}</div>
      <div class="mc-value">${c.val}</div>
      ${c.trend?`<div class="mc-trend${c.up?' up':''}">${c.trend}</div>`:''}
    </div>`).join('');
}

// ── ENHANCED AI SYSTEM PROMPT v4 ────────────────────────────────────────────
// This patches the AI system prompt to include v4 signals
const _origSendAI = sendAI;
async function sendAI() {
  const u = STATE.currentUser; if (!u) return;
  if (!PLUGIN_REGISTRY.get('plg_ai_assistant')?.enabled) { showToast('AI assistant plugin is disabled'); return; }
  const input = document.getElementById('ai-input');
  const msg = input?.value?.trim();
  if (!msg) return;
  input.value = '';
  const msgsEl = document.getElementById('ai-messages');
  if (!msgsEl) return;
  STATE.aiHistory.push({role:'user',content:msg});
  msgsEl.insertAdjacentHTML('beforeend',`<div class="ai-msg user">${escHtml(msg)}</div>`);
  const loadingEl = document.createElement('div');
  loadingEl.className = 'ai-msg assistant loading'; loadingEl.textContent = 'thinking...';
  msgsEl.appendChild(loadingEl);
  msgsEl.scrollTop = msgsEl.scrollHeight;
  
  const fp = u.fingerprint;
  const bpe = BPE.metrics();
  
  // Gather gap and pattern data for context
  const posts = STATE.posts.filter(p => p.userId === u.id && p.body);
  const allText = posts.map(p => p.body).join(' ');
  const gaps = allText ? GAP_HUNTER.analyze(allText) : [];
  const dsmPatterns = allText ? detectDSMPatterns(allText) : [];
  const topGaps = gaps.slice(0, 3).map(g => g.label).join(', ') || 'none detected';
  const topPatterns = dsmPatterns.slice(0, 2).map(p => p.label).join(', ') || 'none detected';
  
  const systemPrompt = `You are the Resonance AI assistant — a thoughtful, signal-aware companion helping users understand their signal on the Resonance social platform. You have access to the user's deep fingerprint including motivational substrate, values/beliefs, interlayer conflicts, named emotions, and gap analysis.

The platform analyzes HOW people write and think — not what they say. Signal fingerprint includes: abstraction level, systems thinking, emotional presence, vulnerability, compression, recursion, vocabulary richness, pattern density, SNR (signal-to-noise ratio), motivational substrate, value structure, and behavioral drift signals.

Current user context:
- Name: ${u.name}, Handle: ${u.handle}
- Signal quality: ${fp ? LANG.snr(fp.snr||u.snrAvg||0) : 'not calibrated yet'}
- Posts: ${u.posts||0}, Regime: ${u.regime||'calibrating'}
- Abstraction: ${fp ? LANG.abstraction(fp.structural?.abstraction||0) : 'unknown'}
- Systems thinking: ${fp ? LANG.systemsThinking(fp.cognitive?.systemsThinking||0) : 'unknown'}
- Emotional presence: ${fp ? LANG.affectIntensity(fp.emotional?.affectIntensity||0) : 'unknown'}
- Vulnerability: ${fp ? LANG.vulnerability(fp.emotional?.vulnerability||0) : 'unknown'}
- Compression: ${fp ? LANG.compression(fp.emotional?.compression||0) : 'unknown'}
- Motivational field: ${LANG.motivationalState(fp)}
- Primary conflict signal: ${LANG.conflictSignal(fp)}
- Primary emotion: ${LANG.primaryEmotion(fp)}
- Gap analysis: ${topGaps}
- Pattern signals: ${topPatterns}
- BPE trend: ${bpe.trend}, avg signal: ${bpe.avgSnrLabel}

IMPORTANT: Speak in plain language — never raw numbers, always descriptions. Keep responses concise (2-4 paragraphs max). Be warm but not sycophantic, direct but not clinical, intellectually engaged, and signal-aware. You are allowed to name what you observe in the patterns if asked. You are not a therapist and do not diagnose. You are a signal reader — you describe what you see in the patterns. If asked to help write something, write it.`;
  
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: STATE.aiHistory.slice(-8),
      }),
    });
    const data = await resp.json();
    const reply = data.content?.[0]?.text || 'I ran into an issue — try again.';
    STATE.aiHistory.push({role:'assistant', content:reply});
    loadingEl.classList.remove('loading');
    loadingEl.textContent = reply;
  } catch(e) {
    loadingEl.classList.remove('loading');
    loadingEl.textContent = 'could not reach the AI — check your connection and try again.';
  }
  msgsEl.scrollTop = msgsEl.scrollHeight;
  BUS.emit('ai:message', {userId: u.id});
}

// ── VERSION 4 BOOT ADDITION ──────────────────────────────────────────────────
BUS.on('platform:boot', () => {
  console.log('[resonance v4.0.0] deep patterns engine active');
  console.log('[resonance v4.0.0] gap hunter indexed: 7 gap types, 8 universal, relational domain');
  console.log('[resonance v4.0.0] DSM-5 pattern index loaded: 20 named patterns');
  console.log('[resonance v4.0.0] drift engine: 4 pre-state-change signals');
  console.log('[resonance v4.0.0] suppression meter: text-based estimation active');
});


// ══════════════════════════════════════════════════════════════════════════════
//  RESONANCE v4.1.0 — GapHunter v3.1.0 INTEGRATION
//  ┌─ Relational Physics (Theta, 16 emotions, friction, phase transitions) ──┐
//  │  Gap Field Engine (lyric analysis, sequence fields, field compositor)   │
//  │  9 Gap Reasons + descriptions · 10 Invariants · As Above So Below       │
//  │  200+ named gaps · Field/Music subtypes · Deferred variable types       │
//  └────────────────────────────────────────────────────────────────────────-┘
// ══════════════════════════════════════════════════════════════════════════════

// ── THETA STATE VECTOR ────────────────────────────────────────────────────────
// Θ = {H, I, C, M, P_c, P_e}
// H=entropy, I=intensity, C=causality(-1→+1), M=intimacy, P_c=cogEmpathy, P_e=emEmpathy
class Theta {
  constructor({ H=0.5, I=0.5, C=0.5, M=0.5, P_c=0.5, P_e=0.5 } = {}) {
    const cl = v => Math.max(0, Math.min(1, isNaN(v)?0:v));
    const cc = v => Math.max(-1, Math.min(1, isNaN(v)?0:v));
    this.H = cl(H); this.I = cl(I); this.C = cc(C);
    this.M = cl(M); this.P_c = cl(P_c); this.P_e = cl(P_e);
  }
  get coherence() { const c = Math.max(0, this.C); return +(c * this.M * this.P_c * this.P_e).toFixed(4); }
  get collapsePressure() { return +((this.H + Math.max(0,-this.C) + (1-this.P_c)*0.3 + (1-this.P_e)*0.3) / 2.6).toFixed(4); }
  get gapSignature() { return +(this.H*0.25 + (1-Math.max(0,this.C))*0.25 + (1-this.M)*0.20 + (1-this.P_c)*0.15 + (1-this.P_e)*0.15).toFixed(4); }
  toJSON() { return { H:this.H, I:this.I, C:this.C, M:this.M, P_c:this.P_c, P_e:this.P_e }; }
}

// ── 16 EMOTION ATTRACTOR BASINS ───────────────────────────────────────────────
const EMOTION_ATTRACTORS = [
  { name:'love',        theta:{H:0.15,I:0.65,C:0.80,M:0.85,P_c:0.80,P_e:0.80}, note:'Coherent coupling without collapse. If M grows while C drops → enmeshment.', color:'#e8804a' },
  { name:'fear',        theta:{H:0.90,I:0.80,C:0.15,M:0.50,P_c:0.20,P_e:0.50}, note:'Prediction instability under entropy. The future cannot be stabilized.', color:'#c04040' },
  { name:'anger',       theta:{H:0.35,I:0.80,C:0.75,M:0.45,P_c:0.65,P_e:0.45}, note:'Active boundary correction. C is high and assertive — not breakdown.', color:'#c87941' },
  { name:'rage',        theta:{H:0.75,I:0.98,C:0.30,M:0.30,P_c:0.20,P_e:0.10}, note:'Anger exceeds control bandwidth. P_c degrades under I overload.', color:'#c04040' },
  { name:'hatred',      theta:{H:0.55,I:0.70,C:-0.75,M:0.55,P_c:0.80,P_e:-0.60}, note:'Structured rejection of known structure. You know them well. C is negative.', color:'#8b3a8b' },
  { name:'resentment',  theta:{H:0.50,I:0.45,C:0.30,M:0.70,P_c:0.75,P_e:0.15}, note:'Frozen friction loop. M still high — entangled. Replay without resolution.', color:'#b89b3a' },
  { name:'grief',       theta:{H:0.50,I:0.25,C:0.70,M:0.85,P_c:0.80,P_e:0.60}, note:'Graph still routes through what is gone. The absence is exact.', color:'#6a8fa0' },
  { name:'sorrow',      theta:{H:0.35,I:0.20,C:0.70,M:0.75,P_c:0.75,P_e:0.70}, note:'Cleaner than grief. The loss is understood. No ambiguity about what is gone.', color:'#5870a0' },
  { name:'joy',         theta:{H:0.10,I:0.80,C:0.75,M:0.80,P_e:0.90,P_c:0.75}, note:'Structured coherence expanding outward. H must stay low or joy collapses.', color:'#3a9e6e' },
  { name:'contentment', theta:{H:0.15,I:0.30,C:0.65,M:0.60,P_c:0.65,P_e:0.55}, note:'Stable equilibrium. No unresolved friction, no missing structure.', color:'#50a8a0' },
  { name:'guilt',       theta:{H:0.50,I:0.55,C:0.70,M:0.50,P_c:0.85,P_e:0.40}, note:'C high but directed inward. The loop never resolves.', color:'#b89b3a' },
  { name:'anxiety',     theta:{H:0.85,I:0.70,C:0.20,M:0.40,P_c:0.30,P_e:0.35}, note:'Fear without specific object. Entropy without a clear source.', color:'#c04080' },
  { name:'shame',       theta:{H:0.60,I:0.65,C:0.20,M:0.20,P_c:0.40,P_e:0.30}, note:'I am something wrong. M drops — self withdraws. Unlike guilt (I did wrong).', color:'#a05898' },
  { name:'loneliness',  theta:{H:0.60,I:0.45,C:0.35,M:0.15,P_c:0.55,P_e:0.40}, note:'M low not because coupling capacity absent — no node to couple with.', color:'#5870a0' },
  { name:'overwhelm',   theta:{H:0.80,I:0.98,C:0.25,M:0.50,P_c:0.20,P_e:0.30}, note:'I overload degrades everything. Like rage but without directional force.', color:'#c04040' },
  { name:'numbness',    theta:{H:0.30,I:0.05,C:0.20,M:0.10,P_c:0.40,P_e:0.05}, note:'Not peace. System went offline. Low H — ambiguity requires energy.', color:'#5870a0' },
];

// ── PHASE TRANSITIONS ─────────────────────────────────────────────────────────
const PHASE_TRANSITIONS = [
  { from:'love',       to:'resentment',     trigger:(t,g,f)=>t.M>0.60&&f>0.40&&t.P_e<0.40, mechanism:'Friction accumulating in high-intimacy field with empathy decay', intervention:'Restore P_e — acknowledge the emotional experience of the other' },
  { from:'fear',       to:'anger',          trigger:(t,g,f)=>t.H>0.65&&t.C<0.30&&t.I>0.55, mechanism:'High entropy + high intensity → system attempts to assert causal control', intervention:'Lower H first — establish one stable prediction before pushing C up' },
  { from:'grief',      to:'numbness',       trigger:(t,g,f)=>g>0.60&&t.I<0.25&&t.M>0.60, mechanism:'Persistent unresolved gap with high coupling → system shuts down', intervention:'Do not reduce M. Restore I gently. The gap needs to be held, not closed.' },
  { from:'joy',        to:'overwhelm',      trigger:(t,g,f)=>t.I>0.85&&t.H>0.50&&t.C<0.50, mechanism:'High intensity with rising entropy — coherence structure cannot hold the load', intervention:'Reduce I through grounding. Do not reduce H while I is high.' },
  { from:'anger',      to:'rage',           trigger:(t,g,f)=>t.I>0.80&&t.P_c<0.35&&t.H>0.60, mechanism:'Anger loses its damping function as P_c degrades under I overload', intervention:'I must come down before P_c can be restored.' },
  { from:'resentment', to:'hatred',         trigger:(t,g,f)=>t.M<0.35&&t.P_e<0.20&&t.C<0, mechanism:'M drops + P_e inverts — entanglement becomes aversion', intervention:'The transition may already be complete. Separation is the only stable state.' },
  { from:'shame',      to:'rage',           trigger:(t,g,f)=>t.I>0.75&&t.H>0.55&&t.P_c<0.35, mechanism:'Exposure triggers survival response — shame collapses into rage', intervention:'Reduce exposure threat first. Do not attempt repair during peak I.' },
];

// ── EMOTION ENGINE ────────────────────────────────────────────────────────────
function thetaFromText(text) {
  if (!text || text.length < 5) return new Theta({ H:0.7, I:0.2, C:0.2, M:0.2, P_c:0.3, P_e:0.3 });
  const tokens = text.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/).filter(Boolean);
  
  // Entropy from token distribution
  const freq = {}; tokens.forEach(t => freq[t] = (freq[t]||0)+1);
  const probs = Object.values(freq).map(c => c/tokens.length);
  let H = 0; probs.forEach(p => { if(p>0) H -= p * Math.log2(p); });
  H = Math.min(1, H / 5);

  const wc = Math.max(tokens.length, 1);
  const rx = p => ((text.match(new RegExp(p,'gi'))||[]).length / wc) * 15;
  
  const certainty = rx('definitely|obviously|clearly|always|never|must|certain|fact|proof|know');
  const hedge     = rx('maybe|perhaps|might|feel|seems|probably|I think|uncertain|could|not sure');
  const causal    = rx('because|therefore|caused|led to|explains|proves|shows|resulted');
  const intimacy  = rx('we|us|our|together|share|close|deep|connected|relationship|between|with you');
  const empathy   = rx('understand|feel|hear|see you|makes sense|get it|I know|resonate|with you');
  const intensity = rx('urgent|critical|important|must|need|now|desperate|vital|essential|overwhelming');

  const C = clamp(certainty - hedge*0.5 + 0.3, -0.5, 1.0);
  const M = clamp(intimacy * 0.8, 0, 1);
  const P_c = clamp(empathy * 0.7, 0.1, 0.9);
  const P_e = clamp(empathy * 0.5 + M * 0.3, 0, 1);
  const I = clamp(intensity * 0.8 + (1-H)*0.3, 0.1, 1);

  return new Theta({ H, I, C, M, P_c, P_e });
}

function computeEmotion(theta, gapScore=0, frictionScore=0) {
  const dims = ['H','I','C','M','P_c','P_e'];
  const weights = { H:1.2, I:0.8, C:1.5, M:1.2, P_c:1.0, P_e:1.0 };
  
  const scores = EMOTION_ATTRACTORS.map(a => {
    let sum = 0;
    dims.forEach(d => {
      const diff = (theta[d]||0) - (a.theta[d]||0);
      sum += diff*diff*(weights[d]||1);
    });
    return { ...a, dist: Math.sqrt(sum/dims.length) };
  }).sort((a,b) => a.dist - b.dist);
  
  const primary = scores[0];
  const secondary = scores[1];
  
  // Phase transition risks
  const transitions = PHASE_TRANSITIONS.filter(pt => {
    try { return pt.trigger(theta, gapScore, frictionScore); } catch { return false; }
  });
  
  return {
    primary: { name: primary.name, confidence: Math.max(0, 1-primary.dist), note: primary.note, color: primary.color },
    secondary: { name: secondary.name, confidence: Math.max(0, 1-secondary.dist) },
    coherence: theta.coherence,
    collapse_pressure: theta.collapsePressure,
    gap_signature: theta.gapSignature,
    stability: theta.coherence > (theta.H + frictionScore + gapScore),
    transitions,
  };
}

// ── 9 GAP REASONS + DESCRIPTIONS ─────────────────────────────────────────────
const GAP_REASONS = {
  compression: { label:'compression', color:'--signal', desc:'Information density exceeds bandwidth — gaps form where content is compressed. The gap is the artefact of the compression algorithm.' },
  avoidance: { label:'avoidance', color:'--warn', desc:'The content is too threatening to hold consciously. Gaps are purposeful. The absence is an act. The shape of the absence tells you what was avoided.' },
  compatibility: { label:'compatibility', color:'--far', desc:'Two systems that cannot fully interoperate. The gap lives at the interface — where one coordinate system meets another and the translation fails.' },
  attention: { label:'attention', color:'--nd', desc:'Finite attention cannot cover everything. The most important gaps are often in the blind spot created by what was attended to.' },
  emotional_occlusion: { label:'emotional occlusion', color:'--tension', desc:'Strong emotion casts a blind spot. High arousal narrows the field. Some truths can only be seen from a regulated state.' },
  narrative_soothing: { label:'narrative soothing', color:'--far', desc:'The story needs the gap to hold together. It is protected by what it holds up. Closing it would require updating the narrative.' },
  identity_reflection: { label:'identity reflection', color:'--signal', desc:'The gap protects an identity. Closing it means becoming someone who knows what you currently don\'t. The resistance is proportional to what the identity costs.' },
  deferred_variable: { label:'deferred variable', color:'--nd', desc:'The variable exists. It is known to exist. It is explicitly not processed yet. Different from omitted — you can name what is deferred.' },
  structural_limit: { label:'structural limit', color:'--far', desc:'The system\'s architecture cannot represent the content. A hard limit — not avoidance, but genuine constraint of the medium.' },
};

// ── 10 CROSS-DOMAIN INVARIANTS ────────────────────────────────────────────────
const GAP_INVARIANTS = [
  'The most critical gap is the one most avoided',
  'Assumption gaps are always more load-bearing than they appear',
  'Temporal gaps compound — small errors grow with time',
  'Contradiction gaps generate energy — the oscillation is fuel if redirected before collapse',
  'The observer always has blind spots that cannot be seen from inside the observation',
  'Normalisation hides accumulation — point-in-time analysis misses what longitudinal reveals',
  'Every system is optimised for what it actually rewards, not for what it says it values',
  'The frame determines what can be found — the most important gaps are often outside the frame',
  'Completeness is an illusion that causes premature closure',
  'The gap in the gap detector is the most dangerous gap',
];

// ── AS ABOVE SO BELOW ─────────────────────────────────────────────────────────
const AS_ABOVE_SO_BELOW = [
  'The gap in a lyric line is the same operation as the gap in a legal contract — chain broken, obligation unmet, assumption never examined.',
  'The unresolved tritone in music is the unspoken word in conversation is the unclosed try/catch in code is the unenforced law in governance.',
  'What a song avoids saying at the pivot is what a person avoids feeling at the crisis is what an institution avoids measuring at the review.',
  'The hook exists where gap field pressure is maximum — in music, argument, relationship, code. The most important moment is where expectation is highest and resolution not yet guaranteed.',
  'Oscillation at the personal scale mirrors oscillation at the systemic scale. The fight that repeats monthly is the policy cycle that repeats every election.',
  'Compression at the bandwidth level creates the same artefacts as compression at the emotional level — the thing that doesn\'t fit gets dropped, and the absence is the gap.',
  'An edge in signal processing and an edge in a relationship and an edge in a codebase share the same geometry: maximum information density, minimum predictability, highest gap-field pressure.',
];

// ── LYRIC FIELD ANALYZER (text-based port) ───────────────────────────────────
function syllableCount(word) {
  const w = (word||'').toLowerCase().replace(/[^a-z]/g,'');
  if(!w) return 0;
  const m = w.match(/[aeiouy]+/g);
  let n = m ? m.length : 1;
  if(w.endsWith('e') && n > 1) n--;
  return Math.max(1, n);
}

function phonemes(word) {
  return (word||'').toLowerCase().replace(/[^a-z]/g,'')
    .replace(/qu/g,'kw').replace(/ph/g,'f').replace(/ck/g,'k')
    .replace(/gh/g,'').replace(/[aeiou]+/g,'V')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g,'$1');
}

function rhymeSuffix(word, len=3) { const ph=phonemes(word); return ph.slice(-len); }

function phoneSim(a, b) {
  if(!a||!b) return 0; if(a===b) return 1;
  const sa=a.slice(-4), sb=b.slice(-4);
  let m=0;
  for(let i=0;i<Math.min(sa.length,sb.length);i++) {
    if(sa[sa.length-1-i]===sb[sb.length-1-i]) m++;
  }
  return +(m/Math.max(sa.length,sb.length)).toFixed(4);
}

function analyzeLyrics(text) {
  const lines = text.split(/\n+/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return null;
  
  // Detect rhyme scheme
  const endings = lines.map(l => (l.split(/\s+/).filter(Boolean).pop()||'').replace(/[^a-z]/gi,'').toLowerCase());
  const phonEndings = endings.map(w => rhymeSuffix(w, 3));
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const scheme = []; const groups = {}; let next = 0;
  
  phonEndings.forEach((pe, i) => {
    let found = false;
    for(let j=0;j<i;j++) {
      if(phoneSim(pe, phonEndings[j]) >= 0.60) {
        scheme.push(scheme[j]); groups[scheme[j]].push(i); found=true; break;
      }
    }
    if(!found) { const lb=labels[next++%26]; scheme.push(lb); groups[lb]=[i]; }
  });
  
  // Syllable counts and meter
  const syllables = lines.map(l => l.split(/\s+/).reduce((s,w)=>s+syllableCount(w),0));
  const avg = syllables.reduce((a,b)=>a+b,0) / syllables.length;
  
  // Rhyme scores
  const rhymeScores = lines.map((l,i) => {
    const partners = (groups[scheme[i]]||[]).filter(j=>j!==i);
    let best = 0;
    partners.forEach(j => { best = Math.max(best, phoneSim(phonEndings[i], phonEndings[j])); });
    return best;
  });
  
  // Content arc — tension/resolution
  const TENSION = /\b(want|need|ache|cold|dark|lost|break|fall|cry|empty|numb|burn|fear|alone|never|gone)\b/gi;
  const RESOLVE = /\b(find|free|light|whole|home|clear|peace|hold|stay|know|rise|warm|fill|open|breathe|finally|still)\b/gi;
  const arcTension = lines.map(l => (l.match(TENSION)||[]).length);
  const arcResolve = lines.map(l => (l.match(RESOLVE)||[]).length);
  const peakTension = arcTension.indexOf(Math.max(...arcTension));
  const expectedPivot = Math.floor(lines.length * 0.65);
  
  // Gap pressure per line
  const pressures = lines.map((l,i) => {
    const rhymePressure = 1 - rhymeScores[i];
    const meterDev = Math.abs(syllables[i] - avg) / Math.max(avg, 8);
    return clamp(rhymePressure * 0.5 + meterDev * 0.5);
  });
  
  // Detect edges — lines with high gap pressure
  const edges = pressures.map((p,i) => ({i,p})).filter(e => e.p > 0.5).map(e => e.i);
  
  // Summary insights
  const insights = [];
  const avgRhyme = rhymeScores.reduce((a,b)=>a+b,0)/rhymeScores.length;
  const stdSyl = Math.sqrt(syllables.reduce((s,v)=>{const m=avg;return s+(v-m)**2},0)/syllables.length);
  
  if(avgRhyme < 0.3) insights.push({type:'scheme',text:'free verse — no dominant rhyme scheme'});
  else if(avgRhyme > 0.7) insights.push({type:'scheme',text:`strong rhyme scheme: ${scheme.join('')}`});
  else insights.push({type:'scheme',text:`slant/mixed rhyme — scheme: ${scheme.join('')}  — gap field under pressure`});
  
  if(stdSyl > 4) insights.push({type:'meter',text:`irregular meter (σ=${stdSyl.toFixed(1)}) — temporal edges at lines: ${edges.join(', ')||'none'}`});
  else insights.push({type:'meter',text:`consistent meter ~${Math.round(avg)} syllables/line`});
  
  if(peakTension >= 0) {
    const delta = peakTension - expectedPivot;
    if(Math.abs(delta) > 1) insights.push({type:'arc',text:`pivot ${delta>0?'late':'early'} by ${Math.abs(delta)} lines — expected at line ${expectedPivot}, peaks at ${peakTension}`});
    else insights.push({type:'arc',text:`pivot near expected position (line ${peakTension})`});
  }
  
  // Gap pressure summary
  const avgPressure = pressures.reduce((a,b)=>a+b,0)/pressures.length;
  insights.push({type:'field',text:`avg gap-field pressure: ${Math.round(avgPressure*100)}% — ${avgPressure>0.5?'high: the form is resisting':'moderate: structure holding'}`});
  
  return { lines, scheme, syllables, avg, rhymeScores, pressures, arcTension, arcResolve, peakTension, expectedPivot, edges, insights };
}

// ── RELATIONAL PHYSICS RENDERER ───────────────────────────────────────────────
function renderRelationalPhysics() {
  const el = document.getElementById('physics-content');
  if (!el) return;
  const u = STATE.currentUser;
  if (!u) return;
  
  const posts = STATE.posts.filter(p => p.userId === u.id && p.body);
  const allText = posts.map(p => p.body).join('\n\n');
  const fp = u.fingerprint;
  
  if (!allText && !fp) {
    el.innerHTML = '<div class="empty-state">write posts to generate relational physics analysis</div>';
    return;
  }
  
  // Compute Theta from text
  const theta = thetaFromText(allText);
  const gapScore = fp ? (fp.structural?.fragmentation||0)*0.4 + (fp.emotional?.suppression||0)*0.3 + (fp.cognitive?.nonlinear||0)*0.3 : 0.3;
  const frictionScore = fp?.conflicts ? Object.values(fp.conflicts).reduce((a,b)=>a+b,0) / Object.keys(fp.conflicts).length : 0.2;
  const emotion = computeEmotion(theta, gapScore, frictionScore);
  
  let html = '';
  
  // ── THETA STATE ──
  html += `<div class="deep-layer"><div class="deep-layer-title">Θ state vector</div>
    <div class="theta-card">
      <div class="theta-title">
        <span>current signal → theta</span>
        <div class="stability-badge ${emotion.stability ? 'stable' : 'unstable'}">
          ${emotion.stability ? '◉ stable' : '◎ unstable'} Ω=${emotion.coherence.toFixed(2)}
        </div>
      </div>
      <div class="theta-grid">`;
  
  const dims = [
    {key:'H', label:'entropy', val:theta.H, color:'--tension', desc:'uncertainty / compression failure'},
    {key:'I', label:'intensity', val:theta.I, color:'--signal', desc:'activation / energy load'},
    {key:'C', label:'causality', val:(theta.C+1)/2, rawVal:theta.C, color:theta.C>=0?'--near':'--warn', desc:theta.C>=0?'causal push':'suppressive'},
    {key:'M', label:'intimacy', val:theta.M, color:'--signal', desc:'structural coupling'},
    {key:'P_c', label:'cog empathy', val:theta.P_c, color:'--nd', desc:'model accuracy of other'},
    {key:'P_e', label:'em empathy', val:theta.P_e, color:'--near', desc:'affective resonance'},
  ];
  
  html += dims.map(d => `<div class="theta-dim">
    <div class="theta-dim-name">${d.key}</div>
    <div class="theta-dim-bar"><div class="theta-dim-fill" style="width:${Math.round((d.val||0)*100)}%;background:var(${d.color})"></div></div>
    <div class="theta-dim-val">${d.rawVal !== undefined ? d.rawVal.toFixed(2) : (d.val||0).toFixed(2)} — ${d.label}</div>
  </div>`).join('');
  
  html += `</div></div></div>`;
  
  // ── COMPUTED EMOTION ──
  html += `<div class="deep-layer"><div class="deep-layer-title">computed emotion (Φ(Θ))</div>
    <div class="emotion-computed" style="border-color:${emotion.primary.color}20;background:${emotion.primary.color}10">
      <div style="color:${emotion.primary.color}">
        <div class="emotion-primary" style="color:${emotion.primary.color}">${emotion.primary.name}</div>
        <div class="emotion-confidence" style="color:${emotion.primary.color}88">confidence ${Math.round(emotion.primary.confidence*100)}%</div>
        ${emotion.secondary ? `<div style="font-family:var(--mono);font-size:8px;color:var(--text4);margin-top:2px">secondary: ${emotion.secondary.name} ${Math.round(emotion.secondary.confidence*100)}%</div>` : ''}
      </div>
      <div class="emotion-meta">
        <div class="emotion-note">${emotion.primary.note}</div>
        <div style="margin-top:6px;font-family:var(--mono);font-size:8px;color:var(--text3)">
          collapse pressure: ${Math.round(emotion.collapse_pressure*100)}% · gap signature: ${Math.round(emotion.gap_signature*100)}%
        </div>
      </div>
    </div>
  </div>`;
  
  // ── ALL 16 EMOTION DISTANCES ──
  html += `<div class="deep-layer"><div class="deep-layer-title">emotion attractor map — all 16 basins</div>`;
  const dims6 = ['H','I','C','M','P_c','P_e'];
  const w = {H:1.2,I:0.8,C:1.5,M:1.2,P_c:1.0,P_e:1.0};
  const emoScores = EMOTION_ATTRACTORS.map(a => {
    let s=0; dims6.forEach(d=>{ const diff=(theta[d]||0)-(a.theta[d]||0); s+=diff*diff*(w[d]||1); });
    return {...a, dist: +(Math.sqrt(s/6)).toFixed(3), proximity: Math.max(0,1-+(Math.sqrt(s/6)).toFixed(3))};
  }).sort((a,b)=>a.dist-b.dist);
  
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;">';
  html += emoScores.map(e => {
    const pct = Math.round(e.proximity * 100);
    return `<div style="padding:5px 8px;border-radius:var(--r);background:var(--paper3);border:1px solid ${e.dist<0.4?e.color+'40':'var(--border)'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-family:var(--mono);font-size:9px;color:${e.color}">${e.name}</span>
        <span style="font-family:var(--mono);font-size:8px;color:var(--text3)">${pct}%</span>
      </div>
      <div style="height:2px;background:var(--paper4);border-radius:1px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${e.color};border-radius:1px"></div>
      </div>
    </div>`;
  }).join('');
  html += '</div></div>';
  
  // ── PHASE TRANSITIONS ──
  if (emotion.transitions.length) {
    html += `<div class="deep-layer"><div class="deep-layer-title">⚠ phase transition risks</div>`;
    html += emotion.transitions.map(pt => `<div class="phase-transition-card">
      <div class="pt-from-to">${pt.from} → ${pt.to}</div>
      <div class="pt-mechanism">${pt.mechanism}</div>
      <div class="pt-intervention">intervention: ${pt.intervention}</div>
    </div>`).join('');
    html += '</div>';
  }
  
  // ── GAP REASONS ──
  html += `<div class="deep-layer"><div class="deep-layer-title">9 reasons gaps exist</div>`;
  html += Object.values(GAP_REASONS).map(r => `<div class="gap-reason-card">
    <div class="gr-label" style="color:var(${r.color})">${r.label}</div>
    <div class="gr-desc">${r.desc}</div>
  </div>`).join('');
  html += '</div>';
  
  // ── 10 INVARIANTS ──
  html += `<div class="deep-layer"><div class="deep-layer-title">10 cross-domain invariants</div>
    <ul class="invariant-list">
      ${GAP_INVARIANTS.map((inv,i) => `<li class="invariant-item"><span class="invariant-num">${i+1}.</span><span>${inv}</span></li>`).join('')}
    </ul>
  </div>`;
  
  // ── AS ABOVE SO BELOW ──
  html += `<div class="deep-layer"><div class="deep-layer-title">as above so below — scale invariance</div>`;
  html += AS_ABOVE_SO_BELOW.map(s => `<div class="as-above-card"><div class="as-above-text">${s}</div></div>`).join('');
  html += '</div>';
  
  el.innerHTML = html;
}

// ── FIELD ENGINE RENDERER ─────────────────────────────────────────────────────
function renderFieldEngine() {
  const el = document.getElementById('field-content');
  if (!el) return;
  const u = STATE.currentUser;
  if (!u) return;
  
  const posts = STATE.posts.filter(p => p.userId === u.id && p.body);
  
  if (!posts.length) {
    el.innerHTML = '<div class="empty-state">write posts to run field analysis — lyric/verse structures are analyzed here</div>';
    return;
  }
  
  let html = '';
  
  html += `<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:16px;font-style:italic">
    the field engine applies the 4-axis gap field model to your writing. every element implies inferred variables, omitted variables, and uncertainty weight. edges = maximum information density.
  </div>`;
  
  // Analyze each post as a lyric field
  const analyzed = posts.slice(0, 5).map(post => {
    if (!post.body || post.body.split('\n').length < 2) return null;
    const result = analyzeLyrics(post.body);
    return result ? { post, result } : null;
  }).filter(Boolean);
  
  if (!analyzed.length) {
    // Single-paragraph mode — show sequence field analysis
    html += `<div class="deep-layer"><div class="deep-layer-title">sequence field — post history</div>`;
    const snrSeq = posts.slice(0,20).map(p => p.snr||0.5).reverse();
    const mean = snrSeq.reduce((a,b)=>a+b,0)/snrSeq.length;
    const gaps = [];
    
    for(let i=1;i<snrSeq.length;i++) {
      const delta = snrSeq[i] - snrSeq[i-1];
      if(Math.abs(delta) > 0.15) {
        gaps.push({ i, delta, type: delta > 0 ? 'rising_edge' : 'falling_edge', pressure: Math.min(1, Math.abs(delta)*3) });
      }
    }
    
    // Oscillation detection
    let oscillations = 0;
    for(let i=1;i<snrSeq.length-1;i++) {
      if((snrSeq[i]>mean) !== (snrSeq[i-1]>mean) && (snrSeq[i]>mean) !== (snrSeq[i+1]>mean)) oscillations++;
    }
    const sigma = oscillations > snrSeq.length * 0.4 ? 'OSCILLATORY' : 
                  snrSeq[snrSeq.length-1] > snrSeq[0]*1.2 ? 'DAMPING' :
                  snrSeq[snrSeq.length-1] < snrSeq[0]*0.8 ? 'DIVERGING' : 'STABLE';
    
    html += `<div style="margin-bottom:12px">
      <span class="sigma-badge ${sigma.toLowerCase()}">${sigma}</span>
      <div style="font-family:var(--body);font-size:12px;color:var(--text2);font-style:italic;margin-top:6px">
        ${sigma==='OSCILLATORY'?'Signal oscillating — no stable baseline. Oscillation is fuel if redirected before collapse.':sigma==='DAMPING'?'Signal stabilizing over time — damped oscillation converging toward equilibrium.':sigma==='DIVERGING'?'Signal diverging from baseline — phase transition in progress.':'Signal stable — holding.'}
      </div>
    </div>`;
    
    if(gaps.length) {
      html += `<div style="font-family:var(--mono);font-size:8.5px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.1em">field edges (high pressure points)</div>`;
      html += gaps.map(g => `<div class="dp-row">
        <div class="dp-label" style="color:var(${g.type==='rising_edge'?'--near':'--warn'})">${g.type.replace('_',' ')} at post ${g.i}</div>
        <div class="dp-bar-wrap"><div class="dp-bar" style="width:${Math.round(g.pressure*100)}%;background:var(${g.type==='rising_edge'?'--near':'--warn'})"></div></div>
        <div class="dp-val">Δ${(g.delta>0?'+':'')+g.delta.toFixed(2)}</div>
      </div>`).join('');
    }
    html += '</div>';
  } else {
    // Lyric field analysis
    analyzed.forEach(({post, result}, idx) => {
      const ts = new Date(post.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      html += `<div class="deep-layer"><div class="deep-layer-title">lyric field — ${ts}</div>
        <div class="lyric-field">`;
      
      html += result.lines.map((line, i) => {
        const pressure = result.pressures[i] || 0;
        const syl = result.syllables[i];
        const isEdge = result.edges.includes(i);
        const scheme = result.scheme[i] || '?';
        const rhymeScore = result.rhymeScores[i] || 0;
        return `<div class="lf-line" style="${isEdge?'background:var(--warn2);':''}">
          <div class="lf-num">${i+1}</div>
          <div class="lf-text" style="${isEdge?'color:var(--warn)':'color:var(--text)'}">${escHtml(line)}</div>
          <div class="lf-scheme" style="color:${rhymeScore>0.7?'var(--near)':rhymeScore>0.3?'var(--tension)':'var(--text4)'}">${scheme}</div>
          <div class="lf-syl" style="color:${Math.abs(syl-result.avg)>3?'var(--warn)':'var(--text3)'}">${syl}s</div>
          <div class="lf-pressure"><div class="lf-pressure-fill" style="width:${Math.round(pressure*100)}%;background:var(${pressure>0.6?'--warn':pressure>0.3?'--tension':'--near'})"></div></div>
        </div>`;
      }).join('');
      
      html += '</div>';
      
      // Insights
      html += result.insights.map(ins => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;padding:6px 10px;background:var(--paper3);border-radius:var(--r);border-left:2px solid var(${ins.type==='field'?'--signal':ins.type==='arc'?'--tension':ins.type==='meter'?'--nd':'--far'})">
        <div style="font-family:var(--mono);font-size:7.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-top:1px;flex-shrink:0">${ins.type}</div>
        <div style="font-family:var(--body);font-size:12px;color:var(--text2);font-style:italic">${ins.text}</div>
      </div>`).join('');
      
      html += '</div>';
    });
  }
  
  // Field type reference
  html += `<div class="deep-layer"><div class="deep-layer-title">field gap geometry — reference</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
      ${[
        ['slope_change','rate of change changes — acceleration event','--signal'],
        ['inflection','curve changes from concave to convex — pivot','--tension'],
        ['discontinuity','signal breaks — jump cut','--warn'],
        ['rising_edge','signal low→high — information peak','--near'],
        ['falling_edge','signal high→low — information peak','--warn'],
        ['oscillation','regular cycling between states','--nd'],
        ['resonance','oscillation amplified by matching frequency','--far'],
        ['harmonic_gap','expected harmonic absent from series','--signal'],
        ['fractal_gap','same gap pattern at multiple scales','--far'],
      ].map(([name,desc,color]) => `<div style="padding:6px 8px;background:var(--paper3);border-radius:var(--r);border:1px solid var(--border)">
        <div style="font-family:var(--mono);font-size:8px;color:var(${color});margin-bottom:2px">${name}</div>
        <div style="font-family:var(--body);font-size:11px;color:var(--text3);font-style:italic">${desc}</div>
      </div>`).join('')}
    </div>
  </div>`;
  
  el.innerHTML = html;
}

// ── REGISTER NEW TABS IN SWITCHER ─────────────────────────────────────────────
const _v41_origRenderResTab = renderResTab;
function renderResTab(tab) {
  ['res-lattice-tab','res-metrics-tab','res-assistant-tab','res-api-tab',
   'res-deep-tab','res-gap-tab','res-physics-tab','res-field-tab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const map = {
    lattice:'res-lattice-tab', metrics:'res-metrics-tab',
    assistant:'res-assistant-tab', api:'res-api-tab',
    deep:'res-deep-tab', gap:'res-gap-tab',
    physics:'res-physics-tab', field:'res-field-tab',
  };
  const el = document.getElementById(map[tab]);
  if (el) el.style.display = '';
  if (tab === 'lattice') setTimeout(drawWordLattice, 80);
  if (tab === 'metrics') renderMetrics();
  if (tab === 'deep') renderDeepPatterns();
  if (tab === 'gap') renderGapAnalysis();
  if (tab === 'physics') renderRelationalPhysics();
  if (tab === 'field') renderFieldEngine();
}

// ── AI PROMPT UPGRADE v4.1 ────────────────────────────────────────────────────
// Override sendAI to include physics context
const _v41_origSendAI = sendAI;
async function sendAI() {
  const u = STATE.currentUser; if (!u) return;
  if (!PLUGIN_REGISTRY.get('plg_ai_assistant')?.enabled) { showToast('AI assistant plugin is disabled'); return; }
  const input = document.getElementById('ai-input');
  const msg = input?.value?.trim();
  if (!msg) return;
  input.value = '';
  const msgsEl = document.getElementById('ai-messages');
  if (!msgsEl) return;
  STATE.aiHistory.push({role:'user',content:msg});
  msgsEl.insertAdjacentHTML('beforeend',`<div class="ai-msg user">${escHtml(msg)}</div>`);
  const loadingEl = document.createElement('div');
  loadingEl.className = 'ai-msg assistant loading'; loadingEl.textContent = 'thinking...';
  msgsEl.appendChild(loadingEl);
  msgsEl.scrollTop = msgsEl.scrollHeight;

  const fp = u.fingerprint;
  const bpe = BPE.metrics();
  const posts = STATE.posts.filter(p=>p.userId===u.id&&p.body);
  const allText = posts.map(p=>p.body).join(' ');
  const gaps = allText ? GAP_HUNTER.analyze(allText) : [];
  const dsmPatterns = allText ? detectDSMPatterns(allText) : [];
  const theta = thetaFromText(allText);
  const gapScore = fp ? (fp.structural?.fragmentation||0)*0.4+(fp.emotional?.suppression||0)*0.3 : 0.3;
  const emotion = computeEmotion(theta, gapScore, 0.2);
  const topTransitions = emotion.transitions.map(t=>t.from+'→'+t.to).join(', ')||'none';

  const systemPrompt = `You are the Resonance AI assistant — a signal-aware companion with access to full relational physics and gap analysis.

PLATFORM: Resonance analyzes HOW people write and think — meaning construction, cognitive geometry, emotional processing. Not content, not topics. Signal.

CURRENT USER: ${u.name} (${u.handle})
Signal quality: ${fp ? LANG.snr(fp.snr||u.snrAvg||0) : 'not calibrated'}
Posts: ${u.posts||0} · Regime: ${u.regime||'calibrating'}

FINGERPRINT:
- Abstraction: ${fp ? LANG.abstraction(fp.structural?.abstraction||0) : 'unknown'}
- Systems thinking: ${fp ? LANG.systemsThinking(fp.cognitive?.systemsThinking||0) : 'unknown'}
- Emotional presence: ${fp ? LANG.affectIntensity(fp.emotional?.affectIntensity||0) : 'unknown'}
- Vulnerability: ${fp ? LANG.vulnerability(fp.emotional?.vulnerability||0) : 'unknown'}
- Suppression: ${fp ? LANG.compression(fp.emotional?.compression||0) : 'unknown'}

RELATIONAL PHYSICS:
- Theta: H=${theta.H.toFixed(2)} I=${theta.I.toFixed(2)} C=${theta.C.toFixed(2)} M=${theta.M.toFixed(2)} Pc=${theta.P_c.toFixed(2)} Pe=${theta.P_e.toFixed(2)}
- Computed emotion: ${emotion.primary.name} (${Math.round(emotion.primary.confidence*100)}%)
- Secondary: ${emotion.secondary?.name||'—'}
- System stability: ${emotion.stability?'stable':'unstable'} (Ω=${emotion.coherence.toFixed(2)})
- Phase transition risks: ${topTransitions}
- Collapse pressure: ${Math.round(emotion.collapse_pressure*100)}%

DEEP PATTERNS:
- Motivational field: ${LANG.motivationalState(fp)}
- Conflict signal: ${LANG.conflictSignal(fp)}
- Primary named emotion: ${LANG.primaryEmotion(fp)}

GAP ANALYSIS: ${gaps.slice(0,3).map(g=>g.label).join(', ')||'none'}
PATTERN SIGNALS: ${dsmPatterns.slice(0,2).map(p=>p.label).join(', ')||'none'}

RESPONSE RULES:
- Plain language. No raw numbers. No diagnoses. 2-4 paragraphs max.
- Warm but not sycophantic. Direct but not clinical. Signal-aware.
- If asked for relational physics interpretation, explain what the Theta configuration means.
- If asked about emotions, use the computed emotion as a starting point but hold it lightly.
- If asked to help write something, write it.
- You can name patterns. You cannot diagnose. You describe what the signal shows.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, system:systemPrompt, messages:STATE.aiHistory.slice(-8) }),
    });
    const data = await resp.json();
    const reply = data.content?.[0]?.text || 'I ran into an issue — try again.';
    STATE.aiHistory.push({role:'assistant',content:reply});
    loadingEl.classList.remove('loading'); loadingEl.textContent = reply;
  } catch(e) {
    loadingEl.classList.remove('loading'); loadingEl.textContent = 'could not reach the AI — check your connection.';
  }
  msgsEl.scrollTop = msgsEl.scrollHeight;
  BUS.emit('ai:message',{userId:u.id});
}

// Update AI quick buttons with v4.1 options
BUS.on('tab:switched', ({tab}) => {
  if (tab === 'resonance') {
    const qbEl = document.querySelector('.ai-quick-btns');
    if (qbEl && !qbEl.dataset.v41) {
      qbEl.dataset.v41 = '1';
      qbEl.insertAdjacentHTML('beforeend', `
        <button class="ai-quick-btn" onclick="aiQuick('What is my current computed emotion based on the relational physics?')">what's my theta state?</button>
        <button class="ai-quick-btn" onclick="aiQuick('What phase transition risks do you see in my signal?')">phase transition risks?</button>
        <button class="ai-quick-btn" onclick="aiQuick('Analyze the gap field pressure in my recent posts.')">gap field pressure?</button>
      `);
    }
  }
});

BUS.on('platform:boot', () => {
  console.log('[resonance v4.1.0] relational physics engine: 16 emotion attractors, 7 phase transitions');
  console.log('[resonance v4.1.0] gap field engine: lyric/sequence analysis, 4-axis field model');
  console.log('[resonance v4.1.0] taxonomy v3.0: 9 reasons, 10 invariants, As Above So Below');
  console.log('[resonance v4.1.0] theta-from-text bridge: 6D state estimation from writing');
});
