/**
 * RHEON KERNEL — V9 VOICE ENGINES (server-side)
 *
 * The same engine stack as voice-field-v9.html but running in Node.
 * createVoiceEngines() returns the full API surface.
 *
 * Load order is law:
 *   identity → bus → taxonomy → ledger → tags → shape → gap → api
 */

import { bus } from '../core/bus.js';

// ── IDENTITY ─────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}

function sha12(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
    h2 ^= (c ^ (i & 0xff)); h2 = (h2 * 0x01000193) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('0000' + h2.toString(16)).slice(-4);
}

// ── TAXONOMY ─────────────────────────────────────────────────────────────────

const SHAPE_AXES = Object.freeze(['AFFECT','ABSTRACTION','COHERENCE','DYSFLUENCY','ENERGY','FLOW','RESONANCE']);
const TAG_SOURCES = Object.freeze({ SYSTEM:'SYSTEM', USER:'USER', AGENT:'AGENT', INFERRED:'INFERRED' });

function confidenceBand(s) {
  return s >= 0.75 ? 'HIGH' : s >= 0.5 ? 'MED' : s >= 0.25 ? 'LOW' : 'GUESS';
}

// ── LEDGER ───────────────────────────────────────────────────────────────────

const ENTRY_TYPES = Object.freeze({ NODE:'NODE', EDGE:'EDGE', THREAD:'THREAD', DELTA:'DELTA', GAP:'GAP', SNAP:'SNAP' });
const GAP_STATUS  = Object.freeze({ OPEN:'OPEN', NARROWING:'NARROWING', WIDENING:'WIDENING', CLOSED:'CLOSED' });

function createGapStore() {
  const _g = {}, _byNode = {}, _byType = {};
  function openGap(nodeId, opts) {
    const id = uuid(), t = opts.gapType || 'UNKNOWN';
    const gap = { id, nodeId, openedAt: Date.now(), closedAt: null, status: GAP_STATUS.OPEN, gapType: t,
      expressed: opts.expressed||'', inferred: opts.inferred||'', omitted: opts.omitted||'',
      uncertainty: typeof opts.uncertainty === 'number' ? opts.uncertainty : 0.5,
      magnitude: opts.magnitude||null, threadId: opts.threadId||null, prevNodeId: opts.prevNodeId||null, resolution: '',
      age: () => Date.now() - gap.openedAt, drift: () => 0 };
    _g[id] = gap;
    if (!_byNode[nodeId]) _byNode[nodeId] = []; _byNode[nodeId].push(id);
    if (!_byType[t])      _byType[t]      = []; _byType[t].push(id);
    bus.emit('gap:opened', { gapId: id, nodeId, gapType: t, uncertainty: gap.uncertainty }, 'GAP_STORE');
    return gap;
  }
  function byNode(nodeId) { return (_byNode[nodeId]||[]).map(id=>_g[id]).filter(Boolean); }
  function openGaps() { return Object.values(_g).filter(g => g.status !== GAP_STATUS.CLOSED); }
  function velocity() { const o=openGaps().length, c=Object.values(_g).filter(g=>g.status===GAP_STATUS.CLOSED).length; return {open:o,closed:c,diverging:o>c*1.5}; }
  function stats() { const v=velocity(); return {total:Object.keys(_g).length,open:v.open,closed:v.closed}; }
  function exportData() { const p={}; Object.keys(_g).forEach(id=>{const g=_g[id];p[id]={id:g.id,nodeId:g.nodeId,openedAt:g.openedAt,closedAt:g.closedAt,status:g.status,gapType:g.gapType,expressed:g.expressed,inferred:g.inferred,omitted:g.omitted,uncertainty:g.uncertainty,magnitude:g.magnitude,threadId:g.threadId,prevNodeId:g.prevNodeId,resolution:g.resolution};}); return p; }
  return { openGap, byNode, openGaps, velocity, stats, exportData };
}

function createLedger() {
  const _e=[], _byId={}, _byType={}, _byRef={}, _gs=createGapStore(); let _seq=0;
  function record(type, payload) {
    if (!ENTRY_TYPES[type]) return null;
    const id=uuid(), body=payload||{}, contentHash=sha12(type+'|'+JSON.stringify(body)+'|'+Date.now());
    const entry=Object.freeze({id,type,seq:++_seq,ts:Date.now(),contentHash,payload:Object.freeze(body)});
    _e.push(entry); _byId[id]=entry;
    if (!_byType[type]) _byType[type]=[]; _byType[type].push(entry);
    (body.refs||[]).forEach(r=>{ if(!_byRef[r])_byRef[r]=[]; _byRef[r].push(entry); });
    bus.emit('ledger:'+type.toLowerCase(), {id,type,seq:_seq,ts:entry.ts,contentHash,payload:body}, 'LEDGER');
    return entry;
  }
  function get(id) { return _byId[id]||null; }
  function byType(type) { return (_byType[type]||[]).slice(); }
  function count(type) { return type?(_byType[type]||[]).length:_e.length; }
  function gaps() { return _gs; }
  function exportData() { return {version:'9.0.0',ts:Date.now(),entries:_e.map(e=>Object.assign({},e)),gaps:_gs.exportData()}; }
  function importData(data) {
    if (!data||!data.entries) return 0;
    data.entries.forEach(e=>{ if(!_byId[e.id]){_e.push(Object.freeze(e));_byId[e.id]=e;if(!_byType[e.type])_byType[e.type]=[];_byType[e.type].push(e);if(e.seq>_seq)_seq=e.seq;} });
    return _e.length;
  }
  function stats() {
    const counts={};Object.keys(ENTRY_TYPES).forEach(t=>{counts[t]=(_byType[t]||[]).length;});
    return {total:_e.length,seq:_seq,counts,gaps:_gs.stats()};
  }
  return { record, get, byType, count, gaps, exportData, importData, stats, ENTRY_TYPES };
}

