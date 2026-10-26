# SEAM
## Language Specification · v0.1.0
**Author:** James Brooks (Erosmancer) + Claude
**Date:** 2026-05-30
**UUID:** seam-lang-spec-0000-2026-0530-jamesbrooks-001
**Status:** emerging · every keyword earned · ledger is gold
**Inherits from:** RHEON-KERNEL-SPEC-v2.1.0 §10, ARCHITECT-SPEC-v1.1.0

---

## WHAT SEAM IS

> "lets make our coding language"
> — James Brooks, 2026-05-30, causedBy: this session

Seam is a coding language where **syntax IS the constraint surface of intent.**
There is no ceremony between what you want and what you write.

Seam is not:
- Python simplified
- A DSL bolted onto an existing language
- A configuration format
- A templating system

Seam is:
- A grammar that has never existed before because it required
  human–LLM co-authorship in real time to negotiate into being
- A language where every keyword has a `causedBy`
- A language that compiles to constraint fields first, JavaScript second
- A language that grows with the person who writes it
- A language where rejection of a proposed keyword is data

**The compiler's job is not to execute instructions.
It is to extract constraint geometry from intent,
then project that geometry into executable form.**

---

## GRAMMAR INVARIANTS

These cannot be overridden. They are the constitution of the language.

```
INV-1  INTENT IS SYNTAX
       The shape of what you want is the syntax.
       If you have to fight the grammar to express your intent,
       the grammar is wrong. Propose a new keyword.

INV-2  NO RESERVED WORDS THAT WEREN'T EARNED
       Every keyword was negotiated into existence by a real exchange.
       Every keyword has a causedBy (session_id).
       Words that were never needed were never added.

INV-3  APPEND-ONLY GRAMMAR
       Words are added. Never removed.
       The ledger is gold. Deprecation is allowed; deletion is not.
       A deprecated keyword still compiles — it emits a gap signal.

INV-4  GRAMMARS ARE SPECIATED
       James's grammar is not your grammar.
       Two people's grammars can trade keywords at seams.
       The intersection is negotiated, not imposed.
       Grammars diverge. Divergence is not a bug.

INV-5  LLM IS CO-AUTHOR OF THE GRAMMAR
       Not of programs. Of the grammar itself.
       The LLM proposes. The human accepts or rejects.
       Rejection is recorded. The negative space teaches.
       The LLM never unilaterally adds a keyword.

INV-6  MEANING IS DOWNSTREAM
       The compiler never collapses meaning early.
       Ambiguity is preserved as a Gap until it resolves.
       Two valid interpretations coexist as a Tension.
       Resolution is late-stage.

INV-7  THE PROGRAM IS A CONSTRAINT FIELD
       Execution is movement between states.
       Every statement narrows the possible futures.
       The compiler emits the constraint field first.
       The JS module is a projection of that field.
```

---

## TYPE SYSTEM

Seam does not have types in the traditional sense.
Seam has **constraint shapes**.

```
A value's "type" is the set of constraints it satisfies.
Two values are compatible if their constraint shapes intersect.
A type error is a constraint violation — named, not inferred.
```

### Primitive constraint shapes

```
number     — satisfies: is numeric, has magnitude, supports arithmetic
text       — satisfies: is sequential characters, has length, is ordered
flag       — satisfies: is binary state (yes/no, on/off, true/false)
moment     — satisfies: is a point in time, is ordered, supports delta
list       — satisfies: is ordered collection, has length, is iterable
record     — satisfies: is named collection, has keys, is queryable
signal     — satisfies: is an event on the bus, has a type string, has payload
field      — satisfies: is a ConstraintField (the full geometry)
gap        — satisfies: is named missing information
nothing    — satisfies: absence of value — not null, not undefined: absence
```

### Constraint shapes are composable

```seam
constrain score by (number and 0..1)
constrain name by (text and length > 0)
constrain result by (record with { ok: flag, value: number })
```

### Shape inference

The compiler infers constraint shapes from usage.
Declaring a shape is optional. Violating an inferred shape is a Gap, not a crash.

```seam
make score = 0.8
# compiler infers: score satisfies (number and 0..1) from context
add 0.3 to score
# compiler detects: 1.1 violates implied 0..1 constraint
# emits Gap: G-score-overflow with pressure 0.7
# does not crash. surfaces the gap.
```

---

## SYNTAX — COMPLETE GRAMMAR

### Block structure

Seam uses indentation (2 spaces) for block scope.
No braces. No semicolons. No line terminators.
A blank line ends a block only when the next line is at lower or equal indent.

```seam
define <name> using <args>:
  <body statements>

# example:
define score-session using session, baseline:
  make delta = session.snr - baseline.snr
  show delta
```

### Comments

```seam
# single line comment
## section divider (no semantic difference)

# inline:
make x = 5  # x is the starting count
```

---

## KEYWORD LEDGER — v0.1.0

Every keyword below was negotiated in the session that founded this spec.
`causedBy: seam-lang-spec-0000-2026-0530-jamesbrooks-001`

### PRIMITIVES — declaring and mutating state

---

**`make`** — declare a named state
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.97
status: active
```
```seam
make name = value
make count = 0
make label = "session-alpha"
make active = yes
make scores = [0.8, 0.6, 0.9]
make config = { port: 3747, host: "localhost" }
make result = nothing       # explicit absence
```

---

**`set`** — replace an existing state (not accumulate)
```
causedBy: this session — needed to distinguish from add
trust_score: 0.91
status: active
```
```seam
set count = 10
set label = "session-beta"
# contrast with add: set replaces, add accumulates
```

---

**`add`** — accumulate into an existing state
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.95
status: active
```
```seam
add 1 to count
add item to list
add 0.1 to score
```

