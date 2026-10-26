// ═══════════════════════════════════════════════════════════════════
// RHEON VOICE v7 — app.js
// Orchestrates all engines. Handles speech, LLM mirror, render, storage.
// Depends on (load order):
//   1. codec-engines.js  (RollingStats, FrictionAnalyzer, etc.)
//   2. analysis-engine.js (slopeEngine, resonance, drift, etc.)
//   3. audio-engine.js   (AudioEngine)
//   4. app.js            (this file)
// ═══════════════════════════════════════════════════════════════════

var VERSION = '7.0.0';
var SK      = 'rheon-voice-v7';
var _ec     = 0;

// ── DOMAIN SYSTEM ─────────────────────────────────────────────────
// Each domain adds domain-specific framework patterns and contradiction pairs.
// The 'voice' domain is always active (base patterns).
var DOMAINS = {
  voice:   { label: 'VOICE',   icon: '◈' },
  therapy: { label: 'THERAPY', icon: '⬡' },
  code:    { label: 'CODE',    icon: '⌥' },
  strategy:{ label: 'STRATEGY',icon: '◆' },
  journal: { label: 'JOURNAL', icon: '⊗' }
};
var _activeDomain = 'voice';

// Domain-specific extra framework patterns
var DOMAIN_PATTERNS = {
  therapy: [
    {name:'PROJECTION',   re:/\b(you always|you never|you make me|it'?s your fault|everyone does)\b/i},
    {name:'CATASTROPHIZE',re:/\b(everything is ruined|nothing will work|it'?s hopeless|always happens to me)\b/i},
    {name:'MINIMIZING',   re:/\b(it'?s not a big deal|i'?m fine|i don'?t care|it doesn'?t matter)\b/i},
    {name:'ATTACHMENT',   re:/\b(abandonment|rejection|left alone|nobody cares|no one understands)\b/i}
  ],
  code: [
    {name:'BUG_REASON',   re:/\b(bug|error|exception|crash|null|undefined|infinite loop|race condition)\b/i},
    {name:'DESIGN_DEBT',  re:/\b(hack|workaround|tech debt|temporary|should be refactored|not ideal)\b/i},
    {name:'UNCERTAINTY',  re:/\b(not sure why|don'?t know how|can'?t figure out|mystery|weird)\b/i}
  ],
  strategy: [
    {name:'CONSTRAINT',   re:/\b(can'?t|blocked|limited by|no budget|no time|red tape|politics)\b/i},
    {name:'LEVERAGE',     re:/\b(leverage|multiplier|exponential|compound|flywheel|network effect)\b/i},
    {name:'RISK_FRAME',   re:/\b(risk|downside|upside|asymmetric|hedge|mitigate|exposure)\b/i}
  ],
  journal: [
    {name:'SELF_COMPASSION',re:/\b(i deserve|i'?m allowed|it'?s okay to|be kind to myself|self-care)\b/i},
    {name:'GRATITUDE',    re:/\b(grateful|thankful|appreciate|blessed|fortunate|glad)\b/i},
    {name:'INTENTION',    re:/\b(i want to|my goal|i intend|i commit|i choose|going to try)\b/i}
  ]
};

// ── SESSION STATE ──────────────────────────────────────────────────
var _nodes        = [];
var _wordBank     = {};
var _frames       = {};
var _contras      = [];
var _wpmHistory   = [];
var _lastNodeTs   = null;
var _nodeStartTs  = null;
var _totalWords   = 0;
var _activeTab    = 'bank';
var _selectedWord = null;

// ── SPEECH STATE ──────────────────────────────────────────────────
var _rec          = null;
var _recState     = false;
var _permDenied   = false;
var _interim      = '';
var _micStreamRef = null;  // persistent mic stream — never re-requested while active

// ── AUDIO STATE (raw history for analysis) ─────────────────────────
var _energyHistory  = [];
var _pitchHistory   = [];
var _jitterHistory  = [];
var _MAX_STAT_WIN   = 12;
var _pitchData      = { jitter:0, shimmer:0, hnr:0, prosodyTag:'—' };

// ── SIGNAL STATE ──────────────────────────────────────────────────
var _flowScore        = 0;
var _flowHistory      = [];
var _flowEpisodeStart = null;
var _sigmaState       = { regime:'INSUFFICIENT_DATA', cov:0, slopeFlips:0 };
var _driftState       = { signals:[], clusterCount:0 };
var _resonanceState   = null;
var _receiverGrammar  = null;
var _oscillation      = { period:0, amplitude:0, regularity:0 };
var _nodeSlopeData    = {
  energy: { direction:'flat', momentum:0 },
  res:    { direction:'flat', momentum:0 },
  dysf:   { direction:'flat', momentum:0 }
};

// ── CODEC ENGINE INSTANCES ────────────────────────────────────────
var _frictionEngine   = new FrictionAnalyzer();
var _assocEngine      = new AssociationEngine();
var _predictEngine    = new PredictiveEngine();
var _topologyEngine   = new TopologyEngine();
var _sentimentRolling = new RollingStats(ROLLING_WINDOW);
var _wordCountRolling = new RollingStats(ROLLING_WINDOW);
var _codecBatchN      = 0;

var _lastTopology     = null;
var _lastPrediction   = null;
var _lastWordPrediction = null;
var _lastFriction     = null;
var _lastAssocEdges   = [];
var _lastInvariants   = { words:[] };
var _lastRedundancy   = { redundant:false };

// ── LLM MIRROR ────────────────────────────────────────────────────
var OLLAMA_URL  = 'http://localhost:11434/api/generate';
var LLM_MODEL   = 'mistral:7b';
var ANTH_URL    = 'https://api.anthropic.com/v1/messages';

// ── EXT MIC — PeerJS host receiver ────────────────────────────────
// Receives audio stream + transcript chunks from mic.html clients.
// Architecture: Option C (STT on mic + audio analytics on host).
// §MIC_INTEGRATION §4 Invariants: hash, ICE config, peerId format must
// match mic.html exactly.

var EXT_MIC_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: ['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// FNV-1a + djb2 — MUST be identical algorithm to mic.html micHashPw()
function _vlHashPw(pw) {
  var bytes = [];
  for (var i = 0; i < pw.length; i++) bytes.push(pw.charCodeAt(i));
  var h1 = 2166136261;
  for (var j = 0; j < bytes.length; j++) { h1 ^= bytes[j]; h1 = Math.imul(h1, 16777619) >>> 0; }
  var h2 = 5381;
  for (var k = 0; k < bytes.length; k++) { h2 = (Math.imul(h2, 33) + bytes[k]) >>> 0; }
  var hex = ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  return 'nx_' + hex;
}

function _vlDeriveRoomId(pw) {
  var hash = _vlHashPw(pw);
  return 'NX-' + hash.slice(3, 9).toUpperCase() + '-' + hash.slice(9, 15).toUpperCase();
}

var _extMic = {
  peer:     null,
  conns:    [],       // active data connections [{conn, peerId, recording}]
  calls:    [],       // active audio calls
  streams:  [],       // received MediaStreams
  roomId:   null,
  enabled:  false,
  lastFrame: null,    // most recent audio frame from remote stream
  extAudioProcs: []   // GPGPUAudioProcessor instances on remote streams
};

function extMicInit(password) {
  if (!password) { extMicSetStatus('No password.', 'err'); return; }
  if (typeof Peer === 'undefined') { extMicSetStatus('PeerJS not loaded.', 'err'); return; }

  var roomId = _vlDeriveRoomId(password);
  var hostId = roomId + '-HOST';

  if (_extMic.peer) { try { _extMic.peer.destroy(); } catch(e){} }

  _extMic.roomId  = roomId;
  _extMic.enabled = true;
  _extMic.peer    = new Peer(hostId, { config: EXT_MIC_ICE, debug: 0 });

  _extMic.peer.on('open', function(id) {
    extMicSetStatus('HOST READY — ' + roomId, 'ok');
    var el = document.getElementById('ext-room-id'); if (el) el.textContent = roomId;
  });

  _extMic.peer.on('connection', function(conn) {
    extMicOnDataConn(conn);
  });

  _extMic.peer.on('call', function(call) {
    extMicOnCall(call);
  });

  _extMic.peer.on('error', function(err) {
    extMicSetStatus('PeerJS error: ' + (err.type || err.message), 'err');
    console.error('[extMic] peer error:', err);
  });

  _extMic.peer.on('disconnected', function() {
    extMicSetStatus('Disconnected — reconnecting…', 'warn');
    setTimeout(function() {
      if (_extMic.peer && !_extMic.peer.destroyed) _extMic.peer.reconnect();
    }, 2000);
  });
}

function extMicOnDataConn(conn) {
  var entry = { conn: conn, peerId: conn.peer, recording: false };
  _extMic.conns.push(entry);
  extMicSetStatus('MIC CONNECTED: ' + conn.peer.slice(-10), 'ok');
  extMicUpdateConnList();

  conn.on('data', function(msg) {
    extMicHandleMsg(msg, entry);
  });

  conn.on('close', function() {
    _extMic.conns = _extMic.conns.filter(function(e) { return e.conn !== conn; });
    extMicSetStatus(_extMic.conns.length > 0 ? _extMic.conns.length + ' mic(s) connected' : 'HOST READY — ' + _extMic.roomId, 'ok');
    extMicUpdateConnList();
  });

  // Send current recording state so mic can sync
  if (_recState) {
    try { conn.send({ cmd: 'record_start' }); } catch(e){}
  } else {
    try { conn.send({ cmd: 'state_sync', recording: false }); } catch(e){}
  }
}

function extMicOnCall(call) {
  call.answer(); // no local stream — we just receive
  _extMic.calls.push(call);

  call.on('stream', function(remoteStream) {
    _extMic.streams.push(remoteStream);
    // Wire into AudioEngine as an additional analysis source
    // AudioEngine will process this stream for energy/ZCR/cadence
    // which enriches the next addNode() call from this mic's transcript
    if (AudioEngine.isReady()) {
      AudioEngine.init(remoteStream); // adds gain+analyser source
    }
  });

  call.on('close', function() {
    _extMic.calls = _extMic.calls.filter(function(c) { return c !== call; });
  });
}

function extMicHandleMsg(msg, entry) {
  if (!msg || !msg.cmd) return;
  switch (msg.cmd) {
    case 'transcript':
      // Option C: mic ran STT locally, sends us the final text
      if (msg.text && msg.text.trim().length > 1) {
        var metrics = AudioEngine.isReady() ? AudioEngine.snapshot() : {};
        metrics.source = 'ext-mic';
        metrics.micPeer = entry.peerId;
        addNode(msg.text.trim(), metrics);
      }
      break;
    case 'recording_started':
      entry.recording = true;
      extMicUpdateConnList();
      setStatus('EXT MIC RECORDING', 'on');
      break;
    case 'recording_stopped':
      entry.recording = false;
      extMicUpdateConnList();
      break;
    case 'pong':
      // heartbeat acknowledged
      break;
    default:
      console.log('[extMic] unknown cmd:', msg.cmd);
  }
}

function extMicSyncRecord(isRecording) {
  // When host starts/stops recording, tell all mics
  _extMic.conns.forEach(function(entry) {
    if (!entry.conn || !entry.conn.open) return;
    try { entry.conn.send({ cmd: isRecording ? 'record_start' : 'record_stop' }); } catch(e){}
  });
}

function extMicDisconnect() {
  _extMic.conns.forEach(function(e) { try { e.conn.close(); } catch(e2){} });
  _extMic.calls.forEach(function(c) { try { c.close(); } catch(e2){} });
  if (_extMic.peer) { try { _extMic.peer.destroy(); } catch(e){} _extMic.peer = null; }
  _extMic.conns = []; _extMic.calls = []; _extMic.streams = [];
  _extMic.enabled = false;
  extMicSetStatus('Disconnected.', '');
  extMicUpdateConnList();
}

function extMicSetStatus(text, type) {
  var el = document.getElementById('ext-mic-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'ok' ? 'var(--p)' : type === 'err' ? 'var(--red)' : type === 'warn' ? 'var(--amber)' : 'var(--text2)';
}

function extMicUpdateConnList() {
  var el = document.getElementById('ext-mic-conns');
  if (!el) return;
  if (_extMic.conns.length === 0) {
    el.innerHTML = '<div class="no-item">no mics connected</div>';
    return;
  }
  el.innerHTML = _extMic.conns.map(function(e) {
    return '<div style="font-size:var(--fs-xs);padding:3px 0;border-bottom:1px solid var(--border);color:var(--text2)">' +
      '<span style="color:' + (e.recording ? 'var(--p)' : 'var(--text3)') + '">●</span> ' +
      e.peerId.slice(-14) +
      (e.recording ? ' <span style="color:var(--p)">REC</span>' : '') +
      '</div>';
  }).join('');
}
var _llmQueue   = [];
var _llmRunning = false;
var _useAnthAPI = true;

// ── UTILITIES ─────────────────────────────────────────────────────
function uid()    { _ec++; return 'rv7-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,5)+'-'+_ec; }
function esc(t)   { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtTs(ms){ var d=new Date(ms); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }
function pad(n)   { return n.toString().padStart(2,'0'); }
function fmtDelta(ms){
  if(!ms||ms<200) return '';
  if(ms<1000)  return Math.round(ms)+'ms';
  if(ms<60000) return (ms/1000).toFixed(1)+'s';
  return Math.floor(ms/60000)+'m'+Math.round((ms%60000)/1000)+'s';
}
function fmtDur(ms){
  if(!ms||ms<1000) return '<1s';
  if(ms<60000) return Math.round(ms/1000)+'s';
  return Math.floor(ms/60000)+'m'+Math.round((ms%60000)/1000)+'s';
}

// ── DOMAIN ────────────────────────────────────────────────────────
function setDomain(domain) {
  if (!DOMAINS[domain]) return;
  _activeDomain = domain;
  document.querySelectorAll('.domain-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.domain === domain);
  });
  setStatus('DOMAIN: ' + DOMAINS[domain].label, '');
}

function getDomainPatterns() {
  var base = DOMAIN_PATTERNS[_activeDomain] || [];
  return base; // framework patterns are in addition to base FRAMEWORK_PATTERNS
}

function detectAllFrameworks(text) {
  var found = detectFrameworks(text, _frames);
  // Domain-specific patterns
  var domainPats = getDomainPatterns();
  for (var i = 0; i < domainPats.length; i++) {
    var p = domainPats[i], m = text.match(p.re);
    if (m) {
      found.push({name: '['+_activeDomain.toUpperCase()+'] '+p.name, example: m[0].trim()});
      var fullName = _activeDomain + ':' + p.name;
      if (!_frames[fullName]) _frames[fullName] = {count:0, examples:[]};
      _frames[fullName].count++;
      if (_frames[fullName].examples.length < 3) _frames[fullName].examples.push(text.slice(0,60));
    }
  }
  return found;
}

// ── ADD NODE — central pipeline ───────────────────────────────────
function addNode(text, audioMetrics) {
  try {
    if (!text || text.trim().length < 3) return;
    text = text.trim();
    var ts = Date.now();
    audioMetrics = audioMetrics || {};

    // Text analysis
    updateWordBank(text, _wordBank);
    var tags       = extractTags(text, _wordBank);
    var wordCount  = tok(text).length;
    _totalWords   += wordCount;
    var silenceDelta = _lastNodeTs ? (ts - _lastNodeTs) : null;
    _lastNodeTs    = ts;

    // WPM
    var wpm = 0;
    if (_nodeStartTs) {
      var dur = (ts - _nodeStartTs) / 1000 / 60;
      if (dur > 0) wpm = Math.round(wordCount / dur);
    }
    _nodeStartTs = null;
    if (wpm > 0 && wpm < 400) {
      _wpmHistory.push(wpm);
      if (_wpmHistory.length > 20) _wpmHistory.shift();
    }
    var medWpm = _wpmHistory.length ? Math.round(_wpmHistory.reduce(function(a,b){return a+b;},0)/_wpmHistory.length) : 0;

    // Signal scoring
    // GAPS.md #1: scoreDysfluencyFused uses AudioEngine's real-time acoustic
    // dysfluency (ZCR spike / pitch discontinuity / mid-utterance silence)
    // fused 60/40 with lexical pattern analysis. Falls back to the plain
    // lexical+ZCR scorer if no acoustic snapshot came through (e.g. ext mic
    // nodes before Option-C audio metrics arrive).
    var dysfluency = (typeof audioMetrics.acousticDysfluency === 'number')
      ? scoreDysfluencyFused(text, audioMetrics.acousticDysfluency)
      : scoreDysfluency(text, audioMetrics.zcr || 0);
    var coherence  = scoreCoherence(text, _nodes);
    var frameworks = detectAllFrameworks(text);
    var contras    = detectContradictions(text, _nodes);
    var connected  = findConnectedNodes(text, _nodes);

    // Codec pipeline
    _codecBatchN++;
    var batchId    = 'B' + String(_codecBatchN).padStart(4,'0');
    var sentiment  = scoreSentiment(text);
    _sentimentRolling.measure(sentiment);
    _wordCountRolling.measure(wordCount);

    _lastFriction    = _frictionEngine.analyze(text);
    _lastAssocEdges  = _assocEngine.add(batchId, text);
    _lastRedundancy  = _assocEngine.redundancyCheck(text);
    _lastInvariants  = _assocEngine.invariants();

    var codecTags = [];
    if (_lastFriction && _lastFriction.friction) codecTags.push('FRICTION');
    if (/blocked?|stuck|can't|cannot|unable/.test(text))        codecTags.push('BLOCK');
    if (/again|same|every time|always|keep/.test(text))         codecTags.push('LOOP');
    if (/gap|missing|unknown|don'?t know|unclear/.test(text))   codecTags.push('GAP');
    if (/connect(?:ed|s)?|link(?:ed|s)?|relat(?:e|es|ed)/.test(text)) codecTags.push('REL');
    if (!codecTags.length) codecTags.push('SYS');

    _lastPrediction      = _predictEngine.predictTag();
    _lastWordPrediction  = _predictEngine.predictWords();
    _predictEngine.feed(codecTags, text);

    _lastTopology = _topologyEngine.feed({
      sentiment:  sentiment,
      friction:   _lastFriction ? _lastFriction.score : 0,
      wordCount:  wordCount,
      text:       text,
      batchId:    batchId,
      ts:         ts,
      energy:     audioMetrics.amplitude || null,
      cadence:    null
    }, _assocEngine);

    var node = {
      id:             uid(), eventTs: _ec, ts: ts,
      text:           text, wordCount: wordCount, silenceDelta: silenceDelta,
      wpm:            wpm,  wpmDelta: medWpm > 0 ? wpm - medWpm : 0,
      pitch:          audioMetrics.pitch       || null,
      amplitude:      audioMetrics.amplitude   || null,
      spectralCentroid: audioMetrics.spectralCentroid || null,
      zcr:            audioMetrics.zcr         || null,
      dysfluencyScore: dysfluency,
      coherenceScore:  coherence,
      frameworks:     frameworks.map(function(f){ return f.name; }),
      contradictions: contras.map(function(c){ return c.wA+'/'+c.wB; }),
      tags:           tags, codecTags: codecTags,
      mirror:         '', connectedTo: connected,
      resonanceScore: null, resonanceClass: null,
      sentiment:      sentiment,
      frictionScore:  _lastFriction ? _lastFriction.score : 0,
      topologyState:  _lastTopology ? _lastTopology.composite.state : null,
      assocEdgeCount: _lastAssocEdges.length,
      redundant:      _lastRedundancy ? _lastRedundancy.redundant : false,
      domain:         _activeDomain
    };

    contras.forEach(function(c) {
      var evt = {id:uid(), ts:ts, desc:'Said "'+c.wA+'" — previously said "'+c.wB+'"', wordA:c.wA, wordB:c.wB, nodeId:node.id, prevNodeId:c.prevId, prevText:c.prevText};
      _contras.push(evt); renderContra(evt);
    });

    _nodes.push(node);

    // Pitch engine
    if (audioMetrics.pitch)    { _pitchHistory.push(audioMetrics.pitch);    if (_pitchHistory.length>20) _pitchHistory.shift(); }
    if (audioMetrics.amplitude){ _jitterHistory.push(audioMetrics.amplitude);if (_jitterHistory.length>20) _jitterHistory.shift(); }
    if (_pitchHistory.length>=4 && _jitterHistory.length>=4) {
      _pitchData = pitchEngine(_pitchHistory, _jitterHistory);
    }

    // Flow
    _flowScore = computeFlowScore(_nodes, _wpmHistory, _contras);
    var isFlow = _flowScore >= 60;
    if (isFlow && !_flowEpisodeStart) _flowEpisodeStart = Date.now();
    else if (!isFlow && _flowEpisodeStart) {
      var dur2 = Date.now() - _flowEpisodeStart;
      if (dur2 >= 10000) { _flowHistory.push({ts:_flowEpisodeStart, score:_flowScore, duration:dur2}); if(_flowHistory.length>50)_flowHistory.shift(); }
      _flowEpisodeStart = null;
    }

    // Update all signal state
    _updateSignalState(node);

    // Debounced save (avoids blocking on every utterance)
    _scheduleSave();

    renderNode(node);
    updateStats();
    _renderWordBankThrottled();
    updateFramePanel();
    updateFlowUI();
    updateMeterNode(node);
    scrollBottom();
    enqueueMirror(node);

  } catch(e) { console.error('[addNode] error:', e); }
}

function _updateSignalState(node) {
  if (node.amplitude) {
    _energyHistory.push(node.amplitude);
    if (_energyHistory.length > _MAX_STAT_WIN) _energyHistory.shift();
  }
  if (_energyHistory.length >= 4) {
    _sigmaState = stabilityEngine(_energyHistory);
    AudioEngine.setSigmaRegime(_sigmaState.regime);
    updateSigmaUI(_sigmaState);
  }
  if (_nodes.length >= 5) {
    _oscillation = oscillationEngine(_nodes.slice(-12).map(function(n){return n.coherenceScore||0.5;}));
    updateOscillationUI(_oscillation);
  }
  if (_nodes.length >= 4) {
    _nodeSlopeData.energy = slopeEngine(_nodes.slice(-8).map(function(n){return n.amplitude||0;}));
    _nodeSlopeData.res    = slopeEngine(_nodes.slice(-8).map(function(n){return n.resonanceScore||0.5;}));
    _nodeSlopeData.dysf   = slopeEngine(_nodes.slice(-8).map(function(n){return n.dysfluencyScore||0;}));
    updateSlopeUI();
  }
  _driftState    = driftEngine(_nodes, _energyHistory, _contras);
  _resonanceState = computeResonance(node, _nodes.slice(0, -1));
  if (_resonanceState) {
    updateResonanceUI(_resonanceState);
    node.resonanceScore = _resonanceState.score;
    node.resonanceClass = _resonanceState.classification;
  }
  _receiverGrammar = detectReceiverGrammar(_nodes);
  if (_receiverGrammar) updateReceiverGrammarUI(_receiverGrammar);
  updateTopologyUI(_lastTopology);
  if (_activeTab === 'signals') updateDriftUI(_driftState);
}

// ── METER UPDATE (from node data) ─────────────────────────────────
function updateMeterNode(node) {
  var dysP = node.dysfluencyScore * 100;
  var jP   = Math.min(100, _pitchData.jitter * 800);
  setMeter('jitter', jP, _pitchData.jitter > 0 ? _pitchData.jitter.toFixed(3) : '—', 'amber');
  setMeter('dysfl',  dysP, node.dysfluencyScore.toFixed(2), 'red');
  var hnrEl = document.getElementById('osc-hnr');
  if (hnrEl) hnrEl.textContent = _pitchData.hnr > 0 ? _pitchData.hnr.toFixed(2) : '—';
}

function setMeter(id, pct, val, cls) {
  var b = document.getElementById('m-' + id);
  var v = document.getElementById('mv-' + id);
  if (b) { b.style.width = Math.max(0, Math.min(100, pct)) + '%'; if(cls) b.className = 'meter-bar ' + cls; }
  if (v) v.textContent = val;
}

// ── SIGNAL UIs ────────────────────────────────────────────────────
function updateSigmaUI(state) {
  var el     = document.getElementById('sig-regime-name');
  var prog   = document.getElementById('sig-prog-fill');
  var strip  = document.getElementById('regime-strip-fill');
  var badge  = document.getElementById('regime-badge');
  var stEl   = document.getElementById('st-regime');
  var detail = document.getElementById('sig-regime-detail');
  var c      = REGIME_COLORS[state.regime] || 'var(--text3)';
  var pct    = {STABLE:20,ACTIVATING:38,UNGROUNDED:52,DYSREGULATED:72,OSCILLATORY:65,COLLAPSING:88,OFFLINE:100,INSUFFICIENT_DATA:5}[state.regime] || 5;
  if (el)    { el.textContent = state.regime; el.style.color = c; }
  if (prog)  { prog.style.width = pct+'%'; prog.style.background = c; }
  if (strip) { strip.style.width = '100%'; strip.style.background = c; }
  if (detail) detail.textContent = state.regime !== 'INSUFFICIENT_DATA' ? 'CoV '+state.cov.toFixed(2)+' · '+state.slopeFlips+' flips' : '';
  if (stEl)  { stEl.textContent = state.regime; stEl.style.color = c; }
  if (badge) {
    var show = state.regime !== 'STABLE' && state.regime !== 'INSUFFICIENT_DATA';
    badge.style.display = show ? '' : 'none';
    badge.textContent   = state.regime;
    badge.style.color   = c;
    badge.style.borderColor = c;
  }
}

function updateSlopeUI() {
  function setSlopeRow(spId, svId, sd) {
    var bar = document.getElementById(spId), val = document.getElementById(svId);
    var pct = Math.max(5, Math.min(95, 50 + sd.slope * 500));
    var c   = sd.direction==='rising' ? 'var(--p)' : sd.direction==='falling' ? 'var(--red)' : 'var(--text2)';
    if (bar) { bar.style.width = pct+'%'; bar.style.background = c; }
    if (val) { val.textContent = (sd.slope>0?'+':'')+sd.slope.toFixed(3)+' '+sd.direction; val.style.color = c; }
  }
  setSlopeRow('sp-energy','sv-energy', _nodeSlopeData.energy);
  setSlopeRow('sp-res',   'sv-res',    _nodeSlopeData.res);
  setSlopeRow('sp-dysf',  'sv-dysf',   _nodeSlopeData.dysf);
  var spark = document.getElementById('spark-energy');
  if (spark && _energyHistory.length > 1) {
    var maxE = Math.max.apply(null, _energyHistory) || 0.001;
    spark.innerHTML = _energyHistory.map(function(v) {
      var h = Math.max(2, (v/maxE)*18);
      var col = v>maxE*0.7?'var(--red)':v>maxE*0.4?'var(--amber)':'var(--p)';
      return '<div class="spark-bar" style="height:'+h+'px;background:'+col+'"></div>';
    }).join('');
  }
}

function updateOscillationUI(osc) {
  function setBar(id, vid, val, max) {
    var b = document.getElementById(id), v = document.getElementById(vid);
    if (b) b.style.width = Math.min(100, (val/max)*100)+'%';
    if (v) v.textContent = val > 0 ? val : '—';
  }
  setBar('sp-osc-per','sv-osc-per', osc.period, 10);
  setBar('sp-osc-amp','sv-osc-amp', osc.amplitude, 0.5);
  setBar('sp-osc-reg','sv-osc-reg', osc.regularity, 1);
}

function updateDriftUI(drift) {
  var list = document.getElementById('drift-list');
  var stEl = document.getElementById('st-drift');
  if (stEl) stEl.textContent = drift.clusterCount;
  if (!list) return;
  list.innerHTML = drift.signals.length === 0
    ? '<div class="no-item">no drift detected</div>'
    : drift.signals.map(function(s) {
        return '<div class="drift-item"><div class="di-type">'+s.type+'</div><div>score '+s.score.toFixed(2)+' · conf '+s.confidence.toFixed(2)+'</div></div>';
      }).join('');
  var clC = document.getElementById('drift-cluster-container');
  if (clC) {
    clC.innerHTML = drift.clusterCount >= 3
      ? '<div class="drift-cluster-alert"><div class="dca-label">⚠ DRIFT CLUSTER DETECTED</div><div class="dca-desc">'+drift.clusterCount+' co-occurring signals</div></div>'
      : '';
  }
}

var RESON_CLASS_COLORS = {
  HARMONIC_STABILITY:'var(--p)', GROWTH_FRICTION:'var(--amber)',
  ASYNCHRONOUS_DRIFT:'var(--purple)', VOLATILE_COUPLING:'var(--red)',
  LOW_INTERACTION_FIELD:'var(--text2)'
};

function updateResonanceUI(r) {
  var cls   = document.getElementById('res-class');
  var score = document.getElementById('res-score-big');
  var axes  = document.getElementById('res-axes');
  var mBar  = document.getElementById('m-res');
  var mVal  = document.getElementById('mv-res');
  var c     = RESON_CLASS_COLORS[r.classification] || 'var(--text2)';
  if (cls)   { cls.textContent = r.classification.replace(/_/g,' '); cls.style.color = c; }
  if (score) { score.textContent = (r.score*100).toFixed(0)+'%'; score.style.color = c; }
  if (mBar)  mBar.style.width = (r.score*100)+'%';
  if (mVal)  mVal.textContent = (r.score*100).toFixed(0)+'%';
  if (axes) {
    axes.innerHTML = Object.keys(r.axes).map(function(k) {
      var v = r.axes[k];
      return '<div class="sig-row"><div class="sig-row-lbl">'+k.toUpperCase()+'</div>'+
        '<div class="sig-row-bar"><div class="sig-row-fill" style="width:'+(v*100)+'%;background:'+c+'"></div></div>'+
        '<div class="sig-row-val">'+v.toFixed(2)+'</div></div>';
    }).join('');
  }
}

function updateReceiverGrammarUI(rg) {
  var el = document.getElementById('receiver-grammar');
  if (!el) return;
  el.style.display = '';
  var mode = document.getElementById('rg-mode');
  var det  = document.getElementById('rg-detail');
  if (mode) mode.textContent = rg.mode;
  if (det)  det.textContent  = rg.desc + '\nT:'+rg.scores.think+' F:'+rg.scores.feel+' S:'+rg.scores.somatic;
}

var TOPO_STATE_COLORS = {
  CALIBRATING:'var(--text3)', STABLE:'var(--p)',
  BASELINE_ALERT:'var(--amber)', POLARIZED:'var(--purple)'
};

function updateTopologyUI(topo) {
  if (!topo) return;
  var stateEl = document.getElementById('topo-state');
  var evidEl  = document.getElementById('topo-evidence');
  var polEl   = document.getElementById('topo-polarity');
  var arcEl   = document.getElementById('topo-arc');
  var flipEl  = document.getElementById('topo-flips');
  var warmEl  = document.getElementById('topo-warmup');
  var invEl   = document.getElementById('topo-invariants');
  var predEl  = document.getElementById('topo-prediction');
  var wPredEl = document.getElementById('topo-word-pred');
  var frEl    = document.getElementById('topo-friction');
  var redEl   = document.getElementById('topo-redundant');
  var mBar    = document.getElementById('m-topo');
  var mVal    = document.getElementById('mv-topo');

  var state   = topo.composite ? topo.composite.state : 'CALIBRATING';
  var c       = TOPO_STATE_COLORS[state] || 'var(--text3)';

  if (stateEl) { stateEl.textContent = state; stateEl.style.color = c; }
  if (mBar) { var pct = {CALIBRATING:12,STABLE:28,POLARIZED:62,BASELINE_ALERT:88}[state]||12; mBar.style.width=pct+'%'; mBar.style.background=c; }
  if (mVal) { mVal.textContent = state.slice(0,6); mVal.style.color = c; }

  if (topo.baseline && !topo.baseline.locked) {
    var prog = Math.round((topo.baseline.warmupProgress||0)*100);
    if (warmEl) warmEl.textContent = 'CALIBRATING… '+prog+'%';
    if (evidEl) evidEl.textContent = '';
  } else {
    if (warmEl) warmEl.textContent = 'BASELINE LOCKED';
    if (evidEl && topo.composite) evidEl.textContent = (topo.composite.evidence||[]).join(' · ');
  }

  if (topo.polarity) {
    var pol = topo.polarity;
    if (polEl) { polEl.textContent = pol.label.toUpperCase(); polEl.style.color = pol.label==='positive'?'var(--p)':pol.label==='negative'?'var(--red)':'var(--text3)'; }
    if (arcEl) { arcEl.textContent = pol.sessionArc; arcEl.style.color = pol.sessionArc==='improving'?'var(--p)':pol.sessionArc==='declining'?'var(--red)':'var(--text3)'; }
    if (flipEl) flipEl.textContent = pol.flipCount + ' flips';
  }
  if (invEl) {
    var inv = _lastInvariants && _lastInvariants.words;
    invEl.textContent = (inv && inv.length > 0) ? inv.slice(0,8).join(', ') : 'none yet';
  }
  if (predEl) predEl.textContent = _lastPrediction && _lastPrediction.predicted ? '→ '+_lastPrediction.predicted : '—';
  if (wPredEl) wPredEl.textContent = _lastWordPrediction && _lastWordPrediction.top3 ? _lastWordPrediction.top3.map(function(w){return w.word;}).join(', ') : '—';
  if (frEl) {
    var ft = _lastFriction ? (_lastFriction.types || []) : [];
    frEl.textContent = ft.length ? ft.join(', ') : 'none';
    frEl.style.color = ft.length ? 'var(--amber)' : 'var(--text3)';
  }
  if (redEl) {
    redEl.textContent = _lastRedundancy && _lastRedundancy.redundant ? '⚡ '+(_lastRedundancy.phrases||[]).join(', ') : 'none';
    redEl.style.color = _lastRedundancy && _lastRedundancy.redundant ? 'var(--red)' : 'var(--text3)';
  }
}

function updateFlowUI() {
  setMeter('flow', _flowScore, _flowScore+'%', 'flow');
  var stEl = document.getElementById('st-flow');
  var dot  = document.getElementById('live-dot');
  if (stEl) stEl.textContent = _flowScore+'%';
  AudioEngine.setFlowScore(_flowScore);
  if (_recState && dot) dot.className = 'live-dot'+(_flowScore>=60?' flow':' on');
  if (_activeTab === 'flow') updateFlowPanel();
}

function updateFlowPanel() {
  var scoreEl = document.getElementById('fp-score');
  var metaEl  = document.getElementById('fp-meta');
  var histEl  = document.getElementById('flow-history');
  if (scoreEl) scoreEl.textContent = _flowScore+'%';
  if (metaEl) {
    var isF = _flowScore >= 60, lines = [];
    var epDur = _flowEpisodeStart ? fmtDur(Date.now() - _flowEpisodeStart) : null;
    if (isF && epDur) lines.push('IN FLOW for '+epDur);
    else if (_flowScore >= 40) lines.push('Approaching flow state.');
    else lines.push('Not in flow state.');
    lines.push('Score: '+_flowScore+'/100');
    if (_flowHistory.length > 0) {
      var tot = _flowHistory.reduce(function(s,e){return s+e.duration;},0);
      lines.push('Total flow time: '+fmtDur(tot));
    }
    metaEl.textContent = lines.join('\n');
    metaEl.style.whiteSpace = 'pre';
  }
  if (histEl) {
    if (_flowHistory.length === 0) { histEl.innerHTML = '<div class="no-item">no flow episodes yet</div>'; return; }
    histEl.innerHTML = _flowHistory.slice().reverse().map(function(ep) {
      return '<div class="flow-hist-item'+(ep.score>=75?' peak':'')+'">'+
        '<span class="fhi-ts">'+fmtTs(ep.ts)+'</span>'+
        '<span class="fhi-dur">'+fmtDur(ep.duration)+'</span>'+
        '<span class="fhi-score">'+Math.round(ep.score)+'%</span></div>';
    }).join('');
  }
}

// ── LLM MIRROR ────────────────────────────────────────────────────
function enqueueMirror(node) { _llmQueue.push(node); if (!_llmRunning) _processLLMQueue(); }
function flushLLMQueue()     { _llmQueue = []; _llmRunning = false; }

function _processLLMQueue() {
  if (_llmQueue.length === 0) { _llmRunning = false; return; }
  _llmRunning = true;
  var node = _llmQueue.shift();
  _streamMirror(node, function() { _processLLMQueue(); });
}

function _buildMirrorPrompt(node) {
  var ctx = _nodes.slice(-5,-1).map(function(n){return n.text;}).join(' ');
  var topoMeta = _lastTopology && _lastTopology.composite ? '\nTopology: '+_lastTopology.composite.state : '';
  var frMeta   = _lastFriction && _lastFriction.types && _lastFriction.types.length ? '\nFriction: '+_lastFriction.types.join(', ') : '';
  var domMeta  = _activeDomain !== 'voice' ? '\nDomain: '+DOMAINS[_activeDomain].label : '';
  return (ctx ? 'Recent context: '+ctx+'\n\n' : '')+
    'Speaker just said: '+node.text+'\n'+
    'Dysfluency: '+node.dysfluencyScore.toFixed(2)+' · Coherence: '+node.coherenceScore.toFixed(2)+
    (node.resonanceClass ? '\nResonance: '+node.resonanceClass : '')+
    (_sigmaState.regime !== 'INSUFFICIENT_DATA' ? '\nSigma: '+_sigmaState.regime : '')+
    topoMeta + frMeta + domMeta + '\n\n'+
    'You are a precision translator mirror. Reflect exactly what the speaker said — cleaner, more precise language. '+
    'Strip fillers, repetition, and hedges. Keep meaning exact. '+
    (_activeDomain==='therapy' ? 'Apply empathetic, non-diagnostic reflection. ' : '')+
    (_activeDomain==='code' ? 'Use technical precision. Mirror the problem statement. ' : '')+
    (_activeDomain==='strategy' ? 'Mirror strategic framing. Keep causal logic intact. ' : '')+
    'If sigma is DYSREGULATED or COLLAPSING, add one brief grounding phrase in [brackets]. '+
    'Do not add interpretation or advice. Output one short paragraph.';
}

function _streamMirror(node, onDone) {
  var el = document.getElementById('mirror-'+node.id);
  if (!el) { if (onDone) onDone(); return; }
  el.className = 'node-mirror streaming';
  el.textContent = '';
  if (_useAnthAPI) _streamAnth(node, el, onDone);
  else _streamOllama(node, el, onDone);
}

function _streamAnth(node, el, onDone) {
  var prompt = _buildMirrorPrompt(node), acc = '';
  fetch(ANTH_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json','anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true' },
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:160, stream:true, messages:[{role:'user',content:prompt}] })
  }).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    var ob = document.getElementById('offline-badge'); if (ob) ob.className = 'offline-badge';
    el.className = 'node-mirror streaming api-mirror';
    var reader = resp.body.getReader(), dec = new TextDecoder();
    function read() {
      return reader.read().then(function(chunk) {
        if (chunk.done) { el.className='node-mirror api-mirror'; node.mirror=acc; _scheduleSave(); if(onDone)onDone(); return; }
        dec.decode(chunk.value).split('\n').forEach(function(line) {
          if (!line.startsWith('data:')) return;
          var data = line.slice(5).trim(); if (data==='[DONE]') return;
          try { var p=JSON.parse(data); if(p.type==='content_block_delta'&&p.delta&&p.delta.text){acc+=p.delta.text;el.textContent=acc;} } catch(e){}
        });
        return read();
      });
    }
    return read();
  }).catch(function() { _useAnthAPI = false; _streamOllama(node, el, onDone); });
}

function _streamOllama(node, el, onDone) {
  var prompt = _buildMirrorPrompt(node), acc = '';
  fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ model:LLM_MODEL, prompt:prompt, stream:true, options:{temperature:0.1,num_predict:140} })
  }).then(function(resp) {
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    var ob = document.getElementById('offline-badge'); if (ob) ob.className = 'offline-badge';
    var reader = resp.body.getReader(), dec = new TextDecoder();
    function read() {
      return reader.read().then(function(chunk) {
        if (chunk.done) { el.className='node-mirror'; node.mirror=acc; _scheduleSave(); if(onDone)onDone(); return; }
        dec.decode(chunk.value).split('\n').forEach(function(line) {
          if (!line.trim()) return;
          try { var p=JSON.parse(line); if(p.response){acc+=p.response;el.textContent=acc;} } catch(e){}
        });
        return read();
      });
    }
    return read();
  }).catch(function() {
    var local = offlineMirror(node.text); node.mirror = local;
    el.className = 'node-mirror offline-mirror'; el.textContent = local;
    var ob = document.getElementById('offline-badge'); if (ob) ob.className = 'offline-badge show';
    _scheduleSave(); if (onDone) onDone();
  });
}

// ── SPEECH ENGINE ─────────────────────────────────────────────────
function buildRecognizer() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  var rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US'; rec.maxAlternatives = 1;

  rec.onstart = function() {
    _permDenied = false;
    hidePermBanner(); updateRecUI(true); setStatus('LISTENING','on'); _nodeStartTs = Date.now();
  };
  rec.onresult = function(event) {
    var interim = '', final = '';
    for (var i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) final  += event.results[i][0].transcript;
      else                          interim += event.results[i][0].transcript;
    }
    if (interim) {
      _interim = interim;
      var ib = document.getElementById('interim-box'); if (ib) ib.textContent = interim;
      updateLiveInterim(interim);
    }
    if (final && final.trim().length > 1) {
      var ib2 = document.getElementById('interim-box'); if (ib2) ib2.textContent = '—';
      clearLiveInterim(); _interim = '';
      var m = AudioEngine.isReady() ? AudioEngine.snapshot() : {};
      addNode(final, m);
      _nodeStartTs = Date.now();
    }
  };
  rec.onerror = function(event) {
    if (event.error==='no-speech' || event.error==='aborted') return;
    if (event.error==='not-allowed'||event.error==='audio-capture'||event.error==='service-not-allowed') {
      _permDenied = true; _recState = false; showPermBanner(); updateRecUI(false); setStatus('MIC DENIED','err'); return;
    }
    console.warn('[speech] error:', event.error);
  };
  rec.onend = function() {
    if (_recState && !_permDenied) {
      _rec = buildRecognizer();
      if (!_rec) { _recState=false; updateRecUI(false); setStatus('SPEECH API GONE','err'); return; }
      try { _rec.start(); setStatus('LISTENING','on'); }
      catch(e) { console.warn('[speech] restart failed:', e.message); _recState=false; updateRecUI(false); setStatus('RESTART FAILED','err'); }
    } else {
      if (!_permDenied) setStatus('READY','');
      updateRecUI(false);
    }
  };
  return rec;
}