// ── TAG ENGINE ───────────────────────────────────────────────────────────────

function createTagEngine() {
  const _t={}, _byEntry={}, _byAxis={}, _vectors={}, _hIdx={};
  function tag(entryId, axis, value, opts) {
    opts=opts||{}; const cH=fnv1a(JSON.stringify({entryId,axis,value}));
    if (_hIdx[cH]) return _t[_hIdx[cH]];
    const conf=typeof opts.confidence==='number'?opts.confidence:1.0;
    const t=Object.freeze({id:uuid(),entryId,axis,value,confidence:conf,band:confidenceBand(conf),source:opts.source||TAG_SOURCES.SYSTEM,refs:Object.freeze(opts.refs||[]),ts:Date.now(),meta:Object.freeze(opts.meta||{}),contentHash:cH});
    _t[t.id]=t; _hIdx[cH]=t.id;
    if (!_byEntry[entryId]) _byEntry[entryId]=[]; _byEntry[entryId].push(t.id);
    if (!_byAxis[axis]) _byAxis[axis]={}; const vk=String(value); if(!_byAxis[axis][vk])_byAxis[axis][vk]=[]; _byAxis[axis][vk].push(entryId);
    delete _vectors[entryId];
    return t;
  }
  function tagFromMetrics(entryId, metrics, opts) {
    opts=opts||{}; const src=opts.source||TAG_SOURCES.SYSTEM; const tags=[];
    const m=(axis,val,conf)=>{ if(val!=null)tags.push(tag(entryId,axis,val,{source:src,confidence:conf||0.8})); };
    m('INTENT',metrics.intent,0.8);
    if(metrics.sentiment!=null)m('AFFECT',parseFloat(metrics.sentiment.toFixed(3)),0.75);
    if(metrics.abstractionNum!=null)m('ABSTRACTION',metrics.abstractionNum,0.7);
    if(metrics.coherenceScore!=null)m('COHERENCE',parseFloat(metrics.coherenceScore.toFixed(3)),0.85);
    if(metrics.dysfluencyScore!=null)m('DYSFLUENCY',parseFloat(metrics.dysfluencyScore.toFixed(3)),0.9);
    if(metrics.energy!=null)m('ENERGY',parseFloat(Math.min(1,metrics.energy).toFixed(3)),0.9);
    if(metrics.flowScore!=null)m('FLOW',parseFloat((metrics.flowScore/100).toFixed(3)),0.8);
    m('SIGMA',metrics.sigmaRegime,0.9); m('DOMAIN',metrics.domain,1.0); m('LAYER',metrics.layer,0.7); m('REGISTER',metrics.register,0.7);
    if(metrics.resonance!=null)m('RESONANCE',parseFloat(metrics.resonance.toFixed(3)),0.7);
    if(Array.isArray(metrics.frameworks))metrics.frameworks.forEach(f=>tags.push(tag(entryId,'FRAMEWORK',f,{source:src,confidence:0.75})));
    if(Array.isArray(metrics.codecTags))metrics.codecTags.forEach(c=>tags.push(tag(entryId,'CODEC',c,{source:src,confidence:0.8})));
    if(Array.isArray(metrics.edgeTypes))metrics.edgeTypes.forEach(e=>tags.push(tag(entryId,'EDGE_TYPE',e,{source:src,confidence:0.85})));
    if(metrics.threadId)tags.push(tag(entryId,'THREAD',metrics.threadId,{source:src,confidence:1.0}));
    return tags;
  }
  function trajectoryTags(entryId, prevId) {
    if(!prevId)return[]; const vC=vector(entryId),vP=vector(prevId),tags=[];
    SHAPE_AXES.forEach((axis,i)=>{ const d=vC[i]-vP[i]; const dir=Math.abs(d)<0.03?'STABLE':d>0?'RISING':'FALLING'; tags.push(tag(entryId,'TRAJECTORY',axis+':'+dir,{source:TAG_SOURCES.INFERRED,confidence:0.7,meta:{axis,delta:parseFloat(d.toFixed(4))}})); });
    return tags;
  }
  function tags(entryId, axis) { const ids=_byEntry[entryId]||[]; const all=ids.map(id=>_t[id]).filter(Boolean); return axis?all.filter(t=>t.axis===axis):all; }
  function tagValue(entryId,axis) { const ts=tags(entryId,axis); if(!ts.length)return null; ts.sort((a,b)=>b.confidence-a.confidence); return ts[0].value; }
  function byAxis(axis,value) { return (_byAxis[axis]?._byAxis?.[axis]?.[String(value)]||[]).slice(); }
  function byThread(threadId) { const m=_byAxis['THREAD']; return m?Object.values(m).flat().filter(id=>{ const ts2=tags(id,'THREAD'); return ts2.some(t=>t.value===threadId); }):[]; }
  function vector(entryId) {
    if(_vectors[entryId])return _vectors[entryId];
    const v=new Float32Array(SHAPE_AXES.length);
    SHAPE_AXES.forEach((axis,i)=>{ const ts=tags(entryId,axis); if(!ts.length){v[i]=0.5;return;} ts.sort((a,b)=>b.confidence-a.confidence); let val=ts[0].value; if(axis==='AFFECT')val=(parseFloat(val)+1)/2; else{val=parseFloat(val);if(isNaN(val))val=0.5;} v[i]=Math.max(0,Math.min(1,val)); });
    _vectors[entryId]=v; return v;
  }
  function distance(idA,idB) { const va=vector(idA),vb=vector(idB); let sum=0; for(let i=0;i<va.length;i++){const d=va[i]-vb[i];sum+=d*d;} return parseFloat((Math.sqrt(sum)/Math.sqrt(SHAPE_AXES.length)).toFixed(4)); }
  function similar(entryId,k) { const ids=Object.keys(_byEntry).filter(id=>id!==entryId); const scored=ids.map(id=>({entryId:id,distance:distance(entryId,id)})); scored.sort((a,b)=>a.distance-b.distance); return scored.slice(0,k||5); }
  function shapeOf(entryId) { const v=vector(entryId); const axes={}; SHAPE_AXES.forEach((axis,i)=>{axes[axis]={value:v[i],deviation:Math.abs(v[i]-0.5)};}); const dom=SHAPE_AXES.map((axis,i)=>({axis,dev:Math.abs(v[i]-0.5)})).sort((a,b)=>b.dev-a.dev).slice(0,3).map(x=>x.axis); const labels={}; ['INTENT','SIGMA','LAYER','REGISTER','DOMAIN','CODEC','FRAMEWORK','EDGE_TYPE','THREAD'].forEach(axis=>{const ts2=tags(entryId,axis);if(ts2.length)labels[axis]=ts2.map(t=>({value:t.value,confidence:t.confidence}));}); return {entryId,vector:Array.from(v),axes,dominantAxes:dom,labels,fieldPosition:dom.map(axis=>axis+':'+axes[axis].value.toFixed(2)).join(' · ')}; }
  function stats() { const byAxis={}; Object.keys(_byAxis).forEach(axis=>{let c=0;Object.values(_byAxis[axis]).forEach(ids=>{c+=ids.length;});byAxis[axis]=c;}); return {totalTags:Object.keys(_t).length,entries:Object.keys(_byEntry).length,byAxis,vectors:Object.keys(_vectors).length}; }
  function exportTags() { return Object.values(_t).map(t=>Object.assign({},t)); }
  return { tag, tagFromMetrics, trajectoryTags, tags, tagValue, byAxis, byThread, vector, distance, similar, shapeOf, stats, exportTags };
}