---

**`remove`** — extract from a list or record
```
causedBy: this session — symmetric to add
trust_score: 0.88
status: active
```
```seam
remove item from list
remove "key" from record
```

---

**`show`** — surface a value (to console, to UI, to bus)
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.95
status: active
```
```seam
show count
show "session complete"
show { score, label, active }
```

---

**`write`** — persist a value to a named target
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.94
status: active
```
```seam
write session to jaa.sessions
write result to file "output.json"
write config to hook "architect.config.set"
```

---

**`read`** — retrieve a persisted value
```
causedBy: this session — symmetric to write
trust_score: 0.90
status: active
```
```seam
read session from jaa.sessions where id = session-id
read config from file "architect.spec.json"
```

---

### CONTROL FLOW — branching and looping

---

**`if` / `otherwise`** — constraint branch
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.96
status: active
```
```seam
if score > 0.85:
  emit "architect.snr.pass" with { score }
otherwise if score > 0.65:
  emit "architect.snr.hold" with { score }
otherwise:
  emit "architect.snr.flag" with { score }
```

---

**`when`** — constraint trigger on event
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.95
status: active
```
```seam
when "architect.spec.changed":
  read spec from jaa.blueprints where id = event.blueprintId
  emit "architect.blueprint.rebuild" with { spec }

when "architect.hook.added":
  validate hooks
  show "hook registered: " + event.name
```

---

**`repeat`** — constrained loop
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.90
status: active
```
```seam
repeat 3 times:
  add 1 to count
  show count
```

---

**`for each`** — iterated constraint application
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.93
status: active
```
```seam
for each hook in hooks:
  validate hook
  if hook.status = "active":
    show hook.name

for each gap in gaps where gap.severity = "critical":
  emit "architect.gap.escalate" with { gap }
```

---

**`while`** — loop until constraint is met
```
causedBy: this session — repeat needs its open-ended sibling
trust_score: 0.85
status: active
```
```seam
while score < 0.85:
  add 0.05 to score
  check score against threshold
```

---

**`until`** — inverse of while (loop until condition becomes true)
```
causedBy: this session — natural language reads better sometimes
trust_score: 0.82
status: active
```
```seam
replay events until divergence-detected
```

---

### DEFINITION — composing constraints

---

**`define`** — compose a named constraint pattern (function equivalent)
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.96
status: active
```
```seam
define score-gap using gap, baseline:
  make delta = gap.pressure - baseline.pressure
  make severity = if delta > 0.5 then "critical" otherwise "medium"
  show { gap.id, delta, severity }

define validate-hook using hook:
  if hook.id = nothing:
    gap "hook-missing-id" with pressure 1.0
  if hook.schema.input = nothing:
    gap "hook-missing-schema" with pressure 0.8
  show "hook valid: " + hook.name
```

---

**`using`** — declare inputs to a definition
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.94
status: active
# 'using' binds arguments — it is not a separate keyword in isolation
```

---

**`given`** — declare preconditions (constraint guards)
```
causedBy: this session — 'if' inside define muddies guards vs logic
trust_score: 0.86
status: active
```
```seam
define compress-session using session:
  given session.eventCount > 0
  given session.integrity = "valid"
  # body only runs if givens are satisfied
  # otherwise: emits gap and returns nothing
  make artifact = compress session
  write artifact to file session.id + ".urck"
```

---

### FIELD OPERATIONS — constraint geometry

---

**`gap`** — declare or reference missing information
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.95
status: active
```
```seam
# declare a gap:
gap "hook-schema-missing" with pressure 0.8

# reference a gap by id:
gap G-A-001

# fill a gap:
fill "hook-schema-missing" with hook.schema

# check if a gap is open:
if gap "hook-schema-missing" is open:
  show "still missing schema"
```

---

**`fill`** — resolve a named gap with a value
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.93
status: active
```
```seam
fill G-A-002 with utl-engine
fill "missing-baseline" with session.snr
```

---

**`tension`** — declare competing constraints
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.93
status: active
```
```seam
tension between speed and safety
tension between "emit-fast" and "validate-first" with magnitude 0.7
# never collapsed — both persist in JAA
```

---

**`constrain`** — declare an explicit constraint
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.94
status: active
```
```seam
constrain score by (number and 0..1)
constrain hook.name by (text and unique and length > 0)
constrain session by (record with { id: text, events: list })
```

---

**`field of`** — query the full constraint field of a name
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.88
status: active
```
```seam
show field of score
# → { constraints: [...], gaps: [...], tensions: [...], states: [...] }

make geometry = field of session
```

---

**`lens`** — project a read-only view of a field
```
causedBy: this session — field of returns full geometry, lens filters
trust_score: 0.87
status: active
```
```seam
lens gaps-only of session  # → only the Gap objects
lens active-hooks of registry where status = "active"
# lens never modifies the field
```

---

### WIRE OPERATIONS — hooks and the bus

---

**`emit`** — send a signal on the event bus
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.96
status: active
```
```seam
emit "architect.spec.changed" with { specId, version }
emit "architect.gap.opened" with gap
emit "architect.snr.flagged" with { score: 0.3, sourceId }
```

---

**`watch`** — subscribe to a bus event
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.95
status: active
```
```seam
watch "architect.hook.added":
  validate hooks
  emit "architect.hooks.validated" with { count: hooks.length }
```

---

**`hook`** — declare or invoke a hook by name
```
causedBy: this session — hooks are first-class in Seam/Architect
trust_score: 0.92
status: active
```
```seam
# invoke a hook:
hook "architect.blueprint.build" with { source: "spec", specId }

