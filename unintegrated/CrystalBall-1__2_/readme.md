Now the kernel — the main API engine:All 12 modules pass the isolation check. Now copy to outputs:Here's what was built — **3,600 lines across 17 files**, verified clean on isolation.

---

## `@spatial/liminal` — Architecture summary

**The kernel is the API engine. The bus is the only wire. No module touches another.**

### Structure
```
liminal/
  bus/          — LiminalBus + 50 named LIM.* channels
  core/         — GAP_TYPE (16), GAP_REASON (9), DOMAIN (60+), GapSignal, classifySigma
  kernel/       — LiminalKernel: boots modules, owns ledger, exposes API
  modules/      — 12 isolated detectors, each in its own folder
```

### The 12 modules (each isolated, each owns one channel)

| Module | Detects | Channel |
|--------|---------|---------|
| `assumption` | Load-bearing assertions without evidence, causal leaps, universalisation, tautology | `lim.gap.assumption` |
| `shadow` | Present-but-unspoken — pronoun displacement, minimization inversion, over-apology | `lim.gap.shadow` |
| `contrastive` | Belief-behavior gap, word-emotion mismatch, cross-modal divergence | `lim.gap.contrastive` |
| `negative-space` | Circling without landing, topic orbit, unresolved shifts, semantic redirect | `lim.gap.negative_space` |
| `structural` | Frame control, presupposition loading, naturalisation, power geometry | `lim.gap.structural` |
| `reversal` | "Fine" meaning not fine, negation clusters, rhetorical accusations | `lim.gap.reversal` |
| `field` | Oscillation, hard/blurred edges, plateau, asymptote, fractal signal, sigma regime | `lim.gap.field` |
| `relational` | All 6 gaslighting layers, guilt induction, future faking, triangulation, contempt | `lim.gap.relational` |
| `oscillatory` | Sigma OSCILLATORY/COLLAPSING, intermittent reinforcement, approach-retreat, pendulum | `lim.gap.oscillatory` |
| `music` | Rhyme forced/broken, pivot missing/early, cliché density, harmonic tension, missing hook/bridge | `lim.gap.music` |
| `code` | Silent failure (crit 1.00), unawaited promises, SQL injection, JS/TS/Python/SQL patterns | `lim.gap.code` |
| `existential` | Identity assumption, values-behavior gap, meaning SPOF, shadow projection, purpose gap | `lim.gap.existential` |

### Isolation contract — verified
All 12 modules import **only** from `../../bus` and `../../core`. Zero cross-module dependencies. The kernel is the only thing that imports modules — to boot them, not to call them.