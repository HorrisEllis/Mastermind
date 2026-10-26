# GAPHUNTER — RELATIONAL DOMAIN
## Psychological, Communicative & Abuse Gap Taxonomy — v1.0.0
### Extension of GAPHUNTER_SPEC_v1.0.0 · Domain: RELATIONAL

---

> *"In every other domain, you can check the source. In psychological abuse, the weapon is the target's inability to trust their own source — themselves."*

---

## THE CORE MECHANISM

Every form of psychological manipulation and abuse operates by corrupting the target's
internal claim graph across six layers:

```
LAYER 1 — EVENT        "What happened"          → denial, minimization, false memory
LAYER 2 — MEANING      "What it meant"          → reframing, perspective injection
LAYER 3 — EMOTION      "What you felt"          → invalidation, pathologizing
LAYER 4 — EXPRESSION   "What you can say"       → silencing, punishment for disclosure
LAYER 5 — IDENTITY     "Who you are"            → character attacks, worth destruction
LAYER 6 — CONSENSUS    "What reality is"        → isolation from external verification
```

When all six layers are under attack simultaneously, the target loses stable ground.
That is the end state the abuse pattern is moving toward.

GapHunter detects attacks on each layer as specific gap types.
Every tactic maps to a structural failure in the claim graph.

---

## PART R1 — VULNERABILITY STATES

### R1.1 — What Vulnerability Looks Like (Non-pathological)

Vulnerability is the precondition for genuine connection. It is also the
attack surface that manipulation exploits.

```
HEALTHY VULNERABILITY SIGNALS:
  - Disclosure of fear, need, or uncertainty without demand for specific response
  - Willingness to be wrong without identity collapse
  - Asking for help without attaching worth to the answer
  - Expressing emotion without weaponizing it
  - Remaining open after disappointment
  - Sharing incompleteness without performing it

HEALTHY VULNERABILITY MARKERS (claim graph):
  - Claim is stated as experience ("I felt abandoned") not verdict ("you abandoned me")
  - Claim is offered, not deployed
  - The speaker can hold the claim lightly — it doesn't require the other to confirm it
  - No implicit threat attached to the disclosure
```

### R1.2 — Vulnerability Exploitation (How it becomes an attack surface)

```
EXPLOITATION PATTERN:
  Target discloses vulnerability
      ↓
  Exploiter stores it (often unconsciously)
      ↓
  Exploiter deploys it later as leverage, mockery, or weapon
      ↓
  Target learns: disclosure = danger
      ↓
  Target closes down → intimacy impossible → isolation accelerates

GAP TYPE: CONSENT GAP
  The target consented to vulnerability in a context of safety.
  The exploiter violated the context without disclosing the change in conditions.
  This is a reference gap — the original consent does not extend to weaponized use.
```

---

## PART R2 — DEFENSIVE PATTERNS

### R2.1 — Healthy Defense vs Defensive Pathology

```
HEALTHY DEFENSE:
  - Protects the self without attacking the other
  - Can receive evidence and update
  - Distinguishes between feeling threatened and being threatened
  - Returns to regulation and re-engages
  - Can name what it's defending without shame

DEFENSIVE PATHOLOGY:
  - Cannot distinguish criticism of behavior from attack on worth
  - Converts every challenge into evidence of being attacked
  - Responds to concern with counterattack
  - Cannot update — all evidence confirms the defense
  - Shuts down inquiry as threat
```

### R2.2 — Defensive Gap Patterns

```
DEFLECTION GAP
  Type:        LOGICAL
  Description: Response addresses something other than the actual claim made
  Signal:      Causal chain — the response has no causal path back to the input claim
  Example:     "You never acknowledge anything I do right"
                → response: "You're always so sensitive"
  Detection:   Input claim UUID has no causal edge to response node

COUNTER-ATTACK GAP
  Type:        OBLIGATION + EVIDENTIAL
  Description: Challenge is met with challenge — original claim never addressed
  Signal:      Obligation node (the original concern) with no response path
  Example:     "I felt hurt when you said that"
                → "Oh so now I'm the bad guy? What about what YOU did last week?"
  Detection:   Original obligation node has no downstream resolution edge

MINIMIZATION GAP
  Type:        EVIDENTIAL
  Description: The impact of an event is denied without evidence
  Signal:      Conclusion (impact claim) attacked without corresponding premise chain
  Example:     "That really hurt me"
                → "You're overreacting. It wasn't a big deal"
  Detection:   Counter-claim has no evidential basis — assertion without premise

VICTIMHOOD INVERSION GAP
  Type:        LOGICAL + CONTRADICTION
  Description: The person who caused harm positions themselves as the harmed party
  Signal:      Oscillatory regime — causal direction inverted in claim graph
  Example:     "You made me feel terrible by telling me I hurt you"
  Detection:   Harm claim and responsibility claim point to same actor — contradiction node
```