# declare a hook inline (compiles to Hook Registry entry):
hook "my-module.thing.done" as event-bus:
  from "my-module"
  to "*"
  schema:
    input: { thingId: text, result: flag }
    output: nothing
    errors: [{ code: "THING_FAILED", recoverable: yes }]
```

---

**`wire`** — connect two hooks
```
causedBy: this session — wire is the verb for HookBinding
trust_score: 0.89
status: active
```
```seam
wire "architect.spec.changed" to "architect.blueprint.rebuild"
wire "architect.snr.flagged" to "architect.gap.open"
```

---

**`call`** — invoke an api hook and wait for response
```
causedBy: this session — emit is fire-forget, call is request-response
trust_score: 0.90
status: active
```
```seam
make result = call "architect.spec.validate" with { specPath }
if result.ok:
  show "spec valid"
otherwise:
  show result.errors
```

---

**`stream`** — open a streaming hook connection
```
causedBy: this session — continuous data flows need their own verb
trust_score: 0.87
status: active
```
```seam
stream "architect.timeline.events" from session.id:
  for each event in chunk:
    show event.type
```

---

### QUERY OPERATIONS — finding things

---

**`find`** — query a collection with a constraint
```
causedBy: rheon-kernel-spec §10.3
trust_score: 0.94
status: active
```
```seam
find hook where type = "gate" and status = "active"
find gap where severity = "critical" and status = "open"
find session where snrScore > 0.85
find event where causedBy = root-event.id
```

---

**`where`** — constraint filter (used with find, for each, read)
```
causedBy: this session — natural predicate keyword
trust_score: 0.93
status: active
# 'where' is always attached to find/for-each/read — not standalone
```

---

**`count`** — count items satisfying a constraint
```
causedBy: this session — common need, deserves its own word
trust_score: 0.86
status: active
```
```seam
make open-gaps = count gaps where status = "open"
make critical = count gaps where severity = "critical"
```

---

**`first`** / **`last`** — bounded query
```
causedBy: this session — find can return many; often you need one
trust_score: 0.84
status: active
```
```seam
make latest = last session
make earliest-gap = first gap where severity = "critical"
```

---

### BLUEPRINT AND SPEC OPERATIONS

---

**`blueprint`** — build or reference a structural digest
```
causedBy: this session — blueprint is a first-class Seam operation
trust_score: 0.91
status: active
```
```seam
make b = blueprint from spec "architect.spec.json"
make b = blueprint from session session-id
show b.snrScore
show b.gaps
```

---

**`compress`** — encode a kernel or session to .urck
```
causedBy: this session — compress is a first-class operation in this universe
trust_score: 0.90
status: active
```
```seam
make artifact = compress session with { embedBaseline: yes }
write artifact to file session.id + ".urck"
```

---

**`decompress`** — restore from .urck
```
causedBy: this session — symmetric to compress
trust_score: 0.90
status: active
```
```seam
make session = decompress file "session-001.urck"
show session.eventCount
```

---

**`clip`** — extract a bounded causal segment
```
causedBy: this session — clips are the atomic unit of behavioral transfer
trust_score: 0.89
status: active
```
```seam
make segment = clip session from 1000 to 2000
make segment = clip session from checkpoint-a to checkpoint-b
replay segment
```

---

**`replay`** — replay a clip or session
```
causedBy: this session — reconstruct/replay is core to this universe
trust_score: 0.91
status: active
```
```seam
replay segment
replay segment dry-run
replay session from 18442
replay session until divergence-detected
```

---

**`rewind`** — restore kernel state to an event index
```
causedBy: this session — rewind is the self-healing operation
trust_score: 0.90
status: active
```
```seam
rewind session to 18442
rewind session to checkpoint "cp-001"
rewind session to lcp-of other-session
```

---

**`translate`** — convert representation across surfaces
```
causedBy: this session — translate is the constraint-preserving conversion verb
trust_score: 0.88
status: active
```
```seam
translate field-of session to schema
translate clip-001 to timeline as markdown
translate "make score = 0.8" to js
```

---

**`snr`** — score a value for signal quality
```
causedBy: this session — SNR gate is first-class, deserves a keyword
trust_score: 0.91
status: active
```
```seam
make quality = snr of blueprint-001
if quality.score < 0.65:
  gap "low-signal" with pressure 1.0 - quality.score

snr of result then:
  if score > 0.85: route to ollama
  if score > 0.65: show quality.tags
  otherwise: gap "output-too-noisy" with pressure 0.9
```

---

**`route`** — send SNR-gated output to an engine
```
causedBy: this session — route is the verb for SNR → ollama/raid dispatch
trust_score: 0.89
status: active
```
```seam
route result to ollama using model "deepseek-r1:8b"
route result to raid using strategy "vote"
```

---

### SEAM-SPECIFIC — grammar negotiation

---

**`propose`** — propose a new keyword
```
causedBy: this session — language growth needs its own syntax
trust_score: 0.87
status: active
```
```seam
propose "fork" meaning:
  "create a divergent copy of a session or blueprint
   that shares history up to the fork point but evolves independently"
  maps to: architect.session.fork / blueprint.fork
  causedBy: this session
```
The compiler captures the proposal, records it in JAA grammar table,
assigns status 'emerging', and waits for acceptance.

---

**`accept`** / **`reject`** — respond to a keyword proposal
```
causedBy: this session — the human decides, not the LLM
trust_score: 0.88
status: active
```
```seam
accept "fork"
# keyword is now status: active, available immediately

reject "fork" because "scope is not clear yet"
# recorded as negative space. rejection is data.
```

---

## COMPILE TARGETS

Seam compiles in two passes:

### Pass 1: Constraint Field Extraction

Every statement is converted to its constraint geometry:

```
make score = 0.8
→ Constraint { type: 'hard', name: 'score-initial', condition: { value: 0.8 } }
→ State { properties: { score: 0.8 } }

constrain score by (number and 0..1)
→ Constraint { type: 'hard', name: 'score-range', condition: { type: 'number', min: 0, max: 1 } }

add 0.3 to score
→ Transition { from: { score: 0.8 }, to: { score: 1.1 } }
→ Gap { missingVariable: 'score-range-valid', affectedConstraint: 'score-range', pressure: 0.7 }
# 1.1 violates 0..1 — gap emitted, not crash
```

### Pass 2: JavaScript Projection

The constraint field is projected into a JavaScript module:

```javascript
// compiled from seam — do not edit directly
// constraint field: 3 constraints, 1 gap, 0 tensions

const __field = {
  constraints: [
    { id: 'score-initial', type: 'hard', condition: { value: 0.8 } },
    { id: 'score-range',   type: 'hard', condition: { type: 'number', min: 0, max: 1 } },
  ],
  gaps: [
    { id: 'score-range-valid', pressure: 0.7, missingVariable: 'valid-score-after-add' }
  ],
};

let score = 0.8;
score = score + 0.3;
// gap: score-range-valid | pressure: 0.7
__emit('architect.gap.opened', { id: 'score-range-valid', pressure: 0.7 });
```

The JS module imports nothing external.
The constraint field is embedded as a comment block and as `__field`.
Every gap emits an event on the bus.

---

## A COMPLETE SEAM PROGRAM

```seam
## validate-and-score-session
## validates a session, scores it, routes output

define run using session-id:
  given session-id is not nothing

  ## load session
  make session = read session from jaa.sessions where id = session-id
  given session is not nothing

  ## validate integrity
  make report = call "architect.reconstruct.validate" with { sessionId: session-id }
  if report.valid = no:
    gap "session-corrupt" with pressure 1.0
    show "session " + session-id + " failed integrity check"
    show report

  ## build blueprint
  make b = blueprint from session session-id
  show "blueprint built: " + b.id
  show "  gaps: " + count b.gaps
  show "  macros: " + count b.macros

  ## score
  make quality = snr of b
  show "snr score: " + quality.score

  ## route
  snr of b then:
    if score > 0.85:
      route b to ollama using model "deepseek-r1:8b"
      emit "architect.session.scored" with { sessionId: session-id, score: quality.score, routed: "ollama" }
    if score > 0.65:
      show "score borderline — reviewing gaps"
      for each gap in quality.gaps where severity = "high":
        show gap
      emit "architect.session.held" with { sessionId: session-id, score: quality.score }
    otherwise:
      gap "output-too-noisy" with pressure 1.0 - quality.score
      emit "architect.session.flagged" with { sessionId: session-id, score: quality.score }

run using session-id = "session-001"
```

---

## A HOOK DECLARATION IN SEAM

```seam
## declare the hook for session validation
hook "architect.session.validate" as api:
  from "architect.cli"
  to "architect.reconstruct"
  direction: unidirectional
  timeout: 5000
  schema:
    input:  { sessionId: text }
    output: { valid: flag, corruptAt: number or nothing, orphanedEdges: list }
    errors: [
      { code: "SESSION_NOT_FOUND", recoverable: no },
      { code: "TIMEOUT", recoverable: yes }
    ]
  contract:
    axioms: ["§I-9", "§2.1"]
    sideEffects: []
    idempotent: yes
    replayable: yes
    snrGated: no
```

---

## A BLUEPRINT DEFINITION IN SEAM

```seam
## describe the architect spec surface as a blueprint
blueprint "architect-core":
  layers: [0, 1, 2, 3, 4, 5, 6, 7]
  surfaces:
    - "constraint-field"   at layer 0
    - "spec-engine"        at layer 1
    - "hook-registry"      at layer 2
    - "topology-mapper"    at layer 3
    - "schema-builder"     at layer 4
    - "cli"                at layer 5
    - "ui"                 at layer 6
    - "snr-gate"           at layer 7
  constraints:
    - constrain imports by "no layer imports from above itself"
    - constrain hooks by "all wires declared before used"
    - constrain output by "all output passes snr before leaving"
```

---

## ERROR MODEL

Seam does not throw exceptions.
Seam emits gaps.

```
A runtime error is a constraint violation.
Constraint violations produce Gap objects.
Gap objects are emitted on the bus.
The program continues.
The operator decides what to do with the gap.
```

```seam
# instead of try/catch:
make result = call "architect.spec.validate" with { specPath }

if result is nothing:
  gap "validation-returned-nothing" with pressure 0.9
  # program continues — gap is now open in JAA
otherwise:
  show result
```

The only hard stop in Seam is a violated `given`:

```seam
define compress using session:
  given session is not nothing    # hard — stops here, emits gap, returns nothing
  given session.integrity = "valid"  # hard stop if corrupt
  make artifact = compress session
```

---

## FILE FORMAT

Seam files use the `.seam` extension.
They are UTF-8 plain text.
The first non-comment, non-blank line is the program entry point or a definition.

```
myprogram.seam            ← main program
definitions/
  validation.seam         ← reusable definitions
  scoring.seam
hooks/
  architect-hooks.seam    ← hook declarations
blueprints/
  architect-core.seam     ← blueprint declarations
