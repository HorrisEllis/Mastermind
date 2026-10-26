// ═══════════════════════════════════════════════════════════════════
// RHEON VOICE v7 — audio-engine.js
// Manages: AudioContext, AnalyserNode, oscilloscope canvas, meters.
//
// FIXES vs v6:
//   - Canvas sized via ResizeObserver — no stale W/H closure
//   - ctx.scale() reset on every resize, not just init
//   - Oscilloscope draws downsampled (max 512 pts) for clean waveform
//   - getPitch() result cached per RAF frame — no double-compute
//   - startOscilloscope() fully idempotent (cancels previous RAF)
//   - Canvas height set programmatically (110px logical)
//
// Public API:
//   AudioEngine.init(stream)      — call once per getUserMedia grant
//   AudioEngine.snapshot()        → { pitch, amplitude, zcr, spectralCentroid,
//                                      loudness, spectralFlux, pitchStability,
//                                      acousticDysfluency, voicedState }
//   AudioEngine.teardown()        — hard kill, page-unload only
//   AudioEngine.setFlowScore(n)
//   AudioEngine.setSigmaRegime(r)
//   AudioEngine.setInputGain(v)   — 1..32, UI slider. Default 8 (+18dB).
//   AudioEngine.getInputGainDb()  → current gain in dB, for UI label
//   AudioEngine.isRecording       — writable property
//
// MERGED FROM v4.2 LINE (GAPS.md #1, #3 — 2026-08-01):
//   loudness/spectralFlux/pitchStability/acousticDysfluency/voicedState
//   and setInputGain were present in v4.2 (__1_/__2_), dropped in v5-v7.
// ═══════════════════════════════════════════════════════════════════