// ── THREAD TRACKER ───────────────────────────────────────────────────────────

function createThreadTracker(ledger) {
  const _threads={};let _cur=null,_nodeCount=0,_switchCount=0;
  function classify(nodeId,metrics) {
    const coh=metrics.coherenceScore||0,sil=metrics.silenceDelta||0; _nodeCount++;
    if(!_cur)return _start(nodeId,'SESSION_START',metrics,ledger);
    const reasons=[]; if(coh<0.15)reasons.push('TOPIC_SHIFT'); if(sil>4000)reasons.push('PAUSE'); if(_regShift(metrics))reasons.push('REGISTER_SHIFT');
    if(reasons.length>0){_close(_cur,nodeId);const r=_start(nodeId,reasons.join('+'),metrics,ledger);_switchCount++;ledger.record(ENTRY_TYPES.DELTA,{fromThreadId:r.prevThreadId,toThreadId:r.threadId,nodeId,reasons,coherence:coh,silenceDelta:sil,refs:[nodeId]});bus.emit('thread:switch',{fromThreadId:r.prevThreadId,toThreadId:r.threadId,nodeId,reasons,switchCount:_switchCount},'THREAD_TRACKER');return r;}
    _cur.nodeIds.push(nodeId);_cur.lastNodeId=nodeId;_cur.lastTs=Date.now();_upd(_cur,metrics);
    return {threadId:_cur.id,isNewThread:false};
  }
  function get(id){return _threads[id]||null;}
  function current(){return _cur;}
  function all(){return Object.values(_threads).sort((a,b)=>a.startTs-b.startTs);}
  function stats(){return{threads:Object.keys(_threads).length,switchCount:_switchCount,currentThread:_cur?_cur.id:null,nodesTracked:_nodeCount};}
  function _start(nodeId,reason,metrics,ledger){
    const prev=_cur?_cur.id:null; const t={id:uuid(),startTs:Date.now(),lastTs:Date.now(),nodeIds:[nodeId],firstNodeId:nodeId,lastNodeId:nodeId,startReason:reason,closed:false,avgCoherence:metrics.coherenceScore||0,avgSentiment:metrics.sentiment||0,dominantIntent:metrics.intent||'STATEMENT',nodeCount:1,lastRegister:metrics.register||null};
    _threads[t.id]=t;_cur=t;
    ledger.record(ENTRY_TYPES.THREAD,{threadId:t.id,startReason:reason,firstNodeId:nodeId,refs:[nodeId]});
    bus.emit('thread:started',{threadId:t.id,reason,nodeId,prevThreadId:prev},'THREAD_TRACKER');
    return{threadId:t.id,isNewThread:true,prevThreadId:prev};
  }
  function _close(t,trigger){t.closed=true;t.closedTs=Date.now();t.duration=t.closedTs-t.startTs;t.closedByNodeId=trigger;}
  function _upd(t,m){const n=t.nodeCount++;t.avgCoherence=(t.avgCoherence*n+(m.coherenceScore||0))/(n+1);t.avgSentiment=(t.avgSentiment*n+(m.sentiment||0))/(n+1);if(m.intent)t.dominantIntent=m.intent;if(m.register)t.lastRegister=m.register;}
  function _regShift(m){if(!_cur||!_cur.lastRegister||!m.register)return false;const p=_cur.lastRegister,c=m.register;const s=(p==='ANALYTICAL'&&c==='EMOTIONAL')||(p==='EMOTIONAL'&&c==='ANALYTICAL');if(m.register)_cur.lastRegister=m.register;return s;}
  return{classify,get,current,all,stats};
}