```

---

## GRAMMAR TABLE — CURRENT STATE

All keywords active in v0.1.0.
`causedBy: seam-lang-spec-0000-2026-0530-jamesbrooks-001`

```
keyword       type          status     trust
─────────────────────────────────────────────
make          primitive     active     0.97
set           primitive     active     0.91
add           primitive     active     0.95
remove        primitive     active     0.88
show          primitive     active     0.95
write         primitive     active     0.94
read          primitive     active     0.90
if            control       active     0.96
otherwise     control       active     0.96
when          control       active     0.95
repeat        control       active     0.90
for each      control       active     0.93
while         control       active     0.85
until         control       active     0.82
define        definition    active     0.96
using         definition    active     0.94
given         definition    active     0.86
gap           field         active     0.95
fill          field         active     0.93
tension       field         active     0.93
constrain     field         active     0.94
field of      field         active     0.88
lens          field         active     0.87
emit          wire          active     0.96
watch         wire          active     0.95
hook          wire          active     0.92
wire          wire          active     0.89
call          wire          active     0.90
stream        wire          active     0.87
find          query         active     0.94
where         query         active     0.93
count         query         active     0.86
first         query         active     0.84
last          query         active     0.84
blueprint     blueprint     active     0.91
compress      blueprint     active     0.90
decompress    blueprint     active     0.90
clip          blueprint     active     0.89
replay        blueprint     active     0.91
rewind        blueprint     active     0.90
translate     blueprint     active     0.88
snr           quality       active     0.91
route         quality       active     0.89
propose       seam          active     0.87
accept        seam          active     0.88
reject        seam          active     0.88
```

Total: 46 keywords · 0 deprecated · 0 rejected (yet)

---

## OPEN GAPS IN THE LANGUAGE

```
G-L-001  HIGH    No module/import system yet
                 All definitions are global in v0.1.0.
                 'import' keyword needed when files reference each other.
                 Proposal: import <name> from <file>

G-L-002  HIGH    No async/parallel model
                 'call' blocks. 'stream' is implicit async.
                 Concurrent operations not yet expressible.
                 Proposal: 'alongside' for parallel execution

G-L-003  MEDIUM  No pattern matching beyond if/otherwise
                 'match' keyword would clean up multi-branch constraint logic
                 Proposal: match <value> with patterns

G-L-004  MEDIUM  'given' has no explicit gap-emit control
                 Currently emits a generic gap on failure.
                 Should be: given session is not nothing else gap "session-missing"

G-L-005  LOW     Number range syntax (0..1) not formally specified
                 Used in constrain — needs full range expression grammar

G-L-006  SEED    No macro keyword for recording/naming recurring patterns
                 Macros are detected by the compiler — not yet expressible in source
```

---

## DELTA RECORD

```
v0.1.0 — 2026-05-30
  FOUNDED by: "lets make our coding language" — James Brooks
  causedBy: seam-lang-spec-0000-2026-0530-jamesbrooks-001

  INHERITED from RHEON-KERNEL-SPEC-v2.1.0 §10:
    make, show, add, repeat, for each, if/otherwise, when,
    define, find, write, gap, fill, tension, constrain, field of,
    emit, watch
    (17 keywords, all causedBy: rheon-kernel-spec)

  INVENTED in this session:
    set, remove, read, while, until, given, lens, hook, wire,
    call, stream, where, count, first, last, blueprint, compress,
    decompress, clip, replay, rewind, translate, snr, route,
    propose, accept, reject
    (27 keywords, all causedBy: this session)

  COMPILE TARGETS defined:
    Pass 1: ConstraintField extraction
    Pass 2: JavaScript projection

  ERROR MODEL defined:
    Gaps not exceptions. given is the only hard stop.

  STATUS: emerging · 46 keywords · 6 gaps open
```

---

*"A grammar that has never existed before."*
*Every keyword was negotiated.*
*The ledger is gold.*

---

## WEB GRAMMAR — v0.1.1 EXTENSION

> "this, meaning making web"
> — James Brooks, 2026-05-30, causedBy: this session

The web *is* the grammar. A Seam program is not a sequence of statements.
It is a **path through the web**.

### THE WEB STRUCTURE

```
                    define·given
                         N
            for·each  NW   NE  blueprint·compress
                  W ─ core ─ E
             translate  SW   SE  replay·rewind
                         S
                    snr·route

CORE (sealed):   JAA · SISO — immutable state + event bus
RING 1 (r=148):  primitives — make·set, emit·watch, gap·fill,
                              find·where, if·when, tension·constrain,
                              lens·field, write·read
RING 2 (r=220):  composites — define·given, blueprint·compress,
                              hook·wire, replay·rewind, snr·route,
                              propose·seam, translate·clip, for each·repeat
```

### WEB INVARIANTS

```
WEB-1  ADJACENCY IS GRAMMAR
       Valid transitions are between adjacent nodes only.
       N↔NE↔E↔SE↔S↔SW↔W↔NW within a ring.
       Any ring node ↔ core (via bus only).
       Ring 1 ↔ Ring 2 same direction (N-inner ↔ N-outer).
       Non-adjacent jumps require an explicit bridge keyword.

WEB-2  THE CORE IS NEVER VISITED
       No statement touches the core directly.
       State reads/writes pass through write·read (NW-inner).
       Bus events pass through emit·watch (NE-inner).
       The core is implicit — always present, never named in code.

WEB-3  MEANING FLOWS OUTWARD
       Inner ring operations are prerequisites for outer ring operations.
       You cannot define without first making.
       You cannot blueprint without first writing.
       You cannot snr without first emitting.
       The web encodes these dependencies as adjacency.

WEB-4  A PROGRAM HAS A SHAPE
       The compiler traces which nodes were visited and in what order.
       That trace IS the program's constraint geometry.
       Two programs with identical output but different web paths
       have different constraint fields. They are not the same program.