var AudioEngine = (function() {

  // ── private ──────────────────────────────────────────────────
  var _ctx        = null;
  var _analyser   = null;
  var _freqBuf    = null;
  var _timeBuf    = null;
  var _micStream  = null;
  var _meterLoop  = null;
  var _oscRAF     = null;
  var _isRec      = false;
  var _flowScore  = 0;
  var _regime     = 'INSUFFICIENT_DATA';

  // Cached per-frame values (computed once per RAF, read by snapshot)
  var _cachedPitch = 0;
  var _cachedRMS   = 0;
  var _cachedZCR   = 0;
  var _cachedSC    = 0;
  var _lastCacheMs = 0;
  var CACHE_TTL    = 50; // ms

  // Canvas state — owned by ResizeObserver, never captured in closure
  var _canvas = null;
  var _ctx2d  = null;
  var _canW   = 0;
  var _canH   = 0;
  var _dpr    = 1;

  // Ring buffer
  var _ringRec = null;
  var _RING_MS = 120000;

  // Gain — user-adjustable, calibrated for classifyFrame() thresholds below
  var _gainNode  = null;
  var _userGain  = 8; // 8x = +18dB default, matches v4.2 acoustic calibration

  // Acoustic dysfluency fusion state (merged from v4.2 line — GAPS.md #1)
  var _prevFreqBuf      = null;  // for spectral flux
  var _acousticDysFluency = 0;
  var _lastAcousticTs   = Date.now();
  var _inSilence        = false;
  var _silenceStartTs   = 0;
  var _lastSoundTs      = Date.now();
  var _silenceHistory   = [];
  var _zcrHistory        = [];
  var _pitchVarBuf       = [];   // recent voiced pitches, for stability CoV
  var _vuHistory         = [];   // voiced/unvoiced/silence rolling window
  var _vuState           = 'silence';

  // Cached acoustic values (refreshed alongside pitch/rms/zcr/sc)
  var _cachedLoudness         = -Infinity;
  var _cachedSpectralFlux     = 0;
  var _cachedPitchStability   = 0.5;
  var _cachedAcousticDysfluency = 0;
  var _cachedVoicedState      = 'silence';

  // ── public ───────────────────────────────────────────────────
  var pub = {};

  Object.defineProperty(pub, 'isRecording', {
    get: function() { return _isRec; },
    set: function(v) { _isRec = !!v; }
  });

  pub.setFlowScore  = function(n) { _flowScore = n; };
  pub.setSigmaRegime= function(r) { _regime    = r; };
  pub.isReady       = function() { return _ctx !== null && _analyser !== null; };

  // ── gain control — callable from UI slider (1x–32x) ────────────
  // GAPS.md #3: was hardcoded 4.0. Restored as user control, default
  // raised to 8x (+18dB) to match classifyFrame()'s calibrated thresholds.
  pub.setInputGain = function(value) {
    _userGain = Math.max(1, Math.min(32, Number(value) || 1));
    if (_gainNode) _gainNode.gain.value = _userGain;
    return _userGain;
  };
  pub.getInputGainDb = function() { return Math.round(20 * Math.log10(_userGain)); };

  // ── init ─────────────────────────────────────────────────────
  // Safe to call multiple times with same or new stream.
  // Each call replaces the source node but reuses the AudioContext.
  pub.init = function(stream) {
    _micStream = stream;

    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {
        console.error('[AudioEngine] AudioContext failed:', e);
        return;
      }
    }

    // Always resume — browsers suspend on page load
    if (_ctx.state === 'suspended') _ctx.resume().catch(function(){});

    if (!_analyser) {
      _analyser = _ctx.createAnalyser();
      _analyser.fftSize               = 2048;
      _analyser.smoothingTimeConstant = 0.6; // faster response
      _freqBuf = new Float32Array(_analyser.frequencyBinCount);
      _timeBuf = new Float32Array(_analyser.fftSize);
      _startMeterLoop();
      _startOscilloscope();
    }

    try {
      // GainNode — user-adjustable via setInputGain(), default 8x (+18dB).
      // Does not cause clipping in the waveform display (analyser is read-only).
      var src = _ctx.createMediaStreamSource(stream);
      _gainNode = _ctx.createGain();
      _gainNode.gain.value = _userGain;
      src.connect(_gainNode);
      _gainNode.connect(_analyser);
      // Do NOT connect to destination — no speaker feedback
    } catch(e) {
      console.error('[AudioEngine] source connect failed:', e);
      return;
    }

    _startRingBuffer(stream);
  };

  // ── stopStream — kill mic tracks without closing AudioContext ─
  pub.stopStream = function() {
    if (_micStream) {
      _micStream.getTracks().forEach(function(t) { try { t.stop(); } catch(e){} });
      _micStream = null;
    }
    if (_ringRec) { try { _ringRec.stop(); } catch(e){} _ringRec = null; }
  };

  // ── snapshot — cheap, reads cache ────────────────────────────
  pub.snapshot = function() {
    _refreshCache();
    return {
      pitch:              _cachedPitch,
      amplitude:          _cachedRMS,
      zcr:                _cachedZCR,
      spectralCentroid:   _cachedSC,
      // Fused acoustic signals — GAPS.md #1
      loudness:           _cachedLoudness,
      spectralFlux:       _cachedSpectralFlux,
      pitchStability:     _cachedPitchStability,
      acousticDysfluency: _cachedAcousticDysfluency,
      voicedState:        _cachedVoicedState
    };
  };

  // ── teardown — hard kill, page unload only ────────────────────
  pub.teardown = function() {
    if (_meterLoop) { clearInterval(_meterLoop); _meterLoop = null; }
    if (_oscRAF)    { cancelAnimationFrame(_oscRAF); _oscRAF = null; }
    if (_ringRec)   { try { _ringRec.stop(); } catch(e){} _ringRec = null; }
    if (_micStream) { _micStream.getTracks().forEach(function(t){ t.stop(); }); _micStream = null; }
    if (_ctx)       { try { _ctx.close(); } catch(e){} _ctx = null; }
    _analyser = null; _freqBuf = null; _timeBuf = null;
    _canvas = null; _ctx2d = null;
    _gainNode = null; _prevFreqBuf = null;
    _acousticDysFluency = 0; _inSilence = false;
    _silenceHistory = []; _zcrHistory = []; _pitchVarBuf = []; _vuHistory = [];
  };

  // ── cache refresh ─────────────────────────────────────────────
  function _refreshCache() {
    var now = Date.now();
    if (now - _lastCacheMs < CACHE_TTL) return;
    _lastCacheMs = now;
    if (!_analyser || !_timeBuf) return;
    _analyser.getFloatTimeDomainData(_timeBuf);
    _cachedPitch = _computePitch();
    _cachedRMS   = _computeRMS();
    _cachedZCR   = _computeZCR();
    _cachedSC    = _computeSpectralCentroid();

    // Fused acoustic signals — GAPS.md #1
    _cachedVoicedState        = _classifyFrame(_cachedRMS, _cachedZCR);
    _cachedLoudness           = _computeLoudness();
    _cachedSpectralFlux       = _computeSpectralFlux();
    if (_cachedPitch > 0) {
      _pitchVarBuf.push(_cachedPitch);
      if (_pitchVarBuf.length > 12) _pitchVarBuf.shift();
    }
    _cachedPitchStability      = _computePitchStability();
    _cachedAcousticDysfluency  = _updateAcousticDysfluency(_cachedRMS, _cachedZCR, _cachedPitch);
  }

  // ── voiced/unvoiced/silence classifier ──────────────────────────
  // Thresholds calibrated for signal AFTER pre-gain. At the +18dB (8x)
  // default: silence < -72dBFS, speech > -45dBFS.
  function _classifyFrame(rms, zcr) {
    var state;
    var energyDb = rms > 0 ? 20 * Math.log10(rms) : -120;
    if (energyDb < -72) {
      state = 'silence';
    } else if (zcr > 0.18 && energyDb < -35) {
      state = 'unvoiced'; // fricatives
    } else {
      state = 'voiced';
    }
    _vuHistory.push(state);
    if (_vuHistory.length > 8) _vuHistory.shift();
    var counts = { voiced: 0, unvoiced: 0, silence: 0 };
    _vuHistory.forEach(function(s) { counts[s]++; });
    _vuState = Object.keys(counts).reduce(function(a, b) { return counts[a] >= counts[b] ? a : b; });
    return _vuState;
  }

  // ── perceptual loudness — A-weighted (IEC 61672 approximation) ──
  function _computeLoudness() {
    if (!_analyser || !_freqBuf) return -Infinity;
    _analyser.getFloatFrequencyData(_freqBuf);
    var sr = _ctx ? _ctx.sampleRate : 44100;
    var nyq = sr / 2;
    var binWidth = nyq / _freqBuf.length;
    var weightedSum = 0, totalWeight = 0;
    for (var i = 1; i < _freqBuf.length; i++) {
      var f = i * binWidth;
      var f2 = f * f, f4 = f2 * f2;
      var aWeight = (12194 * 12194 * f4) /
        ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
      var mag = Math.pow(10, _freqBuf[i] / 20);
      weightedSum += aWeight * mag * aWeight * mag;
      totalWeight += aWeight * aWeight;
    }
    if (totalWeight === 0) return -Infinity;
    var weighted = Math.sqrt(weightedSum / totalWeight);
    return weighted > 0 ? 20 * Math.log10(weighted) : -Infinity;
  }

  // ── spectral flux — detects abrupt phoneme changes ──────────────
  function _computeSpectralFlux() {
    if (!_analyser || !_freqBuf) return 0;
    // _freqBuf already populated by _computeLoudness this cache cycle
    if (!_prevFreqBuf) { _prevFreqBuf = _freqBuf.slice(); return 0; }
    var flux = 0;
    for (var i = 0; i < _freqBuf.length; i++) {
      var d = _freqBuf[i] - _prevFreqBuf[i];
      flux += d > 0 ? d : 0; // half-wave rectified
    }
    _prevFreqBuf = _freqBuf.slice();
    return flux / _freqBuf.length;
  }

  // ── pitch stability — coefficient of variation of recent F0 ─────
  // Low CoV = stable prosody = higher fluency signal.
  function _computePitchStability() {
    if (_pitchVarBuf.length < 6) return 0.5; // not enough data
    var mean = _pitchVarBuf.reduce(function(a, b) { return a + b; }, 0) / _pitchVarBuf.length;
    var variance = _pitchVarBuf.reduce(function(a, b) { return a + (b - mean) * (b - mean); }, 0) / _pitchVarBuf.length;
    var cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    return Math.max(0, Math.min(1, 1 - (cv - 0.05) / 0.35));
  }

  // ── acoustic dysfluency — real-time, three signals fused ────────
  //   1. ZCR spike (glottal stops / stutter onset)
  //   2. Pitch discontinuity (abrupt F0 jump mid-utterance)
  //   3. Mid-utterance silence (pause 200ms–2s within a phrase)
  // Decays exponentially toward 0 absent new evidence.
  function _updateAcousticDysfluency(rms, zcr, pitch) {
    var now = Date.now();
    var dt = (now - _lastAcousticTs) / 1000;
    _lastAcousticTs = now;
    _acousticDysFluency *= Math.pow(0.85, dt * 5);

    var voiced = rms > 0.003; // calibrated for post-gain signal at 8x default

    if (voiced) {
      if (_inSilence) {
        var silDur = now - _silenceStartTs;
        if (silDur > 200 && silDur < 2000) {
          _silenceHistory.push(silDur);
          if (_silenceHistory.length > 10) _silenceHistory.shift();
          _acousticDysFluency = Math.min(1, _acousticDysFluency + 0.15);
        }
        _inSilence = false;
      }
      _lastSoundTs = now;
    } else if (!_inSilence && _isRec && (now - _lastSoundTs) > 120) {
      _inSilence = true;
      _silenceStartTs = now;
    }

    _zcrHistory.push(zcr);
    if (_zcrHistory.length > 8) _zcrHistory.shift();
    if (_zcrHistory.length >= 4) {
      var zcrMean = _zcrHistory.reduce(function(a, b) { return a + b; }, 0) / _zcrHistory.length;
      if (zcr > zcrMean * 2.2 && voiced) {
        _acousticDysFluency = Math.min(1, _acousticDysFluency + 0.12);
      }
    }

    if (pitch > 0 && _pitchVarBuf.length > 0) {
      var lastPitch = _pitchVarBuf[_pitchVarBuf.length - 1];
      if (lastPitch > 0 && Math.abs(pitch - lastPitch) > 40) {
        _acousticDysFluency = Math.min(1, _acousticDysFluency + 0.08);
      }
    }

    return Math.max(0, _acousticDysFluency);
  }

  // ── signal extractors ─────────────────────────────────────────
  function _computePitch() {
    if (!_analyser || !_timeBuf) return 0;
    // Need fresh time-domain data
    var SIZE = _timeBuf.length, rms = 0;
    for (var i = 0; i < SIZE; i++) rms += _timeBuf[i] * _timeBuf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0;
    var half = Math.floor(SIZE / 2);
    var corr = new Float32Array(half);
    for (var lag = 0; lag < half; lag++) {
      var sum = 0;
      for (var j = 0; j < SIZE - lag; j++) sum += _timeBuf[j] * _timeBuf[j + lag];
      corr[lag] = sum;
    }
    var peak = -1, peakVal = -1, dropped = false;
    for (var k = 1; k < half; k++) {
      if (!dropped && corr[k] < corr[k-1]) dropped = true;
      if (dropped && corr[k] > peakVal) { peakVal = corr[k]; peak = k; }
      if (dropped && corr[k] < peakVal * 0.5) break;
    }
    if (peak < 1 || peakVal < corr[0] * 0.2) return 0;
    var sr   = _ctx ? _ctx.sampleRate : 44100;
    var freq = Math.round(sr / peak);
    return (freq >= 60 && freq <= 1200) ? freq : 0;
  }

  function _computeRMS() {
    if (!_timeBuf) return 0;
    var sum = 0;
    for (var i = 0; i < _timeBuf.length; i++) sum += _timeBuf[i] * _timeBuf[i];
    return Math.sqrt(sum / _timeBuf.length);
  }

  function _computeZCR() {
    if (!_timeBuf) return 0;
    var c = 0;
    for (var i = 1; i < _timeBuf.length; i++) {
      if ((_timeBuf[i] >= 0) !== (_timeBuf[i-1] >= 0)) c++;
    }
    return c / _timeBuf.length;
  }

  function _computeSpectralCentroid() {
    if (!_analyser || !_freqBuf) return 0;
    _analyser.getFloatFrequencyData(_freqBuf);
    var num = 0, den = 0, nyq = (_ctx ? _ctx.sampleRate : 44100) / 2;
    for (var i = 0; i < _freqBuf.length; i++) {
      var mag  = Math.pow(10, _freqBuf[i] / 20);
      var freq = (i / _freqBuf.length) * nyq;
      num += freq * mag; den += mag;
    }
    return den > 0 ? num / den : 0;
  }

  // ── meter loop ────────────────────────────────────────────────
  function _startMeterLoop() {
    if (_meterLoop) clearInterval(_meterLoop);
    _meterLoop = setInterval(function() {
      if (!_analyser || !_timeBuf) return;
      _analyser.getFloatTimeDomainData(_timeBuf);
      _cachedPitch = _computePitch();
      _cachedRMS   = _computeRMS();
      _cachedZCR   = _computeZCR();
      _lastCacheMs = Date.now();

      var pitch = _cachedPitch, rms = _cachedRMS;
      var db    = rms > 0 ? Math.max(0, 60 + 20 * Math.log10(rms)) : 0;
      var pPct  = pitch > 0 ? Math.min(100, ((pitch - 60) / (500 - 60)) * 100) : 0;
      var vPct  = Math.min(100, (db / 60) * 100);

      _setMeter('pitch', pPct, pitch > 0 ? Math.round(pitch) + 'Hz' : '—', 'blue');
      _setMeter('vol',   vPct, db > 0    ? Math.round(db) + 'dB'    : '—', vPct > 75 ? 'red' : 'green');

      // Live osc stats
      var hzEl  = document.getElementById('osc-hz');
      var rmsEl = document.getElementById('osc-rms');
      var zcrEl = document.getElementById('osc-zcr');
      if (hzEl)  hzEl.textContent  = pitch > 0 ? Math.round(pitch) + ' Hz' : '—';
      if (rmsEl) rmsEl.textContent = rms > 0   ? rms.toFixed(3) : '—';
      if (zcrEl) zcrEl.textContent = _cachedZCR > 0 ? _cachedZCR.toFixed(3) : '—';
    }, 80);
  }

  function _setMeter(id, pct, val, cls) {
    var bar = document.getElementById('m-' + id);
    var vEl = document.getElementById('mv-' + id);
    if (bar) {
      bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (cls) bar.className = 'meter-bar ' + cls;
    }
    if (vEl) vEl.textContent = val;
  }

  // ── oscilloscope — FIXED ──────────────────────────────────────
  //
  // BUG FIXED: W/H were captured once at init. Now we read _canW/_canH
  // which are updated by ResizeObserver on every layout change.
  //
  // BUG FIXED: ctx.scale() was called once — it compounds on re-init.
  // Now we resetTransform() before re-scaling.
  //
  // BUG FIXED: 2048 raw samples drawn across ~300px = severe aliasing.
  // Now downsampled to max 512 points with min/max envelope per bucket.
  //
  function _startOscilloscope() {
    _canvas = document.getElementById('osc-canvas');
    if (!_canvas) return;
    _ctx2d  = _canvas.getContext('2d');
    _dpr    = window.devicePixelRatio || 1;

    // Fixed logical height = 110px
    var LOGICAL_H = 110;
    _canvas.style.height = LOGICAL_H + 'px';

    function _sizeCanvas() {
      _canW = _canvas.offsetWidth  || 340;
      _canH = LOGICAL_H;
      _dpr  = window.devicePixelRatio || 1;
      _canvas.width  = Math.round(_canW * _dpr);
      _canvas.height = Math.round(_canH * _dpr);
      // ALWAYS reset before scale — prevents compound scaling
      if (_ctx2d.resetTransform) {
        _ctx2d.resetTransform();
      } else {
        _ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      }
      _ctx2d.scale(_dpr, _dpr);
    }

    _sizeCanvas();

    // ResizeObserver keeps canvas live on any layout change
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function() { _sizeCanvas(); });
      ro.observe(_canvas);
    } else {
      window.addEventListener('resize', _sizeCanvas);
    }

    if (_oscRAF) cancelAnimationFrame(_oscRAF);

    function _waveColor() {
      if (_flowScore >= 60) return [0, 255, 238];
      if (_regime === 'DYSREGULATED' || _regime === 'COLLAPSING') return [255, 51, 85];
      if (_regime === 'OSCILLATORY') return [0, 255, 238];
      if (_regime === 'ACTIVATING')  return [255, 170, 0];
      if (_isRec) return [0, 255, 136];
      return [0, 160, 80];
    }

    // Downsample timeBuf to at most N_DRAW points using min/max envelope
    var N_DRAW  = 512;
    var _minBuf = new Float32Array(N_DRAW);
    var _maxBuf = new Float32Array(N_DRAW);

    function _downsample(src, minBuf, maxBuf, outN) {
      var srcN    = src.length;
      var bucketF = srcN / outN;
      for (var b = 0; b < outN; b++) {
        var start = Math.floor(b * bucketF);
        var end   = Math.min(srcN, Math.floor((b + 1) * bucketF));
        var mn = src[start], mx = src[start];
        for (var i = start + 1; i < end; i++) {
          if (src[i] < mn) mn = src[i];
          if (src[i] > mx) mx = src[i];
        }
        minBuf[b] = mn;
        maxBuf[b] = mx;
      }
    }

    function _draw() {
      _oscRAF = requestAnimationFrame(_draw);
      var W = _canW, H = _canH;
      var c = _waveColor();

      _ctx2d.clearRect(0, 0, W, H);

      // Grid
      _ctx2d.strokeStyle = 'rgba(0,255,136,0.045)';
      _ctx2d.lineWidth   = 0.5;
      for (var gy = 0; gy <= 4; gy++) {
        _ctx2d.beginPath();
        _ctx2d.moveTo(0, H * gy / 4);
        _ctx2d.lineTo(W, H * gy / 4);
        _ctx2d.stroke();
      }
      for (var gx = 0; gx <= 8; gx++) {
        _ctx2d.beginPath();
        _ctx2d.moveTo(W * gx / 8, 0);
        _ctx2d.lineTo(W * gx / 8, H);
        _ctx2d.stroke();
      }

      if (!_analyser || !_timeBuf) {
        // Idle breathing sine
        var t = Date.now() / 1000;
        _ctx2d.strokeStyle = 'rgba(0,255,136,0.18)';
        _ctx2d.lineWidth   = 1;
        _ctx2d.beginPath();
        for (var xi = 0; xi < W; xi++) {
          var yi = H / 2 + Math.sin(xi * 0.04 + t * 0.5) * 2.5;
          xi === 0 ? _ctx2d.moveTo(xi, yi) : _ctx2d.lineTo(xi, yi);
        }
        _ctx2d.stroke();
        return;
      }

      // Read audio data (already fresh from meter loop at 80ms)
      _analyser.getFloatTimeDomainData(_timeBuf);

      var n_pts  = Math.min(N_DRAW, W); // never more pts than pixels
      _downsample(_timeBuf, _minBuf, _maxBuf, n_pts);

      var alpha  = _isRec ? 1 : 0.28;
      var cr = c[0], cg = c[1], cb = c[2];

      // Wide glow
      _ctx2d.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.06)';
      _ctx2d.lineWidth   = 10;
      _ctx2d.beginPath();
      for (var i = 0; i < n_pts; i++) {
        var x = (i / (n_pts - 1)) * W;
        var y = (0.5 + (_minBuf[i] + _maxBuf[i]) / 2 * 0.42) * H;
        i === 0 ? _ctx2d.moveTo(x, y) : _ctx2d.lineTo(x, y);
      }
      _ctx2d.stroke();

      // Mid glow
      _ctx2d.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.16)';
      _ctx2d.lineWidth   = 3.5;
      _ctx2d.beginPath();
      for (var i2 = 0; i2 < n_pts; i2++) {
        var x2 = (i2 / (n_pts - 1)) * W;
        var y2 = (0.5 + (_minBuf[i2] + _maxBuf[i2]) / 2 * 0.42) * H;
        i2 === 0 ? _ctx2d.moveTo(x2, y2) : _ctx2d.lineTo(x2, y2);
      }
      _ctx2d.stroke();

      // Envelope fill (shows dynamic range)
      if (_isRec) {
        _ctx2d.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',0.04)';
        _ctx2d.beginPath();
        for (var fi = 0; fi < n_pts; fi++) {
          var fx = (fi / (n_pts - 1)) * W;
          var fy = (0.5 + _maxBuf[fi] * 0.42) * H;
          fi === 0 ? _ctx2d.moveTo(fx, fy) : _ctx2d.lineTo(fx, fy);
        }
        for (var fi2 = n_pts - 1; fi2 >= 0; fi2--) {
          var fx2 = (fi2 / (n_pts - 1)) * W;
          var fy2 = (0.5 + _minBuf[fi2] * 0.42) * H;
          _ctx2d.lineTo(fx2, fy2);
        }
        _ctx2d.closePath();
        _ctx2d.fill();
      }

      // Crisp midline
      _ctx2d.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + alpha + ')';
      _ctx2d.lineWidth   = 1.5;
      _ctx2d.beginPath();
      for (var j = 0; j < n_pts; j++) {
        var xj = (j / (n_pts - 1)) * W;
        var yj = (0.5 + (_minBuf[j] + _maxBuf[j]) / 2 * 0.42) * H;
        j === 0 ? _ctx2d.moveTo(xj, yj) : _ctx2d.lineTo(xj, yj);
      }
      _ctx2d.stroke();
    }

    _draw();
  }

  // ── ring buffer ───────────────────────────────────────────────
  function _startRingBuffer(stream) {
    var mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', ''];
    var mime  = '';
    for (var i = 0; i < mimes.length; i++) {
      try {
        if (!mimes[i] || MediaRecorder.isTypeSupported(mimes[i])) { mime = mimes[i]; break; }
      } catch(e) {}
    }
    try {
      _ringRec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch(e) {
      console.warn('[AudioEngine] ring buffer unavailable:', e);
      return;
    }
    var _ringBuf = [];
    _ringRec.ondataavailable = function(e) {
      if (!e.data || e.data.size === 0) return;
      var now = Date.now();
      _ringBuf.push({ ts: now, blob: e.data });
      var cutoff = now - _RING_MS;
      while (_ringBuf.length > 0 && _ringBuf[0].ts < cutoff) _ringBuf.shift();
    };
    _ringRec.start(5000);
  }

  return pub;
})();