function toggleRecord() { if (_recState) stopRec(); else startRec(); }

// GAPS.md #3 — proxy for the gain slider oninput handler in index.html.
function setInputGain(value) {
  var g = AudioEngine.setInputGain(value);
  var db = AudioEngine.getInputGainDb();
  var lbl = document.getElementById('gain-val');
  if (lbl) lbl.textContent = (db >= 0 ? '+' : '') + db + 'dB';
  return g;
}

function startRec() {
  if (_permDenied) { showPermBanner(); return; }
  if (_recState)   return;

  // If we already have a live stream and AudioContext, just restart recognizer
  if (AudioEngine.isReady() && _micStreamRef && _micStreamRef.active) {
    if (AudioEngine._ctx && AudioEngine._ctx.state === 'suspended') {
      AudioEngine._ctx.resume().catch(function(){});
    }
    _rec = buildRecognizer();
    if (!_rec) { setStatus('USE CHROME FOR VOICE', 'err'); return; }
    _recState = true;
    AudioEngine.isRecording = true;
    extMicSyncRecord(true);
    updateRecUI(true);
    try {
      _rec.start();
    } catch(e) {
      console.error('[speech] start failed:', e);
      _recState = false; AudioEngine.isRecording = false;
      extMicSyncRecord(false);
      updateRecUI(false); setStatus('START FAILED', 'err');
    }
    return;
  }

  // First time or after stream died — request mic
  setStatus('REQUESTING MIC…', '');

  // Max-sensitivity constraints: disable all processing that attenuates signal
  var constraints = {
    audio: {
      echoCancellation:  false,
      noiseSuppression:  false,
      autoGainControl:   false,
      sampleRate:        { ideal: 48000 },
      channelCount:      { ideal: 1 },
      latency:           { ideal: 0 }
    },
    video: false
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .catch(function() {
      // Fallback: if browser rejects advanced constraints, try minimal
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    })
    .then(function(stream) {
      _micStreamRef = stream;
      AudioEngine.init(stream);

      _rec = buildRecognizer();
      if (!_rec) {
        setStatus('USE CHROME FOR VOICE', 'err');
        return;
      }

      _recState = true;
      AudioEngine.isRecording = true;
      extMicSyncRecord(true);
      updateRecUI(true);

      try {
        _rec.start();
      } catch(e) {
        console.error('[speech] start failed:', e);
        _recState = false; AudioEngine.isRecording = false;
        extMicSyncRecord(false);
        updateRecUI(false); setStatus('START FAILED', 'err');
      }
    })
    .catch(function(e) {
      _permDenied = true;
      showPermBanner();
      setStatus('MIC DENIED', 'err');
      console.error('[speech] getUserMedia denied:', e);
    });
}

function stopRec() {
  _recState = false;
  AudioEngine.isRecording = false;
  extMicSyncRecord(false);

  // Flush any buffered interim text as a final node
  if (_interim && _interim.trim().length > 2) {
    var m = AudioEngine.isReady() ? AudioEngine.snapshot() : {};
    addNode(_interim, m);
    _interim = '';
  }

  var ib = document.getElementById('interim-box');
  if (ib) ib.textContent = '—';
  clearLiveInterim();

  // Stop recognizer — keep the mic stream alive for instant restart
  if (_rec) { try { _rec.stop(); } catch(e){} _rec = null; }

  updateRecUI(false);
  setStatus('READY', '');

  if (_flowEpisodeStart) {
    var dur = Date.now() - _flowEpisodeStart;
    if (dur >= 10000) {
      _flowHistory.push({ ts: _flowEpisodeStart, score: _flowScore, duration: dur });
      if (_flowHistory.length > 50) _flowHistory.shift();
      _scheduleSave();
    }
    _flowEpisodeStart = null;
  }
  updateFlowPanel();
}

function retryMic() {
  _permDenied = false;
  // Kill existing stream so startRec does a fresh getUserMedia
  if (_micStreamRef) {
    _micStreamRef.getTracks().forEach(function(t) { try { t.stop(); } catch(e){} });
    _micStreamRef = null;
  }
  hidePermBanner();
  setStatus('READY', '');
  startRec();
}

// ── RENDER ────────────────────────────────────────────────────────
function updateLiveInterim(text) {
  var el = document.getElementById('live-interim');
  if (!el) {
    el = document.createElement('div');
    el.id = 'live-interim'; el.className = 'interim-node';
    el.innerHTML = '<div class="interim-text" id="live-interim-text"></div><div class="cursor-blink"></div>';
    var t = document.getElementById('transcript'); if (t) t.appendChild(el);
  }
  var textEl = document.getElementById('live-interim-text'); if (textEl) textEl.textContent = text;
  scrollBottom();
}
function clearLiveInterim() { var el = document.getElementById('live-interim'); if (el) el.remove(); }

function updateRecUI(isRec) {
  var btn = document.getElementById('rec-btn-main');
  var dot = document.getElementById('live-dot');
  if (btn) {
    btn.classList.toggle('recording', isRec);
    var gem  = btn.querySelector('.rec-gem');
    var label= btn.querySelector('.rec-label');
    if (label) label.textContent = isRec ? 'STOP' : 'RECORD';
  }
  if (dot && !isRec) dot.className = 'live-dot'+(_permDenied?' err':'');
}
function showPermBanner() { var b = document.getElementById('perm-banner'); if (b) b.className = 'perm-banner show'; }
function hidePermBanner() { var b = document.getElementById('perm-banner'); if (b) b.className = 'perm-banner'; }
function setStatus(text, type) {
  var el  = document.getElementById('status-txt');
  var dot = document.getElementById('live-dot');
  if (el) { el.textContent = text; el.className = type==='on'?'on':type==='err'?'err':''; }
  if (dot && !_permDenied && !_recState) dot.className = 'live-dot'+(type==='on'?' on':type==='err'?' err':'');
}

function renderNode(node) {
  var t = document.getElementById('transcript'); if (!t) return;
  var es = document.getElementById('empty-state'); if (es) es.style.display = 'none';

  var isContra  = node.contradictions && node.contradictions.length > 0;
  var isDrift   = node.coherenceScore < 0.12 && _nodes.length > 3;
  var isLoop    = node.coherenceScore > 0.88 && _nodes.length > 3;
  var isFlow    = _flowScore >= 60;
  var hasFrame  = node.frameworks && node.frameworks.length > 0;
  var isSuppress= node.frameworks && node.frameworks.indexOf('SUPPRESSION') > -1;

  var cls = 'node';
  if (isContra || node.topologyState==='BASELINE_ALERT') cls += ' has-contra';
  else if (isDrift) cls += ' drift';
  else if (isLoop || node.redundant) cls += ' loop';
  else if (isSuppress) cls += ' suppressed';
  else if (hasFrame) cls += ' has-frame';
  if (isFlow) cls += ' flow-node';

  var dStr  = fmtDelta(node.silenceDelta);
  var dCls  = 'node-delta'; if (node.silenceDelta>12000) dCls+=' vlong'; else if (node.silenceDelta>4000) dCls+=' long';
  var nIdx  = _nodes.indexOf(node) + 1;
  var resC  = node.resonanceClass ? (RESON_CLASS_COLORS[node.resonanceClass]||'var(--text2)') : 'var(--text3)';
  var topoC = node.topologyState  ? (TOPO_STATE_COLORS[node.topologyState]||'var(--text3)')  : 'var(--text3)';
  var domIcon = _activeDomain !== 'voice' ? '<span style="font-size:10px;color:var(--text3);margin-left:3px">'+DOMAINS[_activeDomain].icon+'</span>' : '';

  var h = '<div class="'+cls+'" id="node-'+esc(node.id)+'">';
  h += '<div class="node-head">';
  h += '<div class="node-idx">'+String(nIdx).padStart(3,'0')+'</div>';
  h += '<div class="node-ts">'+fmtTs(node.ts)+'</div>';
  h += domIcon;
  if (dStr) h += '<div class="'+dCls+'">Δ '+esc(dStr)+'</div>';
  if (node.wpm > 0) h += '<div class="node-wpm">'+node.wpm+' wpm</div>';
  if (node.resonanceScore !== null) h += '<div class="node-res" style="border-color:'+resC+';color:'+resC+'">ρ '+(node.resonanceScore*100).toFixed(0)+'%</div>';
  if (node.topologyState && node.topologyState !== 'CALIBRATING' && node.topologyState !== 'STABLE') h += '<div class="node-res" style="border-color:'+topoC+';color:'+topoC+'">⊕ '+esc(node.topologyState)+'</div>';
  if (isFlow) h += '<div class="node-flow-badge">◈ FLOW '+_flowScore+'%</div>';
  h += '</div>';
  h += '<div class="node-text">'+esc(node.text)+'</div>';

  var sigHtml = '';
  if (node.contradictions) node.contradictions.forEach(function(c){ sigHtml += '<div class="sig-tag contra">⚡ CONTRA: '+esc(c)+'</div>'; });
  if (node.frameworks) node.frameworks.forEach(function(f){ sigHtml += '<div class="sig-tag frame">◆ '+esc(f)+'</div>'; });
  if (node.dysfluencyScore > 0.3) sigHtml += '<div class="sig-tag stutter">DYSFL '+node.dysfluencyScore.toFixed(2)+'</div>';
  if (isDrift)  sigHtml += '<div class="sig-tag drift">↗ DRIFT</div>';
  if (isLoop)   sigHtml += '<div class="sig-tag loop">↻ LOOP</div>';
  if (isFlow)   sigHtml += '<div class="sig-tag flow">◈ FLOW</div>';
  if (_pitchData.prosodyTag === 'stressed') sigHtml += '<div class="sig-tag jitter">JITTER '+_pitchData.jitter.toFixed(3)+'</div>';
  if (node.resonanceClass) sigHtml += '<div class="sig-tag regime" style="border:1px solid '+resC+';color:'+resC+'">'+node.resonanceClass.replace(/_/g,' ')+'</div>';
  if (_driftState && _driftState.clusterCount >= 3) sigHtml += '<div class="sig-tag drift-cluster">⚠ DRIFT×'+_driftState.clusterCount+'</div>';
  if (_sigmaState.regime==='DYSREGULATED'||_sigmaState.regime==='COLLAPSING') sigHtml += '<div class="sig-tag stutter" style="border-color:var(--red);color:var(--red)">'+_sigmaState.regime+'</div>';
  if (node.codecTags && node.codecTags.indexOf('FRICTION')>-1 && _lastFriction && _lastFriction.types.length) sigHtml += '<div class="sig-tag cogload">⚡ '+esc(_lastFriction.types.join('/'))+'</div>';
  if (node.redundant) sigHtml += '<div class="sig-tag loop">↻ REDUNDANT</div>';
  if (node.assocEdgeCount > 0) sigHtml += '<div class="sig-tag harm">⟷ '+node.assocEdgeCount+' ASSOC</div>';
  if (node.topologyState === 'BASELINE_ALERT') sigHtml += '<div class="sig-tag contra">⊕ BASELINE ALERT</div>';
  if (node.topologyState === 'POLARIZED') sigHtml += '<div class="sig-tag drift" style="border-color:var(--purple);color:var(--purple)">⊕ POLARIZED</div>';

  if (sigHtml) h += '<div class="node-signals">'+sigHtml+'</div>';
  if (node.tags && node.tags.length) {
    h += '<div class="node-tags">';
    node.tags.forEach(function(tag){ h += '<div class="w-tag" onclick="filterByTag(\''+esc(tag)+'\')">'+esc('#'+tag)+'</div>'; });
    h += '</div>';
  }
  h += '<div class="node-mirror-lbl">▶ MIRROR</div>';
  h += '<div class="node-mirror'+(node.mirror?'':' streaming')+'" id="mirror-'+esc(node.id)+'">'+( node.mirror ? esc(node.mirror) : '' )+'</div>';
  h += '</div>';

  var existing = document.getElementById('node-'+node.id);
  if (existing) {
    var el2 = document.createElement('div'); el2.innerHTML = h;
    t.replaceChild(el2.firstChild, existing);
  } else {
    var el3 = document.createElement('div'); el3.innerHTML = h;
    var liveEl = document.getElementById('live-interim');
    if (liveEl) t.insertBefore(el3.firstChild, liveEl); else t.appendChild(el3.firstChild);
  }
}

function renderAll() {
  var t = document.getElementById('transcript'); if (!t) return;
  t.innerHTML = '';
  if (_nodes.length === 0) {
    t.innerHTML = '<div class="empty-state" id="empty-state"><div class="empty-glyph">▋▋▋</div><div class="empty-t">SILENCE</div><div class="empty-s">PRESS RECORD — EXTERNALIZE YOUR THINKING</div></div>';
    return;
  }
  _nodes.forEach(renderNode); scrollBottom();
}

function renderContra(evt) {
  var cl = document.getElementById('contra-list'); if (!cl) return;
  var ni = cl.querySelector('.no-item'); if (ni) ni.remove();
  var div = document.createElement('div'); div.className = 'contra-item';
  div.innerHTML = '<div class="contra-head"><span class="contra-ts">'+fmtTs(evt.ts)+'</span><span class="contra-type">CONTRA</span></div>'+
    '<div class="contra-desc">'+esc(evt.desc)+'</div>'+
    (evt.prevText ? '<div class="contra-quote">prev: \u201c'+esc(evt.prevText)+'\u201d</div>' : '');
  cl.insertBefore(div, cl.firstChild);
}

function renderAllContras() {
  var cl = document.getElementById('contra-list'); if (!cl) return;
  cl.innerHTML = _contras.length ? '' : '<div class="no-item">no contradictions yet</div>';
  _contras.slice().reverse().forEach(renderContra);
}

// Throttled word bank render — max 1/sec
var _wbTimer = null;
function _renderWordBankThrottled() {
  if (_wbTimer) return;
  _wbTimer = setTimeout(function() { _wbTimer = null; renderWordBank(); }, 1000);
}

function renderWordBank() {
  var bc = document.getElementById('bank-chips'); if (!bc) return;
  var top = Object.keys(_wordBank)
    .filter(function(w){ return _wordBank[w].count >= 1; })
    .sort(function(a,b){ return _wordBank[b].count - _wordBank[a].count; })
    .slice(0, 40);
  if (top.length === 0) { bc.innerHTML = '<div class="no-item">no words yet</div>'; return; }
  bc.innerHTML = top.map(function(w) {
    var sel = w === _selectedWord ? ' selected' : '';
    return '<div class="bchip'+sel+'" onclick="selectBankWord(\''+esc(w)+'\')">'+esc(w)+'<span class="bc">'+_wordBank[w].count+'</span></div>';
  }).join('');
}

function selectBankWord(word) {
  _selectedWord = _selectedWord === word ? null : word;
  renderWordBank();
  if (_selectedWord) showCoOccur(_selectedWord);
  else { var co = document.getElementById('co-occur'); if (co) co.style.display = 'none'; }
}

function showCoOccur(word) {
  var wb = _wordBank[word]; if (!wb) return;
  var co = wb.coOccurs, top = Object.keys(co).sort(function(a,b){return co[b]-co[a];}).slice(0,12);
  var coS = document.getElementById('co-occur'), coW = document.getElementById('co-word'), coR = document.getElementById('co-row');
  if (!coS || !coR) return;
  if (coW) coW.textContent = word;
  coR.innerHTML = top.map(function(w2){ return '<div class="co-chip" onclick="filterByTag(\''+esc(w2)+'\')">'+esc(w2)+'</div>'; }).join('');
  coS.style.display = top.length > 0 ? 'block' : 'none';
}

function updateFramePanel() {
  var fl = document.getElementById('frame-list'); if (!fl) return;
  var names = Object.keys(_frames).sort(function(a,b){ return _frames[b].count - _frames[a].count; });
  if (names.length === 0) { fl.innerHTML = '<div class="no-item">listening for structure\u2026</div>'; return; }
  fl.innerHTML = names.map(function(name) {
    var f = _frames[name], ex = f.examples[0] || '';
    return '<div class="frame-item">'+
      '<div class="frame-type">'+esc(name)+'</div>'+
      '<div class="frame-count">'+f.count+' occurrence'+(f.count!==1?'s':'')+'</div>'+
      (ex ? '<div class="frame-ex">\u201c'+esc(ex.slice(0,55))+(ex.length>55?'\u2026':'')+'\u201d</div>' : '')+
      '</div>';
  }).join('');
}

function updateStats() {
  function s(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  s('st-nodes', _nodes.length); s('st-words', _totalWords); s('st-contra', _contras.length);
  var rw = _wpmHistory.slice(-5);
  s('st-wpm', rw.length ? Math.round(rw.reduce(function(a,b){return a+b;},0)/rw.length) : '—');
  var nc = document.getElementById('node-counter'); if (nc) nc.textContent = _nodes.length+' NODES';
}

function scrollBottom() { var t = document.getElementById('transcript'); if (t) t.scrollTop = t.scrollHeight; }

function switchTab(tab) {
  _activeTab = tab;
  ['bank','signals','contra','flow','resonance','topology','extmic'].forEach(function(t) {
    var te = document.getElementById('rtab-'+t), pe = document.getElementById('panel-'+t);
    if (te) te.className = 'rtab'+(t===tab?' active':'');
    if (pe) pe.className = 'panel'+(t===tab?' active':'');
  });
  if (tab==='bank')      renderWordBank();
  if (tab==='signals')   { updateFramePanel(); updateDriftUI(_driftState); updateSlopeUI(); }
  if (tab==='contra')    renderAllContras();
  if (tab==='flow')      updateFlowPanel();
  if (tab==='resonance') { if (_resonanceState) updateResonanceUI(_resonanceState); if (_receiverGrammar) updateReceiverGrammarUI(_receiverGrammar); }
  if (tab==='topology')  updateTopologyUI(_lastTopology);
}

function filterNodes() {
  var q = (document.getElementById('search-in').value || '').toLowerCase().trim();
  document.querySelectorAll('.node').forEach(function(el) {
    el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) > -1) ? '' : 'none';
  });
}
function filterByTag(tag) { var si = document.getElementById('search-in'); if (si) { si.value = tag; filterNodes(); } }
function openSearch()     { var si = document.getElementById('search-in'); if (si) si.focus(); }

