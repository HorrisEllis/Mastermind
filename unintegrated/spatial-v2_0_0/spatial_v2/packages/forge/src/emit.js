/**
 * @spatial/forge — emit.js
 *
 * Code emission utilities.
 * Takes compiled module results and makes them usable:
 *   - dynamic import (eval-based, opt-in)
 *   - file output (Node.js)
 *   - bus dispatch (the default — emit as event, let consumer handle)
 *
 * The bus approach is the Spatial way:
 *   spatial.forge.module.compiled carries the code string.
 *   The consumer decides what to do with it.
 *   This module provides helpers for common cases.
 */

'use strict';

export const EMIT_VERSION = '1.0.0';

/**
 * Emit compiled module code as a data URL for dynamic import.
 * USE WITH CAUTION — eval-equivalent.
 * Only for trusted, system-generated code (i.e. what forge produces).
 *
 * @param {string} code — ESM module source
 * @returns {Promise<module>} — the loaded module
 */
export async function loadModule(code) {
  const blob = new Blob([code], { type: 'text/javascript' });
  const url  = URL.createObjectURL(blob);
  try {
    const mod = await import(url);
    return mod;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Format compiled results as a manifest — summary of all generated modules.
 */
export function buildManifest(compiledModules) {
  return {
    version:   EMIT_VERSION,
    generated: new Date().toISOString(),
    count:     compiledModules.length,
    modules:   compiledModules.map(m => ({
      moduleName: m.moduleName,
      templateId: m.templateId,
      ruleId:     m.ruleId,
      patternId:  m.patternId,
      linesOfCode: m.code.split('\n').length,
      ts:         m.ts,
    })),
  };
}

/**
 * Collect all code into a single bundle string.
 * Useful for file output or blob download.
 */
export function bundle(compiledModules) {
  const header = `/**
 * @spatial/forge — GENERATED BUNDLE
 * Generated: ${new Date().toISOString()}
 * Modules: ${compiledModules.length}
 * DO NOT EDIT — regenerate via @spatial/forge PatternCompiler
 */\n\n`;
  return header + compiledModules.map(m => m.code).join('\n\n');
}