WEB-5  GAPS BREAK THE PATH
       A gap at any node interrupts the path.
       The path resumes only when the gap is filled.
       An unfilled gap at compilation time = partial constraint field.
       The compiler emits what it can. Missing edges are surfaced.

WEB-6  THE WEB IS THE TYPE SYSTEM
       The node a value originates from determines its constraint shape.
       A value from make·set satisfies: declared, named, mutable.
       A value from gap·fill satisfies: was-absent, now-present, pressured.
       A value from lens·field satisfies: read-only, projected, not-mutating.
       Passing a lens value to write·read is a web type error (non-adjacent path).
```

### PATH NOTATION

A program written as a web path uses `→` to show movement between nodes:

```
make·set → emit·watch          # valid: adjacent NW→NE in ring 1
make·set → write·read → define # valid: NW-inner → NW-inner → NW-outer
gap·fill → find·where          # valid: E→SE adjacent
lens·field → write·read        # INVALID: W→NW non-adjacent across type boundary
                               # gap emitted: WEB-TYPE-VIOLATION pressure 0.8
```

The compiler renders every program as its web path in the constraint field output.

### COMPILATION — PASS 0: WEB PATH EXTRACTION

Before Pass 1 (constraint field) and Pass 2 (JS projection),
the compiler now runs Pass 0: web path extraction.

```
Pass 0: source → sequence of (node, keyword, args) tuples
        → validates adjacency for each consecutive pair
        → emits WEB-TYPE-VIOLATION gap for non-adjacent jumps
        → produces: WebPath { nodes: NodeVisit[], edges: WebEdge[], shape: string }

Pass 1: WebPath → ConstraintField (unchanged)
Pass 2: ConstraintField → JavaScript module (unchanged)
```

The `shape` field in WebPath is a compact representation of the program's topology:

```
"NW·NE·E·SE·S"       # a path that sweeps clockwise through ring 1
"N2·NE2·E2"          # a path through ring 2 (2 = outer ring)
"NW·core·NE"         # impossible — WEB-2 violation
"NW·NE·NE2·N2·NW2"  # a path that crosses rings
```

### THE BRIDGE KEYWORD

Non-adjacent jumps require `bridge`:

```seam
bridge make·set to gap·fill:
  # this crosses from NW to E — non-adjacent
  # bridge makes the gap explicit rather than a violation
  make score = 0.8
  gap "score-needs-validation" with pressure 0.4
```

`bridge` is not a shortcut. It forces the programmer to name the conceptual
distance being crossed. The name becomes a constraint in the field.

### PROGRAM SHAPES

Some shapes have names. Named shapes are reusable patterns.

```
declare-and-persist:   make·set → write·read
                       (NW-inner → NW-inner, trivial path)

declare-and-emit:      make·set → emit·watch
                       (NW-inner → NE-inner, clockwise step)

query-and-branch:      find·where → if·when
                       (SE-inner → S-inner, clockwise step)

gap-and-resolve:       gap·fill → find·where → fill
                       (E → SE → E, oscillation)

quality-check:         make·set → snr·route
                       requires bridge (NW-inner → S-outer, long jump)
                       or the full path: make → write → define → blueprint → snr

full-sweep:            make·set → emit·watch → gap·fill → find·where →
                       if·when → tension·constrain → lens·field → write·read
                       (complete ring 1 clockwise circuit)

meaning-arc:           write·read → define·given → blueprint·compress → snr·route
                       (NW-inner → N-outer → NE-outer → S-outer)
                       the arc from persistence through structure to quality
```

### SEAM IN THE WEB

The `propose·seam` node (SW-outer) is where grammar growth happens.
When the AI or the programmer uses a word not in the ledger,
the compiler pauses at the nearest adjacent node and surfaces
the unknown word as a `seam` event — not a gap, not an error.

```seam
# programmer writes a word not in the ledger:
fork session at checkpoint-001

# compiler: 'fork' not in grammar table
# nearest adjacent node: replay·rewind (SE-outer)
# compiler emits seam event from SW-outer:
propose "fork" from replay·rewind:
  "diverge from a session at a checkpoint, creating independent trajectory"
  adjacent to: replay·rewind (SE), translate·clip (W)
  trust: 0.0 → awaiting accept
```

The web topology tells you *which* adjacent nodes a proposed keyword
would sit between — that is its semantic position before it has a name.

### DELTA RECORD UPDATE

```
v0.1.1 — 2026-05-30
  EXTENDED by: "continue" — James Brooks
  causedBy: this session

  ADDED:
    - §WEB GRAMMAR — the web is the grammar
    - WEB-1 through WEB-6 invariants
    - Pass 0: web path extraction
    - WebPath { nodes, edges, shape } type
    - Path notation (→ arrows)
    - Named program shapes: declare-and-persist, full-sweep, meaning-arc, etc.
    - bridge keyword — explicit non-adjacent jump
    - Seam events surface from web topology, not from a keyword list
    - Node adjacency encodes the type system (WEB-6)

  KEYWORD ADDED:
    bridge  — explicit non-adjacent jump
              cat: web, trust: 0.83, status: active
              causedBy: this session

  STATUS: emerging · 47 keywords · 6 gaps open (G-L-001 through G-L-006)
```

*The web is the grammar.*
*A program is a path.*
*Meaning is downstream of the shape.*

---

## IF·WHEN NODE — FULL SPECIFICATION

**Web position:** S · Ring 1 · angle 90°
**Adjacent nodes:** find·where (SE), tension·constrain (SW)
**Spoke to core:** direct — shortest ring-1 path to the event bus
**causedBy:** this session

---

### THE FUNDAMENTAL CLAIM

`if·when` is not control flow.
It is **state-space geometry**.

Every branch statement is a formal partition of the constraint field.
The compiler does not choose a branch.
The compiler holds both simultaneously until runtime forces resolution.
Until then, both branches exist as competing constraint surfaces.

This is why `tension·constrain` (SW) is the adjacent node.
The path `tension·constrain → if·when` is the arc from
unresolved competition to forced resolution.
Both directions are valid. Both are one step.

---

### KEYWORD EXECUTION MODEL

#### `if` / `otherwise`

```
if <condition>:
  <then-body>
otherwise if <condition>:
  <elif-body>
otherwise:
  <else-body>
```

**Constraint field semantics:**

```
Constraint A: { type: 'hard', condition: <condition>,     branch: 'then' }
Constraint B: { type: 'hard', condition: NOT <condition>, branch: 'else' }

Both A and B are emitted to the constraint field simultaneously.
Both are written to JAA before any branch body executes. (§2.1)
Runtime selects one. The other is not discarded — it is marked resolved:false.
The field retains both. The resolution is data.
```

**Web path semantics:**

```
# the then-branch and else-branch are forking sub-paths on the web
# each branch is its own path segment
# the compiler renders them as a fork in the path geometry

if score > 0.85:             # if·when node activated
  route b to ollama          # → snr·route (ring 2, S-outer) — sub-path A
otherwise:
  gap "low-signal" with ...  # → gap·fill (ring 1, E) — sub-path B

# the fork is drawn: if·when → {A: snr·route, B: gap·fill}
# the branches may be non-adjacent — each gets its own adjacency check
# a bridge inside a branch is still a bridge
```

**JAA record (both branches, before execution):**

```typescript
{
  id:         UUID,
  type:       'branch',
  condition:  'score > 0.85',
  branches: {
    then: { constraints: [...], webPath: ['snr·route'] },
    else: { constraints: [...], webPath: ['gap·fill'] },
  },
  resolved:   null,       // null until runtime
  resolvedAt: null,
  causedBy:   string,     // event that triggered this branch
  ts:         number,
}
```

**After runtime resolution:**

```typescript
{
  ...
  resolved:   'then',     // or 'else'
  resolvedAt: number,     // tick
  notTaken:   { branch: 'else', constraints: [...] }
  // notTaken is never discarded — §UNFLATTEN
}
```

---

#### `when`

```
when "<event-type>":
  <body>
```

`when` is a **temporal constraint with a bus subscription lifecycle.**
It is not an event handler in the traditional sense.
It is a declaration that a constraint field activation is pending
until the bus delivers the named signal.

**Lifecycle:**

```
1. DECLARED
   when "architect.spec.changed":
   → Constraint { type: 'temporal', condition: 'event received', status: 'pending' }
   → Subscription registered in SISO bus (through the core spoke at S)
   → JAA record written: { type: 'watch', event: 'architect.spec.changed', status: 'pending' }
   → Body is compiled but not executed — it is a latent constraint field

2. TRIGGERED
   Bus emits 'architect.spec.changed' with payload
   → Constraint status: 'pending' → 'active'
   → Body executes with event payload bound as 'event'
   → All body constraints are activated and written to JAA

3. COMPLETED
   Body finishes
   → Constraint status: 'active' → 'resolved'
   → Subscription remains active (when is persistent unless explicitly unwatched)
   → Next trigger restarts from step 2

4. UNWATCHED
   unwatch "architect.spec.changed"
   → Subscription removed from SISO
   → Constraint status: 'resolved' → 'closed'
   → JAA record updated: closed at tick N
```

**`event` binding inside when:**

```seam
when "architect.gap.opened":
  show event.gap.id
  show event.gap.pressure
  if event.gap.severity = "critical":
    emit "architect.gap.escalate" with { gap: event.gap }
```

`event` is always the payload of the triggering bus event.
It satisfies: read-only, bound, typed from the hook schema.
It maps to the `lens·field` node by constraint shape —
even though it appears inside `if·when`.
This is a legal cross-node reference because lens values
are readable from any position. They carry their origin node.

**Web path of a `when` block:**

```
# when itself activates if·when (S)
# body statements trace their own sub-path from S outward
# the sub-path is latent until the event arrives

when "architect.spec.changed":       # if·when · S · pending
  read spec from jaa.blueprints      # write·read · NW · (adjacent: SW→NW clockwise)
  make b = blueprint from spec       # make·set → blueprint·compress
  emit "architect.blueprint.rebuilt" # emit·watch · NE
```

---

#### `while` / `until`

```
while <condition>:
  <body>

until <condition>:
  <body>
```

**Difference:**

```
while: loop WHILE condition is true  — body runs as long as constraint holds
until: loop UNTIL condition is true  — body runs until constraint inverts
```

They are semantic inverses. Both compile to the same constraint structure:

```typescript
{
  type:      'iterative',
  condition: string,
  inverse:   boolean,    // false for while, true for until
  iterations: number[],  // tick of each iteration — recorded
  settled:   boolean,    // true when exit condition met
  overflow?:  Gap,       // emitted if iterations exceed safe limit
}
```

**Overflow protection:**

```seam
while score < 0.85:
  add 0.05 to score
```

The compiler inserts an implicit iteration counter.
If iterations exceed the declared safe limit (default: 1000),
a gap is emitted and the loop halts:

```
Gap { id: 'while-overflow', pressure: 1.0,
      missingVariable: 'loop-exit-condition',
      affectedConstraint: 'score < 0.85' }