// ── STORAGE — debounced to avoid blocking ─────────────────────────
var _saveTimer = null;
function _scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(function() { _saveTimer = null; save(); }, 2000);
}

function save() {
  var payload;
  try { payload = JSON.stringify({v:VERSION,ec:_ec,nodes:_nodes,wordBank:_wordBank,frames:_frames,contras:_contras,flowHistory:_flowHistory,domain:_activeDomain}); }
  catch(e) { return; }
  if (window.storage) {
    try { var r = window.storage.set(SK, payload); if (r && typeof r.catch==='function') r.catch(function(){}); } catch(e){}
    return;
  }
  try { localStorage.setItem(SK, payload); } catch(e){}
}

function load(cb) {
  function parse(raw) {
    if (!raw) { if (cb) cb(); return; }
    try {
      var d = JSON.parse(raw);
      if (d.nodes)       _nodes      = d.nodes;
      if (d.wordBank)    _wordBank   = d.wordBank;
      if (d.frames)      _frames     = d.frames;
      if (d.contras)     _contras    = d.contras;
      if (d.flowHistory) _flowHistory= d.flowHistory;
      if (d.ec)          _ec         = d.ec;
      if (d.domain)      _activeDomain = d.domain;
      _totalWords = _nodes.reduce(function(s,n){return s+(n.wordCount||0);},0);
      _wpmHistory = _nodes.filter(function(n){return n.wpm>0;}).map(function(n){return n.wpm;}).slice(-20);
      _lastNodeTs = _nodes.length > 0 ? _nodes[_nodes.length-1].ts : null;
    } catch(e){}
    if (cb) cb();
  }
  if (window.storage) {
    try {
      var r = window.storage.get(SK);
      if (r && typeof r.then==='function') r.then(function(res){parse(res&&res.value?res.value:null);}).catch(function(){if(cb)cb();});
      else parse(r && r.value ? r.value : null);
    } catch(e){ if(cb) cb(); }
    return;
  }
  try { parse(localStorage.getItem(SK)); } catch(e){ if(cb) cb(); }
}