// ── SHAPE ENGINE ─────────────────────────────────────────────────────────────

function createShapeEngine(tagEngine) {
  const _traj=[],_att=[],_edges=[];
  function advance(entryId) {
    const v=tagEngine.vector(entryId),prev=_traj.length>0?_traj[_traj.length-1]:null;
    const step={entryId,vector:Array.from(v),ts:Date.now(),stepIndex:_traj.length,distFromPrev:0,axisDelta:null,edgeEvent:null,attractorId:null};
    if(prev){
      step.distFromPrev=tagEngine.distance(prev.entryId,entryId);
      step.axisDelta=SHAPE_AXES.map((axis,i)=>({axis,delta:parseFloat((v[i]-prev.vector[i]).toFixed(4)),prev:prev.vector[i],curr:v[i]}));
      if(step.distFromPrev>0.35){const dom=step.axisDelta.reduce((a,b)=>Math.abs(b.delta)>Math.abs(a.delta)?b:a).axis;const ee={id:uuid(),ts:step.ts,fromEntryId:prev.entryId,toEntryId:entryId,distance:step.distFromPrev,dominantAxis:dom};_edges.push(ee);step.edgeEvent=ee;bus.emit('shape:edge',ee,'SHAPE_ENGINE');}
    }
    const hit=_att.find(a=>{let s=0;for(let i=0;i<v.length;i++){const d=a.centroid[i]-v[i];s+=d*d;}return Math.sqrt(s)/Math.sqrt(v.length)<=0.20;})||null;
    if(hit){hit.visits++;hit.lastVisit=step.ts;hit.lastEntryId=entryId;step.attractorId=hit.id;}
    else if(_traj.length>0){const a={id:uuid(),centroid:Array.from(v),radius:0.20,visits:1,seededAt:step.ts,lastVisit:step.ts,seededById:entryId,lastEntryId:entryId};_att.push(a);step.attractorId=a.id;bus.emit('shape:attractor',{attractorId:a.id,entryId},'SHAPE_ENGINE');}
    _traj.push(step);return step;
  }
  function path(limit){return(limit?_traj.slice(-limit):_traj.slice()).map(s=>({entryId:s.entryId,vector:s.vector,stepIndex:s.stepIndex,distFromPrev:s.distFromPrev,edgeEvent:s.edgeEvent,attractorId:s.attractorId,axisDelta:s.axisDelta}));}
  function attractors(){return _att.slice().sort((a,b)=>b.visits-a.visits);}
  function dominantAttractor(){return _att.length?_att.reduce((a,b)=>b.visits>a.visits?b:a):null;}
  function fieldGaps(){if(_traj.length<3)return[];const gaps=[];SHAPE_AXES.forEach((axis,i)=>{const vals=_traj.map(s=>s.vector[i]).sort((a,b)=>a-b);let mg=0,gs=0,ge=0;for(let j=1;j<vals.length;j++){const iv=vals[j]-vals[j-1];if(iv>mg){mg=iv;gs=vals[j-1];ge=vals[j];}}const el=vals[0],eh=1-vals[vals.length-1];if(el>mg){mg=el;gs=0;ge=vals[0];}if(eh>mg){mg=eh;gs=vals[vals.length-1];ge=1;}if(mg>0.3)gaps.push({axis,gapStart:parseFloat(gs.toFixed(3)),gapEnd:parseFloat(ge.toFixed(3)),magnitude:parseFloat(mg.toFixed(3)),midpoint:parseFloat(((gs+ge)/2).toFixed(3))});});return gaps.sort((a,b)=>b.magnitude-a.magnitude);}
  function findResonant(entryId,thr){thr=thr==null?0.20:thr;return _traj.filter(s=>s.entryId!==entryId).map(s=>({entryId:s.entryId,distance:tagEngine.distance(entryId,s.entryId),stepIndex:s.stepIndex})).filter(s=>s.distance<=thr).sort((a,b)=>a.distance-b.distance);}
  function summary(){const p=path();const fG=fieldGaps();const tD=p.reduce((s,x)=>s+(x.distFromPrev||0),0);const aD=p.length>1?tD/(p.length-1):0;const mD=p.length>1?Math.max(...p.map(x=>x.distFromPrev||0)):0;return{nodes:p.length,totalPathLength:parseFloat(tD.toFixed(4)),avgStepDistance:parseFloat(aD.toFixed(4)),maxStepDistance:parseFloat(mD.toFixed(4)),edgeEvents:_edges.length,attractors:_att.length,dominantAttractor:dominantAttractor(),fieldGaps:fG.length,topFieldGap:fG[0]||null,trajectory:p};}
  return{advance,path,attractors,dominantAttractor,fieldGaps,findResonant,summary};
}