---

## PART R3 — SELF-PROTECTIVE PATTERNS

### R3.1 — Legitimate Self-Protection vs Weaponized Self-Protection

```
LEGITIMATE SELF-PROTECTION:
  - Boundary setting with stated reason
  - Withdrawal to regulate before re-engaging
  - Declining a conversation that is not safe
  - Naming when something is harmful and why
  - Protecting information in contexts of demonstrated untrustworthiness

WEAPONIZED SELF-PROTECTION:
  - Using withdrawal as punishment (stonewalling with intent to harm)
  - Claiming self-protection to avoid accountability
  - Making safety concerns conditional on the other person's compliance
  - Deploying vulnerability to prevent the other from raising legitimate concerns
```

### R3.2 — Self-Protection Gap Patterns

```
ACCOUNTABILITY SHIELD GAP
  Type:        OBLIGATION
  Description: Self-protection claim used to permanently avoid an obligation
  Signal:      Obligation node — the other's legitimate concern — blocked by
               self-protection claim with no path to resolution
  Example:     "I can't talk about this — it's too triggering for me"
               (used every time the other tries to address a real concern)
  Detection:   Obligation node consistently has self-protection node as
               sole child — never resolves

CONDITIONAL SAFETY GAP
  Type:        ASSUMPTION
  Description: Safety is claimed to be conditional on the other's behavior —
               making the other responsible for the speaker's regulation
  Signal:      Silent premise: "I am only safe if you never challenge me"
  Example:     "When you bring this up I feel attacked and unsafe"
               (response to non-aggressive legitimate concern)
  Detection:   Safety claim has no causal path to actual threat — assumption gap

PREEMPTIVE FRAGILITY GAP
  Type:        LOGICAL
  Description: Displaying distress before accountability arrives —
               making it emotionally impossible for the other to proceed
  Signal:      Distress claim inserted before obligation chain completes
  Example:     Breaking down in tears when partner tries to have a difficult conversation
  Detection:   Emotional state claim has no causal path to prior event —
               temporally misplaced in claim graph
```

---

## PART R4 — MANIPULATION PATTERNS

### R4.1 — Manipulation Taxonomy (Complete)

Manipulation is any attempt to influence another person's beliefs, emotions,
or behavior through means that bypass their rational agency.

```
GUILT INDUCTION GAP
  Type:        LOGICAL + ASSUMPTION
  Description: Target made to feel responsible for outcomes they did not cause
  Signal:      Causal chain falsified — responsibility attributed without evidence
  Example:     "If you really loved me you wouldn't need to ask that"
  Detection:   Guilt claim has no valid causal path — assumption injected as premise

OBLIGATION MANUFACTURE GAP
  Type:        OBLIGATION
  Description: Debt created without target's knowledge or consent,
               then called in as binding obligation
  Signal:      Obligation node exists with no corresponding consent edge
  Example:     "After everything I've done for you, you can't do this one thing?"
  Detection:   Obligation node has no prior consent — unilateral imposition

LOVE WITHDRAWAL LEVERAGE GAP
  Type:        CONDITION
  Description: Affection is made conditional on compliance —
               used as threat to control behavior
  Signal:      Condition node: affection contingent on compliance
  Example:     Going cold, withdrawing connection, punishing with silence
               until the other capitulates
  Detection:   Behavioral change (withdrawal) has causal edge to
               refusal of demand — leverage pattern confirmed

MOVING GOALPOSTS GAP
  Type:        DEFINITIONAL + TEMPORAL
  Description: The requirement for acceptable behavior keeps changing —
               target can never satisfy it
  Signal:      Definition node mutates across time — same term, different
               satisfaction criteria
  Example:     "I just want you to be more attentive"
               (when they are: "that's not what I meant")
  Detection:   Definition node has multiple conflicting versions across
               temporal sequence — version drift detected

TRIANGULATION GAP
  Type:        REFERENCE + ASSUMPTION
  Description: Third party introduced as validation, threat, or comparison
               to manufacture insecurity or compliance
  Signal:      Reference node — third party — with no direct causal relevance
               to current claim
  Example:     "Everyone thinks you're being unreasonable"
               "My ex never had a problem with this"
  Detection:   Third-party reference has no causal edge to current claim —
               orphaned reference used as leverage

FUTURE FAKING GAP
  Type:        TEMPORAL + OBLIGATION
  Description: Promises made about the future to secure present compliance —
               promises that are never intended to be kept
  Signal:      Obligation node (future promise) with no enforcement path
               and pattern of non-fulfillment in ledger history
  Example:     "I'll change, I promise. Just give me one more chance"
  Detection:   Obligation node has no enforcement edge + prior identical
               obligation nodes in ledger all marked unresolved

INTERMITTENT REINFORCEMENT GAP
  Type:        OSCILLATORY (sigma regime)
  Description: Unpredictable alternation between warmth and withdrawal
               creates trauma bonding — the target is conditioned to pursue
               approval that randomly arrives
  Signal:      Oscillatory sigma regime on affection/withdrawal behavioral sequence
  Example:     Cycles of idealization and devaluation
  Detection:   sigma OSCILLATORY on relationship warmth signal stream —
               O threshold exceeded, no stable baseline

SCARCITY MANUFACTURE GAP
  Type:        ASSUMPTION
  Description: Artificial scarcity of affection, approval, or connection
               used to increase target's compliance
  Signal:      Silent premise: "this is the only source of what you need"
               — never stated, load-bearing
  Detection:   High-weight assumption node with no evidential basis —
               criticality score elevated by target's isolation level
```