function clearStorage(cb) {
  _nodes=[]; _wordBank={}; _frames={}; _contras=[]; _flowHistory=[]; _wpmHistory=[];
  _totalWords=0; _lastNodeTs=null; _nodeStartTs=null;
  _flowScore=0; _flowEpisodeStart=null;
  _energyHistory=[]; _pitchHistory=[]; _jitterHistory=[];
  _sigmaState={regime:'INSUFFICIENT_DATA',cov:0,slopeFlips:0};
  _driftState={signals:[],clusterCount:0};
  _resonanceState=null; _receiverGrammar=null;
  _lastTopology=null; _lastPrediction=null; _lastWordPrediction=null;
  _lastFriction=null; _lastAssocEdges=[]; _lastInvariants={words:[]}; _lastRedundancy={redundant:false};
  _frictionEngine.reset(); _assocEngine.reset(); _predictEngine.reset(); _topologyEngine.reset();
  _sentimentRolling.clear(); _wordCountRolling.clear(); _codecBatchN=0;
  resetFlowSamples();
  flushLLMQueue();
  if (window.storage) {
    try { var r = window.storage.delete(SK); if (r && typeof r.then==='function') r.then(function(){if(cb)cb();}).catch(function(){if(cb)cb();}); else if(cb) cb(); } catch(e){ if(cb) cb(); }
    return;
  }
  try { localStorage.removeItem(SK); } catch(e){}
  if (cb) cb();
}

