/**
 * @spatial/forge — v1.0.0
 *
 * Behavioral pattern compiler.
 * Observed patterns → executable code.
 * The system that writes itself from what it sees.
 *
 * The invention:
 *   You observe behavior. Patterns emerge.
 *   Forge compiles those patterns into modules.
 *   Those modules deploy back into the system.
 *   The system gets better at seeing what it already saw.
 *   The loop closes.
 *
 * Works across species.
 * Works on any signal the bus carries.
 * §K6 — all I/O via @spatial/bus.
 * §5.5 — zero runtime dependencies.
 * §1.1 — outputs are signals, not verdicts.
 */

export { PatternCompiler, COMPILER_VERSION }          from './compiler.js';
export { createPattern, matchGrammar, GRAMMAR_RULES,
         GRAMMAR_VERSION, SIGNAL_TYPES }              from './grammar.js';
export { TEMPLATES }                                   from './templates.js';
export { loadModule, buildManifest, bundle,
         EMIT_VERSION }                               from './emit.js';