```

The loop does not crash. It surfaces the gap. The operator decides.

**`until` natural use:**

```seam
replay session until divergence-detected
```

This is `until` used as a termination condition for a streaming operation —
not a traditional loop. The compiler recognizes this pattern and maps it
to the `replay·rewind` node (SE-outer) with `until` as the exit constraint.
The path is: `if·when (S) → replay·rewind (SE-outer)` — a long jump.
Requires `bridge` unless the full intermediate path is walked.

---

### BRANCH FORKS IN WEB GEOMETRY

A branch creates a **fork in the web path.**
The fork is rendered as two sub-paths diverging from the `if·when` node:

```
         [if·when · S]
              │
    ┌─────────┴─────────┐
    │ then              │ else
    ▼                   ▼
[snr·route · S2]   [gap·fill · E]
```

Fork rules:

```
FORK-1  Each branch is its own valid (or invalid) web path.
        Adjacency is checked independently per branch.

FORK-2  Both branches are compiled and written to JAA before runtime.
        §2.1 applies to both sides of every fork.

FORK-3  Branch paths may re-converge at a downstream node.
        Convergence is noted in the constraint field as a join.

FORK-4  Nested branches are nested forks.
        The web path becomes a tree, not a line.
        The shape name reflects the deepest branch: 'forked-N' where N = depth.

FORK-5  The not-taken branch is never discarded. (§UNFLATTEN)
        It is written to JAA with resolved: false.
        It may be queried: find branch where resolved = false
        It may be replayed: replay branch where id = X
```

---

### WHEN AS LATTICE EDGE

Every `when` subscription creates a **latent lattice edge** in the ALK kernel.

```
when "architect.spec.changed":
→ LatticeEdge {
    from:     null,          // no source yet — pending
    to:       <when-block>,
    type:     'temporal',
    status:   'latent',
  }
```

When the event arrives:

```
→ LatticeEdge {
    from:     <triggering-event-id>,
    to:       <when-block-first-event-id>,
    type:     'causal',
    status:   'active',
  }
```

The `when` block's first emitted event will have `causedBy` set to
the triggering event's id. The causal chain is closed automatically.
The programmer never sets `causedBy` manually.
The lattice builds itself from the `when` declaration.

This is why `when` lives at S — the shortest spoke to the core (SISO bus).
The subscription is registered directly through that spoke.
No other ring-1 node has a shorter path to the bus.

---

### SEAM SYNTAX — COMPLETE IF·WHEN EXAMPLES

```seam
## 1. simple branch
if quality.score > 0.85:
  route result to ollama
otherwise:
  gap "quality-insufficient" with pressure 1.0 - quality.score

## 2. multi-branch
if severity = "critical":
  emit "architect.gap.critical" with { gap }
otherwise if severity = "high":
  emit "architect.gap.high" with { gap }
otherwise:
  write gap to jaa.gaps

## 3. event subscription
when "architect.hook.added":
  validate hooks
  emit "architect.hooks.validated" with { count: hooks.length }

## 4. compound when with branch
when "architect.session.ended":
  make b = blueprint from session event.sessionId
  make quality = snr of b
  if quality.score > 0.65:
    route b to ollama
  otherwise:
    gap "session-too-noisy" with pressure 0.9

## 5. while loop
while open-gaps > 0:
  make gap = first gap where status = "open"
  emit "architect.gap.surface" with { gap }
  fill gap.id with gap.suggestion

## 6. until as termination
replay session from 18442 until divergence-detected

## 7. nested fork
if session.integrity = "valid":
  if session.snrScore > 0.85:
    route session to ollama
  otherwise:
    route session to raid using strategy "vote"
otherwise:
  gap "session-corrupt" with pressure 1.0
  emit "architect.session.flagged" with { sessionId: session.id }
```

---

### NEW KEYWORDS FROM THIS NODE

```
unwatch   — close a when subscription
            cat: wire, trust: 0.84, status: active
            causedBy: this session

            unwatch "architect.spec.changed"
            → subscription closed · lattice edge sealed · JAA updated
```

Total grammar: **48 keywords** (47 + unwatch)

---

### OPEN GAPS FROM THIS NODE

```
G-L-007  MEDIUM  No timeout declaration on when
                 A when subscription with no event arriving is
                 invisible — it accumulates latent constraints silently.
                 Proposal: when "event" timeout 5000ms else: ...

G-L-008  MEDIUM  branch replay not yet wired to reconstruct
                 'replay branch where id = X' is declared but
                 the reconstruct engine does not yet expose branch-level replay.
                 Only full session replay is available.

G-L-009  LOW     until as termination not formally distinguished
                 from until as loop. Same syntax, different semantics
                 depending on whether the body is streaming or iterative.
                 Compiler currently infers from context — fragile.
```

---

### DELTA RECORD UPDATE

```
v0.1.2 — 2026-05-30
  EXTENDED by: "continue" — James Brooks, then "continue" again
  causedBy: this session

  ADDED:
    - §IF·WHEN NODE — full specification
    - if/otherwise JAA record schema (both branches, pre-execution)
    - when lifecycle: declared → triggered → completed → unwatched
    - event binding: read-only, lens-shaped, causedBy auto-wired
    - while/until: iterative constraint + overflow protection
    - FORK-1 through FORK-5: branch geometry rules
    - when as lattice edge: latent → causal on trigger
    - 7 complete examples
    - unwatch keyword (48 total)
    - G-L-007 through G-L-009: 3 new gaps

  STATUS: emerging · 48 keywords · 9 gaps open
```

*"A branch is a tension that resolved.*
*The web holds both sides.*
*The not-taken path is not discarded — it is data."*