---

## PART R5 — CONTROL PATTERNS

### R5.1 — Control Taxonomy (Complete)

```
INFORMATION CONTROL GAP
  Type:        REFERENCE
  Description: Target's access to information, perspective, or verification
               is restricted to maintain dependency
  Signal:      Reference nodes blocked — target cannot resolve external references
  Tactics:     Monitoring communications, isolating from friends/family,
               controlling finances, limiting mobility
  Detection:   Reference resolution rate drops over time in ledger —
               target increasingly unable to verify claims independently

ISOLATION GAP
  Type:        EVIDENTIAL + REFERENCE
  Description: Target removed from sources of external verification —
               alternative perspectives, support systems, reality checks
  Signal:      Network nodes drop from target's accessible reference set
  Example:     "Your friends don't really understand our relationship"
               "Your family always causes problems between us"
  Detection:   Reference diversity decreases over time — sigma DEGRADED
               on external verification capacity

FINANCIAL CONTROL GAP
  Type:        OBLIGATION
  Description: Economic dependency manufactured or maintained to prevent exit
  Signal:      Target has no independent resource path — obligation to
               controller for survival needs
  Example:     Preventing employment, controlling all accounts,
               running up debt in target's name
  Detection:   Obligation nodes cluster around survival resources —
               all paths run through controller

MICROMANAGEMENT GAP
  Type:        OBLIGATION + CONDITION
  Description: Target's autonomy is progressively reduced through
               conditions attached to every decision
  Signal:      Condition nodes accumulate on all behavioral paths —
               no autonomous action remains unconditioned
  Example:     "Just tell me where you're going" → evolves to requiring
               permission, reporting, justification for all movements
  Detection:   Condition node density increases over time — autonomy
               gap widens in ledger history

JEALOUSY AS CONTROL GAP
  Type:        ASSUMPTION
  Description: Jealousy framed as love — used to justify surveillance,
               restriction, and punishment
  Signal:      Silent premise: "jealousy = love" installed as definition —
               never examined
  Example:     "I only act this way because I love you so much"
  Detection:   Definitional gap — jealousy and love conflated in
               same definition node — contradiction unresolved
```

---

## PART R6 — GASLIGHTING (COMPLETE)

Gaslighting is the systematic injection of false premises into the target's
claim graph until the target can no longer maintain a coherent causal chain
between experience, meaning, and expression.

It is not a single tactic. It is a campaign against the target's epistemology.

### R6.1 — The Six Gaslighting Operations