function exportSession() {
  if (_nodes.length === 0) { alert('Nothing to export.'); return; }
  var data = JSON.stringify({
    version:VERSION, exportedAt:new Date().toISOString(), domain:_activeDomain,
    nodes:_nodes, wordBank:_wordBank, frames:_frames, contras:_contras,
    flowHistory:_flowHistory, sigmaHistory:_energyHistory,
    resonance:_resonanceState, receiverGrammar:_receiverGrammar,
    topology:_lastTopology, invariants:_lastInvariants,
    stats:{nodes:_nodes.length, words:_totalWords, contras:_contras.length, codecBatches:_codecBatchN}
  }, null, 2);
  var a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,'+encodeURIComponent(data);
  a.download = 'rheon-voice-v7-'+_activeDomain+'-'+Date.now()+'.json';
  a.click();
}

function clearSession() {
  if (!confirm('Clear all session data?')) return;
  if (_recState) stopRec();
  clearStorage(function() {
    renderAll(); renderWordBank(); renderAllContras(); updateFramePanel(); updateStats(); updateFlowPanel();
    updateSigmaUI({regime:'INSUFFICIENT_DATA',cov:0,slopeFlips:0});
    updateDriftUI({signals:[],clusterCount:0});
    updateTopologyUI(null);
    setStatus('CLEARED','');
  });
}

