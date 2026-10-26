// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT GUARD
// foundation/vault/vault-guard.js
//
// PURE. Takes a vault header and a ledger summary, returns a verdict.
// No I/O, no crypto, no prompts — it decides WHAT happened, and the
// caller decides what to say about it. That split is what makes every
// one of these branches testable without a filesystem.
//
// ─────────────────────────────────────────────────────────────────
// THE ROLLBACK PROBLEM, STATED HONESTLY
//
// Restoring an old vault file is undetectable from the file alone.
// The password is right, the GCM tag validates, savedAt is authentic
// — it is simply old. Catching it requires remembering a high-water
// mark somewhere the attacker would also have to edit.
//
// That somewhere is the audit ledger, which already had to exist
// outside the vault (a log inside the vault cannot record a failed
// unlock, and can be rewritten by anyone who can open it). So the
// high-water mark rides along in the ledger's SAVE entries, and the
// ledger is hash-chained, so editing it backwards breaks the chain.
//
// Note that a normal, healthy session has the ledger AHEAD of the
// vault's anchor — unlocking appends an entry after the last save.
// "Ledger ahead" is therefore not the rollback signal. The signal is
// a vault whose saveCount is BELOW the highest saveCount the ledger
// has witnessed for that vaultId.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THE GUARD CANNOT DO
//
// If both the vault file and the ledger are replaced together with a
// consistent older pair, this returns OK. Defending against that
// requires state on separate media, which the current design does not
// have. Stated here so nobody reads a green verdict as more than it is.
//
// UUID: 4a3b2c1d-vault-6000-8000-guard000001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.VaultGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const ZERO_HEAD = '0'.repeat(64);

  const SEVERITY = Object.freeze({
    OK:       'ok',
    NOTICE:   'notice',
    WARN:     'warn',
    CRITICAL: 'critical',
  });

  // Reduces a chain to the facts the guard needs. Runs wherever the
  // entries are (main process); the verdict itself stays pure.
  function summarizeLedger(entries, chainVerdict) {
    const list = entries || [];
    let maxSaveCount = -1;
    let saveCountVaultId = null;
    const vaultIds = new Set();
    let unlockFailures = 0;
    let lastUnlockFailAt = null;

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const d = (e && e.data) || {};
      if (d.vaultId) vaultIds.add(d.vaultId);
      if (typeof d.saveCount === 'number' && d.saveCount > maxSaveCount) {
        maxSaveCount = d.saveCount;
        saveCountVaultId = d.vaultId || null;
      }
      if (e && e.type === 'vault.unlock.failed') {
        unlockFailures++;
        lastUnlockFailAt = e.ts;
      }
    }

    const last = list.length ? list[list.length - 1] : null;
    return {
      present:          list.length > 0,
      chainOk:          chainVerdict ? chainVerdict.ok !== false : true,
      chainReason:      chainVerdict && chainVerdict.ok === false ? chainVerdict.reason : null,
      chainBrokenAt:    chainVerdict && chainVerdict.ok === false ? chainVerdict.brokenAt : null,
      seq:              last ? last.seq : 0,
      head:             last ? last.hash : ZERO_HEAD,
      maxSaveCount,
      saveCountVaultId,
      vaultIds:         Array.from(vaultIds),
      unlockFailures,
      lastUnlockFailAt,
      // Positional lookup for ancestry proof — index is seq-1.
      hashAt: list.map((e) => (e && e.hash) || null),
    };
  }

  function verdict(code, severity, message, detail) {
    return {
      code,
      severity,
      message,
      detail: detail || null,
      ok: severity === SEVERITY.OK,
      requiresPrompt: severity === SEVERITY.WARN || severity === SEVERITY.CRITICAL,
    };
  }

  function containsAt(summary, seq, head) {
    if (seq === 0) return head === ZERO_HEAD;
    const found = summary.hashAt[seq - 1];
    return !!found && found === head;
  }

  // ── The verdict ───────────────────────────────────────────────────
  // header:  { vaultId, saveCount, ledgerAnchor, savedAt }
  // summary: output of summarizeLedger()
  // ledgerMissing: the file is absent (distinct from present-but-empty)

  function evaluate(header, summary, ledgerMissing) {
    const anchor = header.ledgerAnchor || null;

    // Ledger unreadable or chain broken — nothing downstream can be
    // trusted, so this outranks every other check.
    if (!ledgerMissing && summary.present && !summary.chainOk) {
      return verdict(
        'LEDGER_BROKEN',
        SEVERITY.CRITICAL,
        'The audit ledger has been altered.',
        'Chain verification failed (' + summary.chainReason + ') at entry ' +
          ((summary.chainBrokenAt != null ? summary.chainBrokenAt : 0) + 1) +
          '. Entries cannot be edited without breaking the hash chain, so this file has been modified outside MASTERMIND.'
      );
    }

    // First run: no ledger, no anchor. Expected exactly once.
    if (ledgerMissing && !anchor) {
      return verdict('FRESH', SEVERITY.OK, 'New vault — audit ledger starting.');
    }

    // Anchor points at a chain that is not on disk.
    if (ledgerMissing && anchor) {
      return verdict(
        'LEDGER_MISSING',
        SEVERITY.CRITICAL,
        'The audit ledger is gone.',
        'This vault was sealed against an audit chain at entry ' + anchor.seq +
          ', but no ledger file is present. It was deleted or the vault was moved without it.'
      );
    }

    // Ledger exists, vault carries no anchor — the v5 → v6 case, and
    // also what a hand-built vault would look like.
    if (!anchor) {
      return verdict(
        'UNANCHORED',
        SEVERITY.NOTICE,
        'Vault is not yet anchored to the audit ledger.',
        'It will be sealed to the chain on the next save.'
      );
    }

    // A vault from a different lineage next to this ledger.
    if (summary.vaultIds.length && summary.vaultIds.indexOf(header.vaultId) === -1) {
      return verdict(
        'FOREIGN_VAULT',
        SEVERITY.CRITICAL,
        'This vault does not belong to this audit ledger.',
        'The ledger has only ever witnessed vault ' + summary.vaultIds.join(', ') +
          ', and this file identifies as ' + header.vaultId + '.'
      );
    }

    // The anchor names a head the chain never contained at that
    // position — the vault and the ledger are on different forks.
    if (!containsAt(summary, anchor.seq, anchor.head)) {
      return verdict(
        'ANCHOR_UNKNOWN',
        SEVERITY.CRITICAL,
        'Vault anchor does not match the audit ledger.',
        'This vault was sealed against entry ' + anchor.seq +
          ' with a hash the ledger does not have at that position. One of the two has been replaced.'
      );
    }

    // Ancestry is proven. Now the high-water check: has this ledger
    // witnessed a NEWER save than the vault in front of us?
    if (summary.maxSaveCount > header.saveCount) {
      return verdict(
        'ROLLBACK',
        SEVERITY.WARN,
        'This vault is older than the last one this ledger saw.',
        'The audit ledger recorded save #' + summary.maxSaveCount +
          ', but this file is save #' + header.saveCount +
          '. Either a backup was restored deliberately, or the current vault was swapped for an earlier copy. ' +
          'Opening it means the ' + (summary.maxSaveCount - header.saveCount) +
          ' more recent save(s) are not in this file.'
      );
    }

    return verdict('OK', SEVERITY.OK, 'Vault verified against the audit ledger.');
  }

  // Convenience for the unlock screen: turns the verdict into the
  // question actually put to the person. Text lives here so the guard
  // stays the single source of truth for what each state means.
  function promptFor(v) {
    if (!v.requiresPrompt) return null;
    if (v.code === 'ROLLBACK') {
      return {
        title:   'OLDER VAULT DETECTED',
        body:    v.detail,
        confirm: 'Open it anyway',
        cancel:  'Stop — do not open',
        // Opening is not destructive by itself. Saving over the newer
        // lineage is. The caller must keep the session read-only until
        // this is answered.
        defaultChoice: 'cancel',
      };
    }
    return {
      title:   'VAULT INTEGRITY WARNING',
      body:    v.message + '\n\n' + (v.detail || ''),
      confirm: 'Continue at my own risk',
      cancel:  'Stop',
      defaultChoice: 'cancel',
    };
  }

  return { SEVERITY, ZERO_HEAD, summarizeLedger, evaluate, promptFor, containsAt, verdict };
});

// §5.1 — registered component, not an orphan. Announces itself on the bus
// so the registry can see it; no orphan modules or hooks are allowed.
(function () {
  if (typeof MM_BUS === 'undefined' || typeof MM_BUS.emit !== 'function') return;
  MM_BUS.emit('mm.module.ready', {
    module:  'vault-guard',
    uuid:    '4a3b2c1d-vault-6000-8000-guard000001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure:    true,
  });
})();