```
OPERATION 1: EVENT DENIAL
  Target:      Layer 1 — What happened
  Mechanism:   Assert the event did not occur
  Example:     "That never happened"
               "You're making things up"
               "I never said that"
  Gap Type:    EVIDENTIAL — claim with no supporting premise, attacking
               target's premise chain
  Cumulative:  Target begins doubting their own memory
  Detection:   Denial claim has no evidential basis — pure assertion
               contradicting target's documented experience

OPERATION 2: SEVERITY MINIMIZATION
  Target:      Layer 1 + Layer 3
  Mechanism:   Acknowledge event occurred but deny its significance
  Example:     "It was just a joke"
               "You're so sensitive"
               "I barely raised my voice"
  Gap Type:    EVIDENTIAL + TEMPORAL — impact claim attacked without basis
  Cumulative:  Target begins calibrating their responses to the minimizer's
               scale — loses trust in own emotional signals
  Detection:   Minimization claim has no causal path to impact evidence —
               counter-assertion without premise

OPERATION 3: MEMORY ATTACK
  Target:      Layer 1 — What happened (past)
  Mechanism:   Introduce doubt about the target's recollection specifically
  Example:     "You always remember things wrong"
               "Your memory is terrible"
               "You were drunk / tired / emotional — you don't remember clearly"
  Gap Type:    REFERENCE — attacking the source rather than the claim
  Cumulative:  Target stops trusting their own account as data
  Detection:   Source attack pattern — claim validity attacked via
               source credibility, not via counter-evidence

OPERATION 4: EMOTIONAL PATHOLOGIZING
  Target:      Layer 3 — What you felt
  Mechanism:   Reframe the target's emotional response as evidence of
               their dysfunction rather than valid signal
  Example:     "You're too emotional"
               "You need help — this reaction isn't normal"
               "You're crazy / unstable / hysterical"
  Gap Type:    ASSUMPTION — silent premise: "your emotions are symptoms,
               not signals"
  Cumulative:  Target stops trusting emotional data as valid input —
               loses access to primary self-knowledge system
  Detection:   Pathologizing claim has no clinical basis — deployed
               in response to legitimate emotional expression

OPERATION 5: REALITY CONSENSUS ATTACK
  Target:      Layer 6 — What reality is
  Mechanism:   Enlist others (real or fabricated) to confirm the
               gaslighter's version of events
  Example:     "Everyone thinks you're overreacting"
               "I talked to [friend] and they agree with me"
               "No one else has a problem with this"
  Gap Type:    REFERENCE — fabricated or coerced external validation
  Cumulative:  Target feels alone in their perception — begins to
               defer to consensus over direct experience
  Detection:   Third-party claims unverifiable — reference nodes
               cannot be independently resolved

OPERATION 6: IDENTITY DESTABILIZATION
  Target:      Layer 5 — Who you are
  Mechanism:   Make the target's perception of themselves the problem —
               if they can't trust who they are, they can't trust any
               claim that originates from them
  Example:     "You've always been like this — it's just who you are"
               "You're a difficult person"
               "I don't think you're capable of healthy relationships"
  Gap Type:    ASSUMPTION — silent premise: "your character is the
               source of all problems here"
  Cumulative:  Target accepts responsibility for all relational dysfunction —
               cannot generate claims about others that feel credible
  Detection:   Character claim has no evidential basis and appears
               consistently in response to legitimate concerns
```

### R6.2 — Gaslighting Compound Effects

```
COMPOUND EFFECT 1: SOURCE CORRUPTION
  After sustained gaslighting, the target's internal claim source is
  corrupted. They can no longer distinguish:
  - Their own perception from the gaslighter's assertion
  - Valid emotion from pathological reaction
  - Real event from false memory

COMPOUND EFFECT 2: CLAIM GENERATION SHUTDOWN
  Target stops generating claims about their experience because
  every claim generates punishment (correction, attack, invalidation).
  The claim graph stops producing output.
  This is the goal: a target who no longer speaks their experience
  cannot identify the abuse or seek help.

COMPOUND EFFECT 3: REALITY DEPENDENCY
  Target becomes dependent on the gaslighter to interpret reality.
  This is not weakness — it is the successful outcome of a sustained
  epistemological attack.
  The target's independent verification capacity has been systematically
  disabled.

COMPOUND EFFECT 4: SELF-GASLIGHTING
  Eventually the target performs the gaslighting internally.
  They pre-emptively minimize their own experience, doubt their own memory,
  pathologize their own emotions — without requiring the abuser to do it.
  The system has been internalized.
  This is the most critical stage — and the hardest to detect from inside.
```

---

## PART R7 — REFRAMING AND PERSPECTIVE MANIPULATION

```
LEGITIMATE REFRAME:
  Offers an alternative perspective that the person can evaluate and
  choose to adopt or reject. Does not invalidate the original frame.
  Adds information. Increases choice.

MANIPULATIVE REFRAME:
  Replaces the target's frame without consent. Positions the target's
  frame as wrong, broken, or evidence of a problem.
  Reduces choice. Serves the reframer's interests.
```

### R7.1 — Reframing Gap Patterns

