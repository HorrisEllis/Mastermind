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