// ── GAP ENGINE ───────────────────────────────────────────────────────────────

const GAP_PATTERNS=[
  {type:'INCOMPLETE',re:/\b(i was going to|never mind|forget it|anyway|moving on)\b/i,omitted:'Thought started but not completed.',confidence:0.8},
  {type:'EPISTEMIC',re:/\b(i don'?t know|not sure|no idea|unclear|can'?t remember)\b/i,omitted:'Speaker lacks knowledge they need.',confidence:0.85},
  {type:'AFFECTIVE',re:/\b(fine|whatever|doesn'?t matter|it'?s nothing|i'?m okay)\b/i,omitted:'Emotion may be suppressed.',confidence:0.65},
  {type:'CAUSAL',re:/\b(somehow|just happened|out of nowhere|i guess|for some reason)\b/i,omitted:'Cause-effect link missing.',confidence:0.7},
  {type:'CONTRADICTION',re:/\b(but also|at the same time|and yet|but i also|i know but)\b/i,omitted:'Two contradictory states held simultaneously.',confidence:0.75},
  {type:'INTENTIONAL',re:/\b(i'?ll tell you later|not important|that'?s another thing)\b/i,omitted:'Speaker deliberately withholding.',confidence:0.7},
  {type:'SEMANTIC',re:/\b(like a|it'?s kind of|sort of like|how do i say|what'?s the word)\b/i,omitted:'Speaker lacks precise language.',confidence:0.75},
  {type:'TEMPORAL',re:/\b(used to|before|back then|a while ago|at some point)\b/i,omitted:'Temporal context referenced but absent.',confidence:0.6},
  {type:'RELATIONAL',re:/\b(\bthey\b|\bhe\b|\bshe\b|that person|someone)\b/i,omitted:'Relational reference without named subject.',confidence:0.5},
];

function _uw(text,dys,coh){let w=0.3+dys*0.3+(1-coh)*0.2;if(/\b(i think|maybe|perhaps|probably|i guess|sort of)\b/i.test(text))w+=0.15;return Math.min(1,parseFloat(w.toFixed(3)));}
function _infer(type){const m={INCOMPLETE:'More to this statement not said.',EPISTEMIC:'Speaker needs information they lack.',AFFECTIVE:'Emotional content larger than expressed.',CAUSAL:'Unexplained mechanism operating here.',CONTRADICTION:'Two states may require reconciliation.',INTENTIONAL:'Speaker chose not to say something.',SEMANTIC:'Speaker has experience they lack language for.',TEMPORAL:'Past context relevant but absent.',RELATIONAL:'Person referenced without identification.'};return m[type]||'Structured absence.';}

function createGapEngine(ledger) {
  function detect(nodeId,text,metrics){
    const detected=[],lower=text.toLowerCase(),dys=metrics.dysfluencyScore||0,coh=metrics.coherenceScore||0,threadId=metrics.threadId||null,prevId=metrics.prevNodeId||null;
    if((metrics.silenceDelta||0)>4000){const g=ledger.gaps().openGap(nodeId,{gapType:'TEMPORAL',expressed:'Long silence ('+Math.round(metrics.silenceDelta/1000)+'s).',inferred:'Something processed or avoided in silence.',omitted:'What happened in the silence.',uncertainty:_uw(text,dys,coh)+0.1,threadId,prevNodeId:prevId});ledger.record(ENTRY_TYPES.GAP,{gapId:g.id,gapType:'TEMPORAL',nodeId,expressed:g.expressed,omitted:g.omitted,uncertainty:g.uncertainty,refs:[nodeId]});detected.push(g);}
    if(dys>0.7){const fg=ledger.gaps().openGap(nodeId,{gapType:'INCOMPLETE',expressed:'High dysfluency ('+Math.round(dys*100)+'%).',inferred:'Translating from pre-verbal state.',omitted:'Complete thought being attempted.',uncertainty:_uw(text,dys,coh),threadId,prevNodeId:prevId});ledger.record(ENTRY_TYPES.GAP,{gapId:fg.id,gapType:'INCOMPLETE',nodeId,expressed:fg.expressed,omitted:fg.omitted,uncertainty:fg.uncertainty,refs:[nodeId]});detected.push(fg);}
    GAP_PATTERNS.forEach(pattern=>{if(!pattern.re.test(lower))return;const uw=_uw(text,dys,coh);const gap=ledger.gaps().openGap(nodeId,{gapType:pattern.type,expressed:text.slice(0,120)+(text.length>120?'…':''),inferred:_infer(pattern.type),omitted:pattern.omitted,uncertainty:uw,magnitude:uw*pattern.confidence,threadId,prevNodeId:prevId});ledger.record(ENTRY_TYPES.GAP,{gapId:gap.id,gapType:pattern.type,nodeId,expressed:gap.expressed,inferred:gap.inferred,omitted:gap.omitted,uncertainty:gap.uncertainty,confidence:pattern.confidence,refs:[nodeId]});detected.push(gap);});
    return detected;
  }
  function summary(){const all=ledger.gaps().openGaps();const byType={};all.forEach(g=>{byType[g.gapType]=(byType[g.gapType]||0)+1;});return{total:all.length,byType,velocity:ledger.gaps().velocity(),top:all.slice().sort((a,b)=>(b.uncertainty||0)-(a.uncertainty||0)).slice(0,8)};}
  return{detect,summary};
}

// ── SCORING ───────────────────────────────────────────────────────────────────

const SW={the:1,and:1,for:1,are:1,but:1,not:1,you:1,all:1,can:1,was:1,had:1,with:1,that:1,this:1,have:1,from:1,they:1,been:1,some:1,than:1,then:1,when:1,your:1,into:1,about:1,after:1,again:1,being:1,could:1,every:1,going:1,other:1,those:1,would:1};
const FILLER=/\b(um|uh|er|ah|like|you know|i mean|sort of|kind of|basically|literally|actually|just|so)\b/gi;
const POS=['good','great','excellent','amazing','wonderful','happy','love','best','perfect','success'];
const NEG=['bad','terrible','awful','horrible','sad','hate','worst','fail','wrong','problem','stuck','frustrated','afraid','anxious','pain'];

function _tok(t){return t.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(w=>w.length>2);}
function _sigTok(t){return _tok(t).filter(w=>w.length>3&&!SW[w]);}
function _sent(t){const l=t.toLowerCase();let p=0,n=0;POS.forEach(w=>{if(l.includes(w))p++;});NEG.forEach(w=>{if(l.includes(w))n++;});const tot=p+n;return tot===0?0:(p-n)/tot;}
function _dys(t){const m=t.match(FILLER)||[];return Math.min(1,(m.length/Math.max(1,_tok(t).length))*5);}
function _coh(t,prev){if(!prev||!prev.length)return 0.5;const words=new Set(_sigTok(t));const recent=prev.slice(-4);let ov=0;recent.forEach(n=>{_sigTok(n.text||'').forEach(w=>{if(words.has(w))ov++;});});return Math.min(1,(ov+0.1)/(words.size*0.5+1));}
function _intent(t){const l=t.toLowerCase();if(/\b(i want|i need|i wish)\b/.test(l))return'DESIRE';if(/\b(because|therefore|so that)\b/.test(l))return'REASONING';if(/\b(don'?t know|not sure|maybe|perhaps)\b/.test(l))return'UNCERTAINTY';if(/\b(will|going to|plan to)\b/.test(l))return'INTENTION';if(/\b(feel|feeling|felt|emotion)\b/.test(l))return'AFFECT';if(/\?/.test(t))return'QUESTION';return'STATEMENT';}
function _abs(t){if(/\b(concept|theory|principle|idea|philosophy|framework|system|model)\b/i.test(t))return{label:'ABSTRACT',num:0.8};if(/\b(specific|exactly|number|percent|date|time|place|step)\b/i.test(t))return{label:'CONCRETE',num:0.2};return{label:'MID',num:0.5};}
function _reg(t){const l=t.toLowerCase();if(/\b(feel|feeling|felt|emotion|love|hate|scared|sad|happy|hurt)\b/.test(l))return'EMOTIONAL';if(/\b(because|therefore|analysis|data|reason|logic|process)\b/.test(l))return'ANALYTICAL';if(/\b(so|then|next|first|after|before)\b/.test(l))return'NARRATIVE';return'EXPLORATORY';}
function _layer(t,dys,reg){if(dys>0.5&&reg==='EMOTIONAL')return'CORE';if(/\b(really|actually|honestly|to be honest|the truth is|deep down)\b/i.test(t))return'SUBTEXT';return'SURFACE';}
function _edges(t,sil,coh,wpm,pWpm){const types=[];if(sil>4000)types.push('PAUSE');if(coh<0.15)types.push('TOPIC_SHIFT');if(wpm>150&&pWpm>0&&wpm/pWpm>1.5)types.push('EMPHASIS');if(/[.!?]$/.test(t.trim()))types.push('SENTENCE_END');return types;}
const FP=[{n:'HEDGING',r:/\b(maybe|perhaps|sort of|kind of|might|could be)\b/i},{n:'CERTAINTY',r:/\b(definitely|absolutely|certainly|clearly|obviously)\b/i},{n:'CAUSATION',r:/\b(because|therefore|causes|leads to|due to)\b/i},{n:'CONTRAST',r:/\b(but|however|although|yet|despite)\b/i},{n:'SEQUENCE',r:/\b(first|then|next|finally|after|before)\b/i}];
function _fw(t){return FP.filter(p=>p.r.test(t)).map(p=>p.n);}
function _codec(t,dys){const tags=[];if(dys>0.3)tags.push('FRICTION');if(/\b(blocked?|stuck|can'?t|unable)\b/i.test(t))tags.push('BLOCK');if(/\b(again|same|every time|keep|keeps)\b/i.test(t))tags.push('LOOP');if(!tags.length)tags.push('SYS');return tags;}
function _sigma(v){if(v.length<5)return{regime:'INSUFFICIENT_DATA',cov:0,slopeFlips:0};const mean=v.reduce((a,b)=>a+b,0)/v.length;const variance=v.reduce((a,x)=>a+(x-mean)**2,0)/v.length;const std=Math.sqrt(variance);const cov=mean>0?std/mean:0;let flips=0;for(let i=2;i<v.length;i++){if((v[i]-v[i-1])*(v[i-1]-v[i-2])<0)flips++;}if(cov<0.15&&flips<3)return{regime:'STABLE',cov,slopeFlips:flips};if(cov<0.3&&flips<6)return{regime:'ACTIVATING',cov,slopeFlips:flips};if(flips>8)return{regime:'OSCILLATING',cov,slopeFlips:flips};if(cov>0.5)return{regime:'DYSREGULATED',cov,slopeFlips:flips};return{regime:'UNGROUNDED',cov,slopeFlips:flips};}
function _flow(prevNodes,wpmHistory){if(prevNodes.length<3||wpmHistory.length<3)return 0;const wm=wpmHistory.reduce((a,b)=>a+b,0)/wpmHistory.length;let cv=0;if(wm>0){const std=Math.sqrt(wpmHistory.map(w=>(w-wm)**2).reduce((a,b)=>a+b,0)/wpmHistory.length);cv=std/wm;}let score=Math.min(30,wm>80?30:wm/80*30)+Math.min(25,(1-cv)*25);const rC=prevNodes.slice(-5).map(n=>n.coherenceScore||0);score+=(rC.reduce((a,b)=>a+b,0)/rC.length)*25;const rD=prevNodes.slice(-5).map(n=>n.dysfluencyScore||0);score+=(1-(rD.reduce((a,b)=>a+b,0)/rD.length))*20;return Math.round(Math.max(0,Math.min(100,score)));}

// ── API FACTORY ───────────────────────────────────────────────────────────────

export function createVoiceEngines() {
  let _ledger=null,_tags=null,_threads=null,_shape=null,_gaps=null,_ready=false;
  let _prevNodes=[],_energyHistory=[],_wpmHistory=[];

  function init() {
    _ledger  = createLedger();
    _tags    = createTagEngine();
    _threads = createThreadTracker(_ledger);
    _shape   = createShapeEngine(_tags);
    _gaps    = createGapEngine(_ledger);
    _ready   = true;
    bus.emit('voice:engines:ready', { version: '9.0.0' }, 'VOICE_ENGINES');
    return true;
  }

  function commitNode(text, audioMetrics, sessionState) {
    if (!_ready) throw new Error('engines not initialized');
    audioMetrics=audioMetrics||{}; sessionState=sessionState||{};
    const wc=_tok(text).length,wpm=sessionState.wpm||0,sil=sessionState.silenceDelta||0,domain=sessionState.domain||'journal';
    const prevWpm=_wpmHistory.length?_wpmHistory[_wpmHistory.length-1]:0;
    if(wpm>0&&wpm<400){_wpmHistory.push(wpm);if(_wpmHistory.length>50)_wpmHistory.shift();}
    const sent=_sent(text),dys=_dys(text),coh=_coh(text,_prevNodes),intent=_intent(text),ab=_abs(text),reg=_reg(text),layer=_layer(text,dys,reg),fw=_fw(text),codec=_codec(text,dys),edgeTypes=_edges(text,sil,coh,wpm,prevWpm);
    const energy=Math.min(1,(audioMetrics.amplitude||0)*8+(audioMetrics.zcr||0)*0.3+wc*0.01);
    _energyHistory.push(energy);if(_energyHistory.length>30)_energyHistory.shift();
    const sigma=_sigma(_energyHistory),flowScore=_flow(_prevNodes,_wpmHistory);
    const tRes=_threads.classify('__P__',{coherenceScore:coh,silenceDelta:sil,intent,register:reg,sentiment:sent,dysfluencyScore:dys});
    const threadId=tRes.threadId;
    const prevNodeId=_prevNodes.length?_prevNodes[_prevNodes.length-1]._ledgerId:null;
    const nodeEntry=_ledger.record(ENTRY_TYPES.NODE,{text,wordCount:wc,wpm,silenceDelta:sil,domain,pitch:audioMetrics.pitch||0,amplitude:audioMetrics.amplitude||0,zcr:audioMetrics.zcr||0,sentiment:sent,dysfluencyScore:dys,coherenceScore:coh,intent,abstraction:ab.label,register:reg,layer,frameworks:fw,codecTags:codec,edgeTypes,sigmaRegime:sigma.regime,energy,flowScore,threadId,prevNodeId,refs:prevNodeId?[prevNodeId]:[]});
    if(tRes.isNewThread){const t=_threads.get(threadId);if(t){t.nodeIds[0]=nodeEntry.id;t.firstNodeId=nodeEntry.id;t.lastNodeId=nodeEntry.id;}}else{const tc=_threads.current();if(tc){tc.nodeIds.push(nodeEntry.id);tc.lastNodeId=nodeEntry.id;}}
    _tags.tagFromMetrics(nodeEntry.id,{intent,sentiment:sent,abstractionNum:ab.num,coherenceScore:coh,dysfluencyScore:dys,energy,flowScore,sigmaRegime:sigma.regime,domain,layer,register:reg,frameworks:fw,codecTags:codec,edgeTypes,threadId,wpm,pitch:audioMetrics.pitch||0,silenceDelta:sil});
    if(prevNodeId)_tags.trajectoryTags(nodeEntry.id,prevNodeId);
    const shapeStep=_shape.advance(nodeEntry.id);
    if(prevNodeId){const dist=_tags.distance(nodeEntry.id,prevNodeId);_tags.tag(nodeEntry.id,'RESONANCE',parseFloat((1-dist).toFixed(3)),{source:TAG_SOURCES.INFERRED,confidence:0.7,meta:{distFromPrev:dist}});}
    if(shapeStep.edgeEvent){_ledger.record(ENTRY_TYPES.EDGE,{edgeId:shapeStep.edgeEvent.id,fromNodeId:prevNodeId,toNodeId:nodeEntry.id,distance:shapeStep.edgeEvent.distance,dominantAxis:shapeStep.edgeEvent.dominantAxis,threadId,refs:[nodeEntry.id,prevNodeId].filter(Boolean)});}
    const detectedGaps=_gaps.detect(nodeEntry.id,text,{dysfluencyScore:dys,coherenceScore:coh,silenceDelta:sil,threadId,prevNodeId});
    const node={_ledgerId:nodeEntry.id,_contentHash:nodeEntry.contentHash,_threadId:threadId,id:nodeEntry.id,seq:nodeEntry.seq,ts:nodeEntry.ts,text,wordCount:wc,wpm,silenceDelta:sil,domain,pitch:audioMetrics.pitch||0,amplitude:audioMetrics.amplitude||0,sentiment:sent,dysfluencyScore:dys,coherenceScore:coh,intent,abstraction:ab.label,register:reg,layer,frameworks:fw,codecTags:codec,edgeTypes,sigmaRegime:sigma.regime,energy,flowScore,threadId,isNewThread:tRes.isNewThread,prevNodeId,shapeStep,gaps:detectedGaps,shape:_tags.shapeOf(nodeEntry.id),mirror:''};
    _prevNodes.push(node);if(_prevNodes.length>20)_prevNodes.shift();
    return node;
  }

  function query(){if(!_ready)return null;return{ledger:_ledger.stats(),tags:_tags.stats(),threads:_threads.stats(),shape:_shape.summary(),gaps:_gaps.summary(),sigma:_energyHistory.length>4?_sigma(_energyHistory):{regime:'INSUFFICIENT_DATA'}};}
  function getThread(id){return _threads.get(id);}
  function getAllThreads(){return _threads.all();}
  function currentThread(){return _threads.current();}
  function getLedgerEntries(type){return _ledger.byType(type||ENTRY_TYPES.NODE);}
  function getShape(){return _shape.summary();}
  function getTrajectory(limit){return _shape.path(limit);}
  function getFieldGaps(){return _shape.fieldGaps();}
  function getAttractors(){return _shape.attractors();}
  function getGapSummary(){return _gaps.summary();}
  function getOpenGaps(){return _ledger.gaps().openGaps();}
  function getResonantTo(nodeId,t){return _shape.findResonant(nodeId,t);}
  function exportJSON(){return JSON.stringify({version:'9.0.0',ts:Date.now(),ledger:_ledger.exportData(),tags:_tags.exportTags(),threads:_threads.all(),shape:_shape.summary()},null,2);}
  function exportMarkdown(){const nodes=_ledger.byType(ENTRY_TYPES.NODE);const lines=['# Rheon Voice — Session','','**Date:** '+new Date().toLocaleString(),'**Nodes:** '+nodes.length,'','---',''];nodes.forEach((e,i)=>{const p=e.payload;lines.push('## Node '+(i+1)+' — '+new Date(e.ts).toTimeString().slice(0,8));lines.push('');lines.push(p.text||'');lines.push('');lines.push('**Metrics:** WPM: '+(p.wpm||0)+' | DYS: '+Math.round((p.dysfluencyScore||0)*100)+'% | COH: '+Math.round((p.coherenceScore||0)*100)+'% | SENT: '+(p.sentiment||0).toFixed(2)+' | Thread: '+(p.threadId||'—').slice(0,8)+' | Hash: '+e.contentHash);lines.push('');lines.push('---');lines.push('');});return lines.join('\n');}
  function clearAll(){_ledger=createLedger();_tags=createTagEngine();_threads=createThreadTracker(_ledger);_shape=createShapeEngine(_tags);_gaps=createGapEngine(_ledger);_prevNodes=[];_energyHistory=[];_wpmHistory=[];bus.emit('voice:cleared',{},'VOICE_ENGINES');}

  return{init,commitNode,query,getThread,getAllThreads,currentThread,getLedgerEntries,getShape,getTrajectory,getFieldGaps,getAttractors,getGapSummary,getOpenGaps,getResonantTo,exportJSON,exportMarkdown,clearAll};
}