```
EMOTIONAL REFRAME GAP
  Type:        DEFINITIONAL + ASSUMPTION
  Description: Target's emotion is renamed to something less valid
  Example:     "You're not hurt — you're angry"
               "You're not scared — you're being paranoid"
               "You don't love me — you're just codependent"
  Gap:         Definition of target's internal state replaced without
               consent — target has primary access, reframer does not
  Detection:   Emotional definition node replaced — no consent edge,
               no evidential basis for counter-definition

MOTIVE REFRAME GAP
  Type:        ASSUMPTION
  Description: Target's motive for an action is replaced with a less
               flattering interpretation — presented as fact
  Example:     "You're not being honest — you're being passive aggressive"
               "You don't want to help — you just want control"
  Gap:         Motive claim has no evidential basis — assumption injected
               as conclusion
  Detection:   Motive node has no causal path to behavioral evidence —
               pure assumption with high-weight load on subsequent claims

CONTEXT COLLAPSE GAP
  Type:        TEMPORAL
  Description: A specific event is generalized to a character claim
  Example:     One instance of forgetting → "you never care about me"
               One moment of frustration → "you're an angry person"
  Gap:         Temporal gap — single data point generalized across time
               without evidential basis
  Detection:   Frequency claim (never/always) has n=1 evidential basis —
               temporal extrapolation without sample support

PERSPECTIVE INVERSION GAP
  Type:        LOGICAL
  Description: The frame is rotated so the person with the concern
               becomes the source of the problem
  Example:     "The reason we fight is because you always bring things up"
               (rather than: because the thing being brought up is unresolved)
  Gap:         Logical inversion — cause and effect chain reversed
  Detection:   Causal direction in claim graph inverted from
               evidential sequence — oscillatory pattern

SILVER LINING WEAPONIZATION GAP
  Type:        EVIDENTIAL
  Description: Positive reframe used to prevent legitimate processing of harm
  Example:     "At least you learned something"
               "Everything happens for a reason"
               (deployed before target has completed expressing the harm)
  Gap:         Harm processing obligation blocked by premature resolution —
               evidential gap: harm claim never fully received
  Detection:   Resolution node appears before harm node is complete —
               temporal sequencing violation
```

---

## PART R8 — INVALIDATION

### R8.1 — Invalidation Taxonomy (Complete)

Invalidation is any response that communicates that the target's
internal experience is incorrect, inappropriate, or non-existent.

```
DIRECT INVALIDATION GAP
  Type:        EVIDENTIAL
  Description: Experience explicitly denied
  Example:     "You don't actually feel that way"
               "You're not really upset"
  Gap:         Counter-claim with no evidential basis —
               speaker has no access to target's internal state
  Detection:   Experiential claim attacked via assertion — zero premises

COMPARATIVE INVALIDATION GAP
  Type:        REFERENCE
  Description: Target's experience dismissed by reference to others'
               supposedly worse experiences
  Example:     "Other people have real problems"
               "Children are starving — you're upset about this?"
  Gap:         Reference node irrelevant to current claim —
               severity comparison used to block processing
  Detection:   Third-party reference has no causal edge to current claim

LOGICAL INVALIDATION GAP
  Type:        LOGICAL
  Description: Emotion invalidated by pointing out it's "irrational"
  Example:     "There's no reason to feel that way"
               "Logically speaking, you shouldn't be upset"
  Gap:         Logical framework applied to emotional domain —
               category error. Emotions are not claims requiring
               logical validity. They are signals requiring acknowledgment.
  Detection:   Logical validity criteria applied to non-logical claim type —
               domain mismatch gap

TEMPORAL INVALIDATION GAP
  Type:        TEMPORAL
  Description: Past experience or pattern dismissed because of time elapsed
  Example:     "That was years ago — why are you still bringing it up?"
               "You need to just get over it"
  Gap:         Temporal gap — healing timeline imposed externally without
               basis. Unresolved harm does not expire on schedule.
  Detection:   Time-based dismissal with no evidential basis for
               recovery timeline

PRAISE SANDWICH INVALIDATION GAP
  Type:        LOGICAL
  Description: Concern bracketed by praise to neutralize it —
               the concern never lands
  Example:     "You're so great, BUT [concern], anyway you're amazing"
  Gap:         Concern node has no downstream resolution —
               bracketing prevents processing
  Detection:   Concern claim has praise nodes on both sides with
               no resolution path in between

SOLUTION BYPASS INVALIDATION GAP
  Type:        OBLIGATION
  Description: Problem-solving offered instead of acknowledgment —
               skips the emotional processing the target needs
  Example:     "Here's what you should do..." (before: "that sounds really hard")
  Gap:         Obligation — acknowledgment — not fulfilled.
               Solution offered to a need that wasn't expressed.
  Detection:   Solution node appears before acknowledgment node —
               sequence violation in claim graph
```

---

## PART R9 — VERBAL AND EMOTIONAL ABUSE

### R9.1 — Verbal Abuse Taxonomy

