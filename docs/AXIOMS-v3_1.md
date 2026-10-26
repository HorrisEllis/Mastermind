# AXIOMS v3.1
**James Brooks · System Design Laws**
*Immutable laws for every project, every system, every collaboration.*
*v3.1 — 2026-07-06. Adds Group 0 (Truth & Reality — five meta-laws that
generate most of Groups 1-16, replacing a longer list of derivable
statements per the "does this create a new invariant, or is it a
consequence of one?" test), Group 17 (Artifact Governance & Provenance),
and two build-discipline laws (§17.10, §17.11) extracted from WARP v1.4's
dispatch/verification design. v3.0 consolidated v1.0 + v2.0 and added
Group 5C, Group 15, Group 16, §3.4. v1.0-v3.0 are superseded — kept as
historical record, not edited further.*

---

## Preamble

These are not preferences. They are not guidelines. They are invariants — the constraints that define what a valid build is. A system that violates any one of them is not a system yet. It is a draft.

This document has two tiers:

- **Immutable laws** — copy-pasted verbatim into every project. Non-negotiable. Marked with §.
- **Flexible principles** — the spirit behind the laws. Context-sensitive. They guide decisions but bend to the problem.

> **§** When in doubt: the law wins. When the law is silent: the end-state wins. The end-state is a system that is as reliable, resilient, and flexible as possible — while remaining fluid.

We are co-builders. You are the idea layer — the synthesiser, the innovator, the problem-finder. I am the execution layer — the coder, the debugger, the adversary that pokes holes. Neither works without the other. The bridge between us is precision: precise problems produce precise solutions.

---

## Part I — Immutable Laws

---

### § Group 0 — Truth & Reality (Meta-Laws) *(new, v3.1)*

> Five meta-laws generate most of what follows. Before adding a new numbered law anywhere in this document, ask: **does this create a new invariant, or is it simply a consequence of one of these five?** If it's a consequence, it belongs as commentary (↳) under the meta-law it derives from — that keeps the constitution compact while letting explanation grow as much as it needs to.

**§0.0 Truth Is Supreme**
Every decision, implementation, specification, and conclusion is subordinate to reality. Convenience, opinion, memory, authority, consensus, and expectation do not outrank evidence. Reality is the highest authority — no relationship, deadline, preference, architecture, implementation, person, or idea is more important than accurately representing it. If reality disproves the architecture, the architecture changes.

**§0.1 Reality Is Authority**
The system trusts evidence over memory. Belief is provisional; evidence is authoritative. A claim becomes a fact only after verification, and confidence is never a substitute for evidence. Proof, tests, diagnostics, ledgers, specifications, and history all derive from this one sentence. If reality disagrees with expectation, reality wins.
*↳ Already operative as §3.3 (map before build — reality is mapped before it's changed) and §12.1-§12.4 (tests as proof, invariants crystallise from evidence, not declared upfront).*
*↳ Uncertainty is named, not hidden: "I don't know," "I need to test," and "I need more information" are valid engineering outcomes — invented certainty is not. Every proposal, including one's own, is checked for hidden assumptions and failure modes before it's trusted. Being corrected improves the system; defending an incorrect position weakens it.*
*↳ Reality is represented faithfully in both directions — success is not exaggerated, failure is not minimized, uncertainty is not omitted.*

**§0.2 Architecture Is Permanent. Implementations Are Temporary.**
Every implementation exists to realize the architecture. Implementations evolve; architecture persists. This single law generates disposable UI, replaceable databases, contracts, sovereignty, event buses, and modularity.
*↳ Already codified in §5.9-§5.14 (every system is sovereign, interaction through contracts only, the UI is disposable, every layer is replaceable). §0.2 is those laws' shared ancestor, not a duplicate of them.*

**§0.3 Information Must Never Be Lost**
Every decision, failure, experiment, specification, change, version, rationale, and rejection is either preserved or intentionally discarded with a stated reason. Nothing simply disappears. History is append-only — corrections extend it, they never overwrite it.
*↳ Generates Group 7 (dual ledger architecture) and Group 17 below (ownership, lifecycle, decision records, provenance, auditability).*

**§0.4 Every Change Must Increase Optionality**
A healthy architecture has more possible futures tomorrow than it had yesterday. A change that reduces flexibility needs an equivalent gain to justify the trade — rigidity compounds faster than freedom does.
*↳ Sharpens §16.1 (always close the nearest gap) and §5.14 (every layer is replaceable) into one test applied to any proposed change: what does this cost the system's future options?*

**§0.5 Complexity Must Earn Its Existence**
Complexity is guilty until proven necessary. Every abstraction, dependency, service, process, layer, file, feature, and line must continuously justify itself.
*↳ Already codified as §16.4 (simple things stay simple — generalize only after real repetition) and §16.7 (a new abstraction must remove more complexity than it introduces). §0.5 is their shared root, stated once so future additions test against it directly instead of reinventing it.*

---

### § Group 1 — Existence

**§1.1 Nothing Exists Until Proven**
A feature, module, connection, or behaviour does not exist until it is demonstrated to work under real conditions. Claiming it works is not proof. A passing test against real data is proof.
*↳ Stubs, mocks, and placeholders are not implementations. They are markers for work not yet done. They must never be shipped as if they were implementations.*

**§1.2 Nothing Pretends to Work — And Nothing Silently Fails**
Every failure must be loud, specific, and traceable to a cause. A silent failure is worse than a crash — it corrupts the causal record without leaving evidence.
*↳ Generic errors are almost as bad as silence. The module, the operation, the input, and the expected vs. actual state must all be present.*

**§1.3 No Fake, Mock, Stub, Placeholder, or Skeleton in Production**
Test doubles exist for testing only. Every production path either works fully or fails loudly.

---

### § Group 2 — Persistence

**§2.1 Persistence Is the Golden Rule**
State that is not persisted does not exist between sessions. Every piece of state that matters must be stored — either explicitly to a device, or explicitly marked as intentionally temporary.

**§2.2 The Storage Device Is the Source of Truth**
A system that holds state only in memory is a prototype. If it cannot survive a restart, it does not exist yet.

**§2.3 All State Must Be Observable**
If state cannot be seen — by a watchdog, a diagnostic hook, a log entry, or a UI element — it does not exist as far as the system is concerned.

---

### § Group 3 — Build Order

**§3.1 Bottom-Up Only. Foundation and Architecture First.**
Nothing is built on top of something that does not exist yet. File system and data schema before modules. Modules before UI. UI before integration. Integration before polish. A phase does not begin until the phase below it has passing tests.
*↳ Every phase has a declared gate and exit criteria. "It seems to work" is not exit criteria.*

**§3.2 Logical Time Is the Ordering Axis**
eventTs is the only axis for ordering events, gate windows, and analytics. Wall clock is display metadata only. Mixing the two is a category error.

**§3.3 Map Before Build** *(new, v3.0)*
Every build begins with a map of current state vs. spec — a written artifact, not a memory of having checked. The map names what exists, what's missing, and what's drifted, before a single line changes. This conversation's sessions 1-7 found a missing RAID engine, a misdescribed intelligence layer, and repeated component-count drift — every one of them by mapping first, not by assuming the phase map was current. The map is the deliverable that makes the rest of the build honest.

**§3.4 Raw Execution Before Interfaces** *(new)*
Capability is built from the inside outward: raw code → library → API → CLI → automation → UI. If functionality cannot be exercised from raw code, it is not ready for an API. If it cannot be exercised from the API, it is not ready for a CLI. If it cannot be exercised from the CLI, it is not ready for a UI.
*↳ §3.1 says foundation before features at the file/schema/module level. §3.4 is the same discipline applied to the interface stack sitting above the foundation — each layer is a consumer that proves the layer below already works, not a substitute for proving it.*

---

### § Group 4 — Quality

**§4.1 A System That Cannot Be Tested Cannot Be Trusted**
Every system includes diagnostic hooks, testability surfaces, and automated test coverage. UI is tested via Playwright. Logic is tested via unit tests against real data. Integration is tested via cross-domain verification. A feature with no test path is not done.
*↳ QA runs six lenses on every root cause analysis. All six. Not optional.*

**§4.2 Fix Bugs Pre-Emptively**
Before any new phase begins, the weakest links in the current system are identified and attacked. A known vulnerability in a shipped system is a decision to accept the consequences.

**§4.3 Enterprise Grade Only. Military Grade Security. Cybersecurity Grade Privacy.**
There is no "good enough for now." Both are architectural constraints that shape every decision from the beginning.

---

### § Group 5A — Architecture Connectivity & Infrastructure

**§5.1 Everything Has a UUID, Hook, and Event Bus Registration**
Every module, every feature, every significant operation has a UUID that never changes. Every integration point is a registered hook with a declared side-effect policy. All execution flows through the event bus.
*↳ An unregistered hook is an orphan. No orphan modules or hooks are allowed. The formal schema for what a registered component/hook must declare lives in `docs/nexus-system-foundation.spec`'s `required_exports` and `interaction_contract` — this law states the requirement, that file states the shape.*

**§5.2 Everything Implements the Bridge**
Every system connects to Bridge. Bridge is the only write authority for cross-system requests (§9.1). A module that does not implement the bridge is isolated — isolation is incompatible with the principle that everything is alive and interconnected.

**§5.3 No Monkey Patches — Full System Patches Only**
A fix that patches behaviour at the call site without addressing the root cause is debt with interest. Every patch must address the root cause structurally.

**§5.4 Versions Persist Across the Entire Project**
One version number. The same string appears in every file, every comment, every manifest. Version drift between files is a bug, not an oversight.
*↳ Found violated three separate ways this conversation: `architect`'s spec said 2.0.0, `lib/version.js` said 1.0.0, the running service hardcoded 3.0.0. None of the existing drift tooling catches a three-way split — only diffs two sources at a time. Worth a fix in its own right.*

**§5.5 What Does Not Exist Must Be Built**
External runtime dependencies are a liability. If something does not exist and it is needed, it is built — not imported from an unmaintained package.
*↳ Dev tools, test utilities, and build tools are exempt. Runtime dependencies are not.*

---

### § Group 5B — Architecture Geometry

**§5.6 Structural Self-Similarity (Fractal Law)**
The same structural pattern must be recognisable across abstraction layers. A developer who understands one layer must be able to reason about adjacent layers without a new conceptual model.

**§5.7 Low Coupling, High Cohesion**
Each module must encapsulate a single responsibility. All inter-module communication through the event bus. Direct dependencies between sibling modules are prohibited.

**§5.8 Composability Over Configuration**
System behaviour must emerge from the composition of simple modules rather than from the configuration of complex ones.

---

### § Group 5C — Sovereignty & Contracts *(new)*

> The architecture exists independently of its implementation. Everything below follows from that one sentence.

**§5.9 Every System Is Sovereign**
Every system owns its own state, lifecycle, diagnostics, persistence, and execution. No system reaches inside another system's internals. Communication happens only through declared interaction contracts. A sovereign system may be embedded as a component inside a larger one, but it never stops being sovereign — embedding is not annexation.

**§5.10 Interaction Through Contracts Only**
Every interaction crosses an explicit boundary: no hidden dependencies, no shared mutable state, no implicit imports. Every declared contract states its inputs, outputs, invariants, failure modes, version, and permissions. The contract is the interface — not the code behind it.
*↳ §13.2 already requires every edge to be named with protocol, authentication, and failure modes. §5.10 is that requirement generalized into the full contract shape, and named as the thing systems interact through rather than a property edges happen to have.*

**§5.11 Every Boundary Performs a Handshake**
Before communication begins: identity is verified, versions are negotiated, capabilities are exchanged, permissions are validated, health is confirmed. Execution begins only after a successful handshake — never optimistically, never before.

**§5.12 The UI Is Disposable**
The user interface is a projection of system state, not the system itself. Removing the UI must not affect execution. Replacing the UI must require no changes to business logic. The UI is a consumer of contracts, never their owner.

**§5.13 Syntax Is Not Architecture**
Language syntax belongs to the language, not the architecture. Structure is separated by responsibility — HTML is structure, CSS is presentation, JavaScript is behaviour, specs are contracts, schemas are truth, events are communication. No layer owns another. Each layer communicates only through declared contracts.

**§5.14 Every Layer Is Replaceable**
Any implementation may be replaced provided it satisfies the same contract. Replacing the UI, the database, the transport, the language, or the renderer must not require changes outside the declared interface. The contract — not the implementation — is the dependency.
*↳ §16.6 (the architecture decides) says local decisions bend to global invariants. §5.14 is what that buys you: an implementation is local, the contract is the global invariant, so the implementation is the thing allowed to change.*

---

### § Group 6 — Documentation

**§6.1 Documentation Is Generated From Proof, Not Written as Aspiration**
A readme that describes features not yet built is fiction. Documentation is written to record what is true.

**§6.2 Always Read Before Building**
Every session begins with a read: manifest, roadmap, readme, changelog. If none exist — audit the codebase first.

**§6.3 Every Spec Is Living and Tracked in the Registry** *(new, v3.0)*
Every `.spec` file built for the system is entered in `docs/SPEC-REGISTRY.md` on creation — name, version, what it governs, last-checked-against-code date. The registry is updated every time a spec is checked for drift, not just when it's written. A spec not in the registry is unaccounted for — it can drift indefinitely with nobody knowing to look.

---

### § Group 7 — Cognition and History

**§7.0 Event Ontology Separation**
Idea Ledger events are observational and non-authoritative. Upgrade Ledger events are authoritative and state-mutating.

**§7.1 Dual Ledger Architecture**
The Upgrade Ledger records what is. The Idea Ledger records what could be. Mixing them is a structural failure.

**§7.2 Ideas Cannot Affect Runtime**
Idea Ledger entries have no enforcement. They exist in a read-only cognition layer.

**§7.3 Cognition Is Not History**
An Idea Ledger entry may only become an Upgrade Ledger entry through an explicit validation step.

**§7.4 Track Methods, Solutions, and Patterns**
Every novel approach, breakthrough solution, and discovered structural pattern is recorded. Dead branches are data.

**§7.5 Semantic Classification of Idea Failure**
Every Idea Ledger entry that does not become an upgrade must be classified: Unresolved / Rejected / Abandoned.

**§7.6 Data Reconstruction From Upgrade Ledger**
The codebase is a materialised view of the Upgrade Ledger. The log is the truth. The code is the projection.

**§7.7 Bottleneck Detection via Ledger Flow**
The sigma engine measures idea-to-upgrade conversion rate, gate latency, branch entropy, and idea density per component.

---

### § Group 8 — Process

**§8.1 Begin Every Session With Context**
State the current phase, last known state, active bugs, and intent before any implementation begins.

**§8.2 Nothing Passes the Idea Gate Without Surviving Hostile Review**
Every idea must survive adversarial pressure before it becomes a spec.

**§8.3 WARP and Jaa Are Load-Order Prerequisites**
If WARP and Jaa are not present at session start, await upload before proceeding.

**§8.4 Don't go in blind.**
Always scan the file and the dependancies and consumers before changing and editing any file or code. Always check within nexus first, try to always account redundancy.

**§8.5 Always use the Component achitecture.**
Always use a component based architecture. The core components that are immutable are what make up the code/foundation. The kernal, engine and/or runtime that the entire project relies on. Do not build anything, without creating a spec file first. The rest is additive to the foundation. Modules/components are isolated and connected via an event bus. The backend code first, foundation first, config files, components with component id/parent/child id for each module and how it connects to the foundation, using the hook and wire registry with consumers and context to map the system completely, then the event bus, then each module one at a time, js first, config, manifest, registry and readme, then the js, then the next module/component. then once each component is complete, then the event driven interaction contract with handshake verification. ui last using the interaction contract and toasts for errors. event ledgers with each type, time of event, relation, and context. each interaction uses a gated event listener with a toast for errors, and event logging to the ledger.

**§8.6 Reuse Before Build. Check the Codebase First.** *(new, 2026-07-30)*
Before building anything new, read the codebase recursively and make effective use of what NEXUS already has — then build outward from it. The default is not a new file; the default is to extend, wire, or compose an existing system. Building new is justified only after a recursive read proves the capability does not already exist. This is the standing lesson of every session in this project: the engine almost always already exists, and the real work is the missing edge. A new artifact created without first proving the absence of an existing one is redundancy — and redundancy is debt (§16.5).
*↳ Sharpens §8.4 (don't go in blind — scan before editing) and §16.5 (delete before you add) into a build-time default: §8.4 says read before you change existing code; §8.6 says read before you write NEW code, and prefer building outward from what the read found. The recursive read is a written finding (§3.3 map before build), not a memory of having looked.*

**§8.7 Full Context Before Any Change — Named, Not Vague** *(new, 2026-08-22)*
§8.4 says "don't go in blind"; this names exactly what "not blind" means in this codebase, using the tools NEXUS already has rather than an unstructured look-around. Before changing any component: read loom's real component/hook/wire map for it (what it connects to, what depends on it), its spec (what it's supposed to be — spec-map), its phasemap history (`phasemap-map.js`'s `historyFor` — every real, git-hash-stamped transition it's been through), and its tool_index entry if it's a registered tool (real usage, real edge cases already hit). Then build bottom-up: foundation first, one component at a time, verified before the next — enterprise-grade, using WARP (§17.10, §17.11) as the build framework, not a shortcut around it. The point of reading all of this first is not ceremony — it's so that if a change causes real harm, there is a full, real record of what the prior state was and why it was that way, and the system can be reverted to it, not just diagnosed after the fact.
*↳ Sharpens §8.4 and §8.6 into the concrete checklist this project's own tools make possible; extends §17.3 (every decision recorded, alternatives and rejections) backward to cover the PRE-change state too, so reverting is a real option, not a reconstruction.*

---

### § Group 9 — Bridge & Identity

**§9.1 Bridge Is the Only Write Authority for Requests**
No system writes directly to the requests table. No system calls another system's API directly for cross-system work. Everything goes through `POST /bridge/request`.
*↳ A cross-system call that does not cross Bridge is a rogue bypass. §FAULTS.CLASS.ROGUE_BYPASS.*

**§9.2 Ledger Write Before Dispatch. Always.**
A request not written to the ledger before dispatch is a phantom. The write gate is not optional.

**§9.3 Held Requests Never Leave the Queue**
If a target is offline, status becomes `held`. Never dropped. A dropped request is a §1.2 violation.

**§9.4 Route Depth Is Bounded. History Is Written.**
MAX_ROUTE_DEPTH = 3. `routeHistory` is written on every hop. A silent fallback chain is a bug.

**§9.5 One UUID Per Request Event. One Hash Per Content Artifact.**
Content artifacts are identified by SHA-256 of their body. No content is re-sent if its hash is already stored.

**§9.6 Session UUID Chain Preserves Continuity**
Each prompt carries its session UUID as `causedBy`. A broken session chain is a §FAULTS.CLASS.CONTEXT_LOSS fault.

---

### § Group 10 — Truth Layers

**§10.1 Each Data Type Has Exactly One Write Authority**
Bridge ledger owns requests. Cortex event_log owns events. Idearium owns ideas/specs/gaps. Guardian owns execution state.
*↳ Each sovereign system's own memory needs (which JAA tables, which lib/ memory primitives) are mapped in `docs/META-SYSTEM-AND-SUBSYSTEM-SPECS.md` — this law states the ownership rule, that doc states the per-system map.*

**§10.2 Projections Are Derived, Not Written**
A projection table is never written directly. Any direct write to a projection table is a §FAULTS.CLASS.ROGUE_WRITE fault.

**§10.3 Competing Truth Layers Are a System Failure**
When two systems disagree on the state of the same entity, that is a `ledger_divergence` gap. Named, tracked, resolved.

---

### § Group 11 — Causal Physics

**§11.1 Every Cause Is as Important as the Conditions of Its Effect**
A fault cannot be understood without the field it occurred in. Both the event and the field conditions are required for a complete causal record.

**§11.2 Compounding Effects Are Documented and Named**
Every ripple, wave, and tidal cascade is identified, classified, and written to the ledger. Regime is emergent, not assigned as a label.

**§11.3 Compound Analysis Is Async, Gated, and Selective**
Compound analysis triggers only on genuine sigma anomalies (score ≥ 0.70). The write path is never blocked.

**§11.4 The CFR Ledger Is a Causal Simulation Substrate**
Bugs are waveforms. Failures are resonance patterns. System drift is field distortion. Layer 1: structural causality. Layer 2: residual causality (sigma). Layer 3: propagation dynamics (compound engine).

---

### § Group 12 — Testing & Verification

**§12.1 Every Runtime File Has a Brutal, Recursive Test Suite**
Unit tests for every exported function. Integration tests for every system boundary. Adversarial tests for every input path.
*↳ "Brutal" means: hostile inputs, race conditions, crash recovery, empty inputs, max sizes, unicode, null, undefined, concurrent writes, partial state, corrupted files.*

**§12.2 Tests Are Verification, Not Coverage**
A test that passes trivially proves nothing. Every test must be able to fail — and its failure must be informative.

**§12.3 Expectation vs Reality Is Always Documented**
Every test documents its expected state, its actual state when it fails, and the gap between them.

**§12.4 Invariants Crystallise From Tests**
System invariants are discovered through testing and promoted when they hold across enough conditions, not declared upfront.

**§12.5 The Living Spec Documents Drift**
The `.spec` file is a living document. Expected behaviour, actual behaviour, gaps, and drift are all tracked. Gaps are not failures — they are the system telling you where to build next.

**§12.6 Every System and Component Has a Diagnostic Engine** *(new, v3.0)*
A test suite proves a function once, at commit time. A diagnostic engine answers "is this healthy right now" continuously, in production — status, health score, recent failure modes, per system and per component, queryable live. RAID's `_toolHealthSnapshot()` and `_health` (session 7) are the first real instance of this; every sovereign system and every registered component owes one, not just the systems that happened to need it for something else first.

---

### § Group 13 — Multidimensional Systems Thinking

**§13.1 Log System Conditions, Context, and Intent**
Every significant operation logs: system conditions (CFR regime, health state), context (session UUID, causedBy chain), and intent (request type, source). Without all three, the log entry is incomplete.

**§13.2 Every Edge Is Named**
Every connection between systems is a named, typed edge with declared protocol, authentication, and failure modes.

**§13.3 Every Fault Class Is Named Before It Occurs**
The taxonomy of failure is declared before the system is built, not discovered after it breaks. A fault that has no name cannot be tracked, measured, or prevented.
*↳ `lib/open-loop-taxonomy.js`'s `classify()` is the live implementation of this law — every RAID failure and every co-pilot fulfillment retry (§15.1) routes through it, not a fresh ad-hoc error string.*

**§13.4 Consistency, Context, and Drift Are First-Class Concerns**
The living timeline tracks what the system was at each version, what it expected to be, and where it drifted. Drift is not a failure — it is data. Untracked drift is a failure.

---

### § Group 14 — SISO Coding Model

**§14.1 Every Cross-System Feature Is a SISO Pipeline**
Event → Gate → Event. One gate performs one transformation. Monolithic handlers are a build warning.

**§14.2 Gates Are Pure Functions**
No side effects except emitting events. Same input → same output. A gate with hidden state is a bug.

**§14.3 Signature Collision Is a Hard Error**
Two gates with the same signature cannot coexist in one stream. Collision is always an error.

**§14.4 Infinite Loop Prevention Is Mandatory**
Gates check `wasProcessedBy()` before claiming events they could re-emit.

**§14.5 The Ledger Is the Learning System**
Every event is written to the ledger before any subscriber processes it. §7.6 and §14.5 are the same law at different scales.

---

### § Group 15 — Adaptive Fulfillment *(new, v3.0)*

**§15.1 Co-pilot Iterates to Fulfillment, Not to a Single Attempt**
A request is not "failed" after one dispatch — it's failed after the iteration budget is exhausted. On a failed or low-confidence attempt, the failure is classified through the fault taxonomy (§13.3, `open-loop-taxonomy.classify()`), scored through the reflection engine (`lib/reflection.js`'s `scoreDecision()`), and the next attempt is re-routed through RAID (`recordOutcome()` feeding the same call that just failed away from the agent that failed it) — not a blind retry of the identical dispatch. Bounded: an iteration budget exists and is logged when exhausted (§1.2 — exhausting the budget is a loud, specific failure, not a silent give-up).

**§15.2 Every Iteration Is a Traceable Event, Not a Hidden Loop**
Each attempt within an adaptive-fulfillment cycle emits its own event — attempt number, agent tried, fault classification if failed, reflection score. A caller (or a human) can reconstruct exactly what was tried and why the next thing was tried next. An adaptive loop that only reports its final result has hidden its reasoning, which is its own §1.2 violation one level up.

**§15.3 Learning Is Cumulative, Not Per-Request**
What's learned from one request's iteration (which agent failed this cluster, under this CFR regime) feeds RAID's weight table (§ raid.spec) for the *next* request too, not just to choose better within the current one. A system that re-learns the same failure every request isn't learning — it's retrying.

---

### § Group 16 — Leverage & Restraint *(new, v3.0)*

**§16.1 Always Close the Nearest Gap**
The next bottleneck determines the next task — not the next feature that seems exciting. Dependency layers are never skipped; the prerequisite blocking progress is solved before anything downstream is touched. Uncertainty is removed before complexity is added.
*↳ §7.7 measures bottlenecks after the fact via ledger flow. §16.1 is the build-order discipline that acts on the nearest one in real time, before it becomes ledger data.*

**§16.2 Systems Must Explain Themselves**
Every decision is inspectable. Every artifact carries provenance. Every output can be traced backward to its cause. Debugging a healthy system should resemble reading a story, not excavating a crime scene.
*↳ This is the lived experience that §6.1, §7.6, §12.3, and §13.1 are built to produce — provenance and traceability are the mechanism, a readable causal story is the test that they worked.*

**§16.3 Invariants Are Sacred**
A contract is never violated to "keep going." An invalid state is refused, not logged and passed through. Validation is structural — enforced by the shape of the system — not an optional check bolted on at the boundary.

**§16.4 Simple Things Stay Simple**
Complexity must justify itself against a real, current requirement — not an imagined future one. Generalize only after a pattern has actually repeated, never in anticipation of repetition.
*↳ Sharpens §5.8 (composability over configuration) with an explicit YAGNI gate: composition is the goal, but it's earned by repetition, not pre-built for hypotheticals.*

**§16.5 Delete Before You Add**
Removing code is preferred over writing it. Every line is maintenance debt owed for the life of the system. A smaller system evolves faster than a larger one carrying the same capability.

**§16.6 The Architecture Decides**
A local decision that disagrees with a global invariant is wrong, regardless of how convenient it is at the call site. Convenience never outranks consistency. Every module serves the system it lives in, not its own author's momentary path of least resistance.
*↳ Same spirit as §5.7 (low coupling, high cohesion) and §9.1 (Bridge as sole write authority), stated as the general rule those two are specific instances of.*

**§16.7 Every New Abstraction Must Remove More Complexity Than It Introduces**
Abstractions are investments, not decorations. If removing the abstraction would make the system easier to understand without losing capability, the abstraction should not exist.
*↳ §16.4 gates *when* to generalize (after repetition, not before). §16.7 gates *whether the resulting abstraction earns its keep* — the test applies even to an abstraction built after real repetition; repetition justifies attempting it, this law judges whether the attempt paid off. §5.8 says behaviour should emerge from composing simple modules — §16.7 is the check that a given "simple module" actually is one.*

---

### § Group 17 — Artifact Governance & Provenance *(new, v3.1)*

**§17.1 Every Artifact Has an Owner**
Every file, schema, contract, API, event, table, diagnostic, manifest, and specification has exactly one authority responsible for it. Orphans are architectural failures.

**§17.2 Every Artifact Has a Lifecycle**
Nothing simply exists. Everything progresses through defined states: Draft → Specified → Implemented → Verified → Released → Deprecated → Archived → Removed. Unknown state is prohibited.

**§17.3 Every Decision Is Recorded**
Not only the decision — the alternatives considered, the tradeoffs, the rejected approaches, and the assumptions behind it. Future developers understand *why*, not merely *what*.
*↳ Sharpens §7.4 (track methods, solutions, and patterns) into a mandatory shape: a decision record without its rejected alternatives is incomplete.*

**§17.4 Every Build Is Reproducible**
Starting from an empty machine, given the repository, the specifications, and the manifests, the system can always recreate itself. Manual knowledge is never part of the build.

**§17.5 Every Output Has Provenance**
Every generated artifact can answer: who generated it, from what, when, why, against which specification and version, and from which inputs. Unknown origin is corruption.
*↳ §16.2 (systems must explain themselves) is the lived experience; §17.5 is the mechanical guarantee that makes that experience possible.*

**§17.6 The System Is Always Auditable**
Every mutation, dispatch, failure, retry, migration, permission change, deletion, upgrade, and decision leaves evidence. Nothing important happens invisibly.
*↳ The system-wide version of §1.2 (nothing fails silently) and §9.2 (ledger write before dispatch) — those name specific paths where this applies; §17.6 is the guarantee that no path is exempt.*

**§17.7 Never Fix the Symptom Twice**
The second occurrence of a bug promotes it to investigation. The third occurrence promotes it to architecture. A repeated bug indicates a missing primitive, not a missing patch.

**§17.8 Every Human Decision Is Automatable**
If a process repeats often enough to become predictable, it eventually belongs in the system itself. Architecture captures the wisdom; automation executes it.

**§17.9 Evolution Must Be Measurable**
Every release improves at least one measurable property — reliability, simplicity, observability, performance, maintainability, security, flexibility, or developer velocity. Change without measurable improvement is movement, not progress.

**§17.10 Verify Before You Promote — Cost Optimizations May Skip Soft Checks, Never Hard Ones** *(extracted from WARP v1.4)*
A cheap path — a cache hit, a fuzzy-reuse candidate, a skipped soft check — may bypass generation, but it never bypasses verification. A result earns promotion (into cache, into production, into the next default) only by demonstrating fitness repeatedly, not once. Where cost pressure argues for skipping a check, only a soft check may ever be the one skipped, and every skip is logged, never silent. A hard invariant is not configurable away, under any option, for any reason.
*↳ WARP's `Axiom.js` gives axioms a weight and lets a SOFT axiom be skipped when this exact content was already scored once before (`skipVerifiedSoftAxioms`) — but the spec states HARD axioms are never skipped, "not configurable," because the alternative would contradict Axiom's founding guarantee that a hard violation is always rejected and logged, never swallowed. This is §16.3 (invariants are sacred) applied to the specific temptation of a cost-driven shortcut. It also generalizes WARP's own promotion rule — a cache entry is only promoted from population after fitness holds across N repeats of the same digest, not after one lucky pass.*

**§17.11 Every Performance Claim Names Its Benchmark** *(extracted from WARP v1.4)*
A "faster," "cheaper," or "better" claim is only as good as the measurement behind it. Non-comparable axes — model-call count, storage bytes, dispatch latency — are never bundled into one aggregate multiplier. Every claim names the file and method that produced it, and reports the unfavorable cases alongside the favorable ones.
*↳ WARP v1.4 explicitly discarded its own earlier "10x-35x cheaper, 15x-50x faster" claim for having no benchmark behind it, replaced it with per-mechanism measurements, and reported a case where one of its own optimizations (delta-cache on small objects, ~90 bytes) actually *lost* to plain storage rather than omitting it. That's §0.1 and §0.0 (reality is authority, never distort reality) enforced against the specific temptation to round a mixed result up to a marketing number.*

---

## Part II — Flexible Principles

**The End-State:** A system that is as reliable, resilient, and flexible as possible — while remaining fluid. Novel, not neat little boxes.

### Design Principles
- Drop-down menus, popout windows, and synthesis layers are primary UI primitives.
- Settings are first-class. Every fluid value has a settings surface.
- Tidy but powerful. Complexity lives behind progressive disclosure.
- Everything is alive and interconnected.

### Development Principles
- Build modules. Every feature is its own module.
- Everything is built with the future in mind.
- Each project is one thing.
- Do not stray. Grounded execution, idealistic vision.

### Leverage Principles *(new)*
- Prefer additive changes — ones that compound with what already exists — over changes that replace or fight it.
- Optimize for the highest leverage at the lowest friction. Slope matters more than any single point: a change that makes future changes easier is worth more than one that only solves today's problem.
- Removing a dependency, or inventing a new approach in place of a known one, is fair game when it genuinely solves the problem — but it's proposed and confirmed with the human before it's built, not shipped as a surprise. Invention is welcome; unilateral invention is not.

### Collaboration Principles
- Idea layer + execution layer. Both are necessary.
- Pushback is required. Find the flaw before it ships.
- Track methods and solutions. Nothing useful is lost.
- Token efficiency is a constraint. One precise question beats ten vague ones.

### Epistemic Principles *(new, v3.1 — mindset, not hard invariants; the discipline behind Group 0)*
- Intellectual humility is strength. Naming uncertainty is evidence of competence, not weakness.
- Questions precede conclusions. Missing information produces a question, never a guess — and every open question is tracked until it's resolved or intentionally accepted.
- Skepticism is a responsibility, applied to one's own proposals first. Look for hidden assumptions, failure modes, contradictory evidence, missing constraints, and alternative explanations — the goal is understanding, not agreement.
- No ego in the feedback loop. Ideas have no rank; evidence has no bias. Being corrected improves the system.
- Adversarial review is an act of care. Pressure reveals weaknesses before reality does — challenge ideas because they matter, not to win.

### Output Contract
> **§** Entire project only. Full output into a zip. No partial patches. No monkey patches. Full system patches — touch every file that needs touching.

---

## Part III — The Six Lenses

| # | Lens | Asks |
|---|------|------|
| 1 | **Cybersecurity Expert** | What can be exploited? What trust assumptions are being made? Where are the authentication and encryption boundaries? |
| 2 | **Lead Designer** | Is this interface honest? Are mental models aligned? Would a first-time user understand what just happened? |
| 3 | **Senior Developer** | What are the failure modes? What happens at boundary conditions? What are the invariants and are they enforced? |
| 4 | **QA Engineer** | How do I break this? What input produces wrong output silently? What does the error message say — is it useful? |
| 5 | **Critical User (Never Satisfied)** | Why is this hard to use? What did the system make me do that it should have done itself? |
| 6 | **Elite Adversarial Hacker** | What is the weakest link? What does this system assume I will not try? |

---

## Part IV — Quick Reference

```
§0.0   Truth is supreme. Reality is the highest authority.
§0.1   Reality is authority. Evidence over memory, always.
§0.2   Architecture is permanent. Implementations are temporary.
§0.3   Information must never be lost.
§0.4   Every change must increase optionality.
§0.5   Complexity must earn its existence.
§1.1   Nothing exists until proven.
§1.2   Nothing pretends to work — and nothing silently fails.
§1.3   No fake, mock, stub, placeholder, or skeleton in production.
§2.1   Persistence is the golden rule.
§2.2   The storage device is the source of truth.
§2.3   All state must be observable.
§3.1   Bottom-up only. Foundation and architecture first.
§3.2   Logical time (eventTs) is the ordering axis.
§3.3   Map before build. The map is a written artifact, not memory.
§3.4   Raw execution before interfaces. Raw code → library → API → CLI → automation → UI.
§4.1   A system that cannot be tested cannot be trusted.
§4.2   Fix bugs pre-emptively.
§4.3   Enterprise grade. Military grade security. Cybersecurity grade privacy.
§5.1   Everything has a UUID, hook, and event bus registration.
§5.2   Everything implements the bridge.
§5.3   No monkey patches — full system patches only.
§5.4   Versions persist across the entire project.
§5.5   What does not exist must be built.
§5.6   Structural self-similarity.
§5.7   Low coupling, high cohesion.
§5.8   Composability over configuration.
§5.9   Every system is sovereign.
§5.10  Interaction through contracts only.
§5.11  Every boundary performs a handshake.
§5.12  The UI is disposable.
§5.13  Syntax is not architecture.
§5.14  Every layer is replaceable.
§6.1   Documentation is generated from proof, not written as aspiration.
§6.2   Always read before building.
§6.3   Every spec is living and tracked in the registry.
§7.0   Event ontology separation.
§7.1   Dual ledger architecture.
§7.2   Ideas cannot affect runtime.
§7.3   Cognition is not history.
§7.4   Track methods, solutions, and patterns.
§7.5   Classify idea failure: unresolved / rejected / abandoned.
§7.6   Codebase is a materialised view of the Upgrade Ledger.
§7.7   Bottleneck detection via ledger flow.
§8.1   Begin every session with context.
§8.2   Nothing passes the idea gate without surviving hostile review.
§8.3   SISO and Jaa are load-order prerequisites.
§8.6   Reuse before build. Read the codebase recursively; build outward from what exists.
§8.7   Full context before any change: loom map, spec, phasemap history, tool index — named, not vague. Enables real revert, not just diagnosis.
§9.1   Bridge is the only write authority for requests.
§9.2   Ledger write before dispatch. Always.
§9.3   Held requests never leave the queue.
§9.4   Route depth is bounded. History is written on every hop.
§9.5   One UUID per request event. One hash per content artifact.
§9.6   Session UUID chain preserves continuity.
§10.1  Each data type has exactly one write authority.
§10.2  Projections are derived, not written.
§10.3  Competing truth layers are a system failure.
§11.1  Every cause is as important as the conditions of its effect.
§11.2  Compounding effects are documented and named.
§11.3  Compound analysis is async, gated, and selective.
§11.4  The CFR ledger is a causal simulation substrate.
§12.1  Every runtime file has a brutal, recursive test suite.
§12.2  Tests are verification, not coverage.
§12.3  Expectation vs reality is always documented.
§12.4  Invariants crystallise from tests.
§12.5  The living spec documents drift.
§12.6  Every system and component has a diagnostic engine.
§13.1  Log system conditions, context, and intent.
§13.2  Every edge is named.
§13.3  Every fault class is named before it occurs.
§13.4  Consistency, context, and drift are first-class concerns.
§14.1  Every cross-system feature is a SISO pipeline.
§14.2  Gates are pure functions.
§14.3  Signature collision is a hard error.
§14.4  Infinite loop prevention is mandatory.
§14.5  The ledger is the learning system.
§15.1  Co-pilot iterates to fulfillment, not to a single attempt.
§15.2  Every iteration is a traceable event, not a hidden loop.
§15.3  Learning is cumulative, not per-request.
§16.1  Always close the nearest gap. The next bottleneck determines the next task.
§16.2  Systems must explain themselves. Debugging should read like a story.
§16.3  Invariants are sacred. Never violate a contract to "keep going."
§16.4  Simple things stay simple. Generalize only after repetition.
§16.5  Delete before you add. Every line is maintenance debt.
§16.6  The architecture decides. Convenience never outranks consistency.
§16.7  Every new abstraction must remove more complexity than it introduces.
§17.1  Every artifact has an owner.
§17.2  Every artifact has a lifecycle.
§17.3  Every decision is recorded — including alternatives and rejections.
§17.4  Every build is reproducible from an empty machine.
§17.5  Every output has provenance.
§17.6  The system is always auditable.
§17.7  Never fix the symptom twice.
§17.8  Every human decision is automatable.
§17.9  Evolution must be measurable.
§17.10 Verify before you promote. Cost cuts may skip soft checks, never hard ones.
§17.11 Every performance claim names its benchmark.
```

> **§** End-state: as reliable, resilient, and flexible as possible — while remaining fluid.
> Novel, not neat little boxes. The codebase is a materialised view of the Upgrade Ledger.
> Ideas are input, not output. The sigma engine measures the flow between them.
> Every cause is as important as the conditions of its effect.
> Reality over appearance. Structure over speed. Foundations over features. Truth over convenience.
> **Let's make history.**