// ── KEYBOARD ──────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); openSearch(); }
  if (e.key===' ' && document.activeElement===document.body) { e.preventDefault(); toggleRecord(); }
});

// ── CLOCK ─────────────────────────────────────────────────────────
function updateClock() { var el = document.getElementById('topbar-clock'); if (el) el.textContent = fmtTs(Date.now()); }
setInterval(updateClock, 1000); updateClock();

// ── INIT ──────────────────────────────────────────────────────────
// AudioEngine.init() is NOT called here — only on first getUserMedia grant.
// But we still start the oscilloscope in idle mode (draws breathing line).
// This is safe because AudioEngine.isReady() returns false until stream granted.

load(function() {
  if (_nodes.length > 0) _lastNodeTs = _nodes[_nodes.length-1].ts;
  setDomain(_activeDomain);
  renderAll(); renderAllContras(); renderWordBank(); updateFramePanel(); updateStats(); updateFlowPanel();
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    setStatus('USE CHROME FOR VOICE','err');
    var btn = document.getElementById('rec-btn-main'); if (btn) btn.disabled = true;
  } else {
    setStatus('READY','');
  }
  if (_nodes.length > 0) setStatus('SESSION RESTORED — '+_nodes.length+' NODES','');
  // Start idle oscilloscope
  setTimeout(function() { AudioEngine.init && typeof AudioEngine._startOscOnce === 'function' ? AudioEngine._startOscOnce() : null; }, 100);
});