```
CHARACTER ASSASSINATION GAP
  Type:        ASSUMPTION + EVIDENTIAL
  Description: Stable character claims made without evidential basis —
               deployed as weapons, not descriptions
  Example:     "You're pathetic"
               "You're a narcissist"
               "You're worthless"
  Gap:         Character claim has no causal path to behavioral evidence —
               assumption gap at maximum criticality
               (these claims attack Layer 5 — identity — directly)
  Detection:   Character node with no evidential chain —
               criticality = 1.0 when deployed in conflict context

NAME-CALLING / DEGRADATION GAP
  Type:        IDENTITY LAYER ATTACK
  Description: Labels applied that reduce the target to a category
               rather than a person — dehumanization as control
  Signal:      Identity layer claim with zero nuance — binary, absolute
  Detection:   Label node is absolute (all-or-nothing) with no
               evidential qualification

CONTEMPT GAP
  Type:        EVIDENTIAL + IDENTITY
  Description: Disgust, mockery, eye-rolling, condescension —
               communicates target is beneath engagement
  Note:        Gottman research: contempt is the single strongest
               predictor of relationship dissolution.
               It attacks worth directly.
  Signal:      Meta-communicative layer — the manner of communication
               attacks the target's standing to communicate at all
  Detection:   Communication style analysis — contempt markers in
               delivery regardless of content

THREATS GAP
  Type:        CONDITION + OBLIGATION
  Description: Future harm attached to non-compliance —
               explicit or implicit
  Example:     "If you leave I'll..."
               "You'll regret this"
               "I'll make sure everyone knows what you're really like"
  Gap:         Condition node — compliance required to prevent harm —
               obligation manufactured through threat
  Detection:   Harm claim attached to behavior condition —
               coercion structure confirmed

PUBLIC HUMILIATION GAP
  Type:        IDENTITY + CONSENT
  Description: Target humiliated in front of others —
               private information or failures exposed without consent
  Gap:         Consent gap — information shared outside the context
               of original disclosure
  Detection:   Disclosure event has no consent edge to public context

SCREAMING / INTIMIDATION GAP
  Type:        CONDITION
  Description: Volume and physical intimidation used to shut down
               target's ability to process or respond
  Gap:         Condition on all target responses — must comply or
               face escalation. Target's claim generation blocked
               by survival response (freeze/fawn/flee)
  Detection:   Target claim generation drops to zero following
               intimidation events in ledger sequence
```

### R9.2 — Emotional Abuse Taxonomy

```
SILENT TREATMENT GAP
  Type:        OBLIGATION + CONDITION
  Description: Withdrawal of communication as punishment —
               can last hours, days, weeks
  Gap:         Obligation — relationship maintenance — suspended
               as leverage. Target required to capitulate for
               restoration of basic connection
  Detection:   Communication event gap in ledger sequence —
               correlated with prior assertion of autonomy by target

EMOTIONAL NEGLECT GAP
  Type:        OBLIGATION
  Description: Consistent failure to acknowledge, respond to, or
               validate the target's emotional experience
  Gap:         Ongoing obligation gap — emotional attunement
               consistently unmet. Not a single event — a pattern.
  Detection:   Acknowledgment node absent across extended ledger sequence —
               sigma DEGRADED on emotional responsiveness signal

LOVE BOMBING → DEVALUATION GAP
  Type:        OSCILLATORY + TEMPORAL
  Description: Intense idealization phase followed by systematic devaluation —
               creates trauma bond through intermittent reinforcement
  Gap:         Temporal gap — target's model of the relationship is based
               on the love bombing phase, which does not represent
               the stable state
  Detection:   sigma OSCILLATORY on warmth signal —
               high-amplitude swings with no stable baseline

ENMESHMENT GAP
  Type:        DEFINITIONAL + BOUNDARY
  Description: Target's separate identity not recognized —
               target's emotions, needs, and preferences treated as
               extensions of or threats to the controller
  Gap:         Definitional gap — "self" and "other" conflated in
               controller's claim graph. Target's autonomy claims
               treated as betrayal claims.
  Detection:   Autonomy assertion by target → punishment event —
               causal link confirmed in ledger

EMOTIONAL PARENTIFICATION GAP
  Type:        OBLIGATION + HIERARCHY
  Description: Target made responsible for the abuser's emotional regulation —
               inverted hierarchy
  Example:     "You need to be careful about how you bring things up
               or I'll get triggered"
               "Your needs stress me out"
  Gap:         Obligation gap — target carrying responsibility that
               belongs to the other party.
               Hierarchy inverted — target becomes the regulator,
               abuser becomes the regulated.
  Detection:   Target regulation obligation node points to
               abuser's emotional state — inverted hierarchy confirmed

REALITY MANUFACTURING GAP
  Type:        ASSUMPTION + EVIDENTIAL
  Description: Abuser creates a version of the relationship narrative
               that serves their interests — and requires the target
               to agree with it to maintain connection
  Example:     "We have such a great relationship"
               (said while ongoing harm is occurring)
               "I'm the only one who really understands you"
  Gap:         Narrative claim has no evidential basis — or contradicts
               documented evidence. Target agreement extracted
               without access to counter-evidence.
  Detection:   Narrative claim contradicts event ledger —
               forced consensus without evidential resolution
```

---

## PART R10 — INTENT VS IMPACT GAP (Complete)

This is the most universal communication gap. It exists in healthy
relationships and abusive ones. The difference is what happens after it's named.

```
THE GAP STRUCTURE:
  Speaker intent    →  [translation loss]  →  Listener impact
  
  Intent and impact are separate claims. Both can be true simultaneously.
  "I didn't mean to hurt you" and "you hurt me" are not contradictory.
  They operate on different layers of the claim graph.

HEALTHY RESOLUTION PATTERN:
  Impact named → impact acknowledged (not defended against) →
  intent clarified → both received → repair attempted → resolved

ABUSIVE RESOLUTION PATTERN:
  Impact named → impact denied or minimized →
  intent used to negate impact ("I didn't mean it so it doesn't count") →
  target required to accept intent as override of their experience →
  impact never processed → accumulates

GAP TYPES:
  Intent-as-absolution gap:    LOGICAL
    Description: Good intent claimed as proof that harm did not occur
    Example:     "I didn't mean it that way so you shouldn't feel hurt"
    Gap:         Logical error — intent and impact are independent variables
    Detection:   Intent claim positioned as negation of impact claim —
                 no logical connection between the two nodes

  Demand for impact alignment gap:  OBLIGATION + CONSENT
    Description: Target required to feel differently about an event
    Example:     "I said sorry — you should be over it by now"
    Gap:         Obligation imposed on target's healing timeline —
                 no consent to the timeline, no evidential basis
    Detection:   Recovery timeline node with no consent edge
```

---

## PART R11 — ALIGNMENT GAP DETECTION (Communication Health)

### R11.1 — The Alignment Stack

For any two people to be in genuine alignment on a topic, all five layers
must be congruent:

```
LAYER 1 — FACTUAL     Do we agree on what happened?
LAYER 2 — MEANING     Do we agree on what it means?
LAYER 3 — EMOTIONAL   Do we acknowledge each other's emotional response?
LAYER 4 — NEED        Do we understand what each person needs?
LAYER 5 — PATH        Do we agree on what happens next?
```

Misalignment at any layer prevents resolution at all layers above it.
Most couples fight about Layer 5 (what happens next) when the actual
gap is at Layer 1 (what happened).

### R11.2 — Alignment Gap CQL Patterns

```cql
-- Find conversations where emotional layer was skipped
FIND chains WHERE type = 'conflict'
  AND HAS_CHILD type = 'solution'
  AND NOT HAS_CHILD type = 'acknowledgment'

-- Find repeated unresolved patterns (same gap appearing again)
FIND events WHERE type = 'concern'
  AND payload.topic = X
  AND NOT CAUSED_BY resolution
  ORDER BY ts DESC
  LIMIT 10

-- Find intent-impact gaps
FIND events WHERE type = 'impact_claim'
  AND CAUSED_BY type = 'intent_negation'
  AND NOT CAUSED_BY type = 'acknowledgment'

-- Find assumption gaps in relationship expectations
FIND events WHERE type = 'expectation'
  AND NOT CAUSED_BY type = 'explicit_agreement'
  AND payload.weight > 0.6
```

---

## PART R12 — RECOVERY AND RESTORATION

### R12.1 — What GapHunter Does NOT Do

```
GapHunter is a detection and mapping system.
It does not:
  - Diagnose relationships or people
  - Prescribe outcomes (stay / leave)
  - Render verdicts on who is abusive
  - Replace therapy, advocacy, or professional support

What it does:
  - Make structural patterns visible
  - Surface gaps that have been buried or denied
  - Create an objective record (ledger) of events over time
  - Name what is happening in language that can be worked with
  - Hold open loops that need to stay open
  - Never close a gap for comfort if it means anything
```

### R12.2 — The Restoration Stack

When a relationship has accumulated abuse gaps, restoration — if pursued —
requires working through the layers in order:

```
STEP 1 — SAFETY       Is it safe to work on this? Is the pattern currently active?
STEP 2 — INVENTORY    What gaps exist and at what criticality?
STEP 3 — ACKNOWLEDGE  Can both parties acknowledge the documented events?
STEP 4 — LAYER 1      Establish factual consensus — what happened
STEP 5 — LAYER 3      Acknowledge emotional impact without defense
STEP 6 — PATTERN      Name the pattern — not just the incident
STEP 7 — ORIGIN       Where does this pattern come from for each person?
STEP 8 — COMMITMENT   What changes — specifically and measurably?
STEP 9 — TRACK        Does the ledger show the pattern changing over time?
STEP 10 — REASSESS    At each stage: is restoration possible and wanted?
```

---

## PART R13 — INTEGRATION WITH GAPHUNTER CORE

### R13.1 — Domain Registration

```javascript
RELATIONAL_DOMAIN = {
  id:           'relational',
  version:      '1.0.0',
  layers: [
    'event', 'meaning', 'emotion',
    'expression', 'identity', 'consensus'
  ],
  gap_types:    [
    // Universal types, all applicable
    'logical', 'evidential', 'temporal',
    'definitional', 'reference', 'obligation',
    'assumption', 'contradiction',
    // Relational extensions
    'identity_attack', 'consent', 'boundary',
    'hierarchy', 'coercion', 'isolation'
  ],
  criticality_weights: {
    // Identity and safety gaps weight highest in relational domain
    identity_attack:   1.0,
    coercion:          1.0,
    isolation:         0.95,
    gaslighting:       0.95,
    assumption:        0.9,   // the silent premise is always load-bearing
    obligation:        0.85,
    evidential:        0.8,
    logical:           0.75,
    temporal:          0.7,
    definitional:      0.65,
  },
  input_types: [
    'conversation_transcript',
    'message_thread',
    'journal_entry',
    'session_notes',
    'incident_log',
  ],
  axioms: [
    'Both intent and impact are real — they operate on different layers',
    'Emotions are signals, not claims requiring logical validity',
    'The target has primary access to their own internal state',
    'Pattern matters more than incident — single events rarely tell the story',
    'The most dangerous gap is the one the target has stopped being able to see',
    'Nothing is closed for comfort — the loop stays open until something real resolves it',
  ]
}
```

### R13.2 — Input Processing for Relational Domain

```
CONVERSATION TRANSCRIPT:
  Each utterance → claim node
  Speaker tag → actor_id
  Sequence preserved → causal chain
  Emotional markers → tagged automatically (Ollama local)
  Pattern detection → runs across full session history, not single exchange

JOURNAL ENTRY:
  Parsed as first-person claim stream
  Events described → event nodes
  Emotional responses → emotion nodes
  Interpretations → meaning nodes
  GapHunter surfaces: where the writer's own claim chain has gaps
  (This is the most sensitive use — the target surfaces their own buried assumptions)

MESSAGE THREAD:
  Each message → claim node with actor
  Thread → causal sequence
  Pattern detection runs across full thread history
  Escalation patterns → sigma regime tracked over time

INCIDENT LOG:
  Structured input — date, description, impact, response
  Direct mapping to claim graph
  Longitudinal ledger analysis — pattern emergence over time
```

---

## APPENDIX: CRITICAL TERMINOLOGY

```
ABUSE         Systematic pattern causing harm — not a single incident
MANIPULATION  Influence bypassing rational agency — not all influence is manipulation
CONTROL       Restriction of autonomy — not all structure is control
GASLIGHTING   Epistemological attack on the target's claim graph — not mere disagreement
INVALIDATION  Denial of internal experience — not all challenge is invalidation
BOUNDARY      A statement of what you will and will not do — not a demand on others
ACCOUNTABILITY Owning impact regardless of intent — not punishment
REPAIR        Genuine acknowledgment + changed behavior — not just apology
SAFETY        Absence of threat to physical, emotional, or psychological integrity
TRAUMA BOND   Attachment formed through intermittent reinforcement + isolation
              — not the same as love, though it feels like it from inside

THE MOST IMPORTANT DISTINCTION:
  Conflict ≠ Abuse
  Conflict: two people with different needs or perspectives in friction
  Abuse: one person systematically reducing the other's capacity
         to perceive, name, and act on their own reality

  The difference is not intensity.
  The difference is direction and pattern.
  Conflict can be resolved. Both parties can be heard.
  Abuse moves in one direction — toward the abuser's consolidation of power
  and the target's loss of ground.
```

---

*GAPHUNTER RELATIONAL DOMAIN — v1.0.0*
*Built on: GAPHUNTER_SPEC_v1.0.0 · causal-nexus v6 · SISO architecture*
*The most dangerous gap is the one the target has stopped being able to see.*
*The loop stays open. Nothing is closed for comfort.*
*If it means anything — hold it.*
