// ═══════════════════════════════════════════════════════════════════
// VAULT BOOT SEQUENCE
// foundation/vault/vault-boot.js
//
// Ordered pre-flight checks, run before the app will let anyone in.
//
// ─────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Every failure this project has hit was silent. The autosave that was
// a no-op for an entire build. The seal that threw three times in
// 600ms behind a UI that looked fine. The password change that would
// have destroyed a vault while reporting success. None of them were
// hard to detect — nothing was looking.
//
// A boot sequence is the cheapest possible place to look, because it
// runs before there is any work in memory to lose.
//
// ─────────────────────────────────────────────────────────────────
// SHAPE (§14 — gates)
//
// Each check is a gate: given probes, return a verdict. The checks are
// pure functions over injected probe results, so the whole sequence is
// testable without Electron, without a filesystem and without a UI.
// The probes are the only impure part, and they live in the caller.
//
// Severity drives control flow:
//   pass     → continue
//   notice   → continue, mention it
//   warn     → continue, but surface prominently and offer a remedy
//   critical → STOP. Do not proceed to unlock.
//
// The sequence deliberately does NOT stop at the first warn. Someone
// with a missing vault AND a broken ledger needs to see both, or they
// will fix one, restart, and discover the other.
//
// UUID: 4a3b2c1d-vault-6000-8000-bootseq0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.VaultBoot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const PASS = 'pass', NOTICE = 'notice', WARN = 'warn', CRITICAL = 'critical';
  const RANK = { pass: 0, notice: 1, warn: 2, critical: 3 };

  function step(id, label, status, detail, remedy) {
    return { id, label, status, detail: detail || null, remedy: remedy || null };
  }

  // ── The checks, in order. Each takes the probe bundle. ──────────────
  // Order is dependency order: nothing downstream is meaningful if the
  // runtime is missing, so runtime is first and everything after it is
  // reported as 'skipped' rather than guessed at.

  const CHECKS = [
    {
      id: 'runtime',
      label: 'Desktop runtime',
      run: (p) => p.hasNXAPI
        ? step('runtime', 'Desktop runtime', PASS, 'Electron bridge present')
        : step('runtime', 'Desktop runtime', CRITICAL,
            'No NXAPI bridge. The vault lives on disk and cannot be read or written from a browser.',
            'Launch the MASTERMIND desktop app.'),
    },
    {
      id: 'crypto',
      label: 'Encryption',
      // Not "is WebCrypto defined" — an actual encrypt/decrypt round trip.
      // Availability and correctness are different questions, and only the
      // second one matters.
      run: (p) => {
        if (!p.cryptoAvailable) {
          return step('crypto', 'Encryption', CRITICAL,
            'Web Crypto is unavailable. Nothing can be encrypted or decrypted.',
            'Check Electron contextIsolation / secure-context settings.');
        }
        if (!p.cryptoRoundTrip) {
          return step('crypto', 'Encryption', CRITICAL,
            'AES-GCM round trip FAILED — encrypt/decrypt did not return the original bytes. ' +
            'Saving now would produce unreadable data.',
            'Do not proceed. Report this — it indicates a broken crypto implementation.');
        }
        return step('crypto', 'Encryption', PASS,
          'AES-256-GCM round trip verified' + (p.kdfMs != null ? ' · KDF ' + p.kdfMs + 'ms' : ''));
      },
    },
    {
      id: 'datadir',
      label: 'Data folder',
      run: (p) => p.dataDir
        ? step('datadir', 'Data folder', PASS, p.dataDir)
        : step('datadir', 'Data folder', CRITICAL, 'No data folder selected.',
            'Choose where your vault lives.'),
    },
    {
      id: 'vault_file',
      label: 'Vault file',
      run: (p) => {
        if (p.vaultExists) {
          return step('vault_file', 'Vault file', PASS,
            p.vaultBytes != null ? p.vaultBytes + ' bytes' : 'present');
        }
        // The case he asked for: the file is gone. Whether this is
        // recoverable depends entirely on whether snapshots exist, so the
        // remedy is different in each case and the message says which.
        return p.snapshotCount > 0
          ? step('vault_file', 'Vault file', CRITICAL,
              'The vault file is MISSING from the data folder. ' + p.snapshotCount +
              ' snapshot(s) are available.',
              'Restore the most recent snapshot, or create a new vault.')
          : step('vault_file', 'Vault file', CRITICAL,
              'The vault file is MISSING and there are no snapshots to restore from.',
              'Create a new vault, or point the data folder at a location that has one.');
      },
    },
    {
      id: 'vault_format',
      label: 'Vault format',
      run: (p) => {
        if (!p.vaultExists) return step('vault_format', 'Vault format', 'skipped', 'No vault file');
        if (!p.parseOk) {
          // "Not valid JSON" is technically true of a zip too, but it is the
          // wrong diagnosis — it tells someone their vault is DAMAGED when
          // the real problem is that this was never a vault to begin with
          // (a backup archive at the wrong path, an export renamed onto
          // mastermind.vault, a sync client dropping a conflict copy in
          // place). Different problem, different remedy, so it gets its
          // own message rather than folding into generic corruption.
          if (p.binaryFormat) {
            return step('vault_format', 'Vault format', CRITICAL,
              'This file is a ' + p.binaryFormat.toUpperCase() + ' archive, not a MASTERMIND vault. ' +
              'It has not been touched or modified.',
              p.snapshotCount > 0
                ? 'Point the data folder at the real vault, or restore a snapshot to recreate one here.'
                : 'Point the data folder at the real vault, or create a new one.');
          }
          return step('vault_format', 'Vault format', CRITICAL,
            p.parseMessage || 'The vault file could not be parsed.',
            p.snapshotCount > 0 ? 'Restore a snapshot.' : 'No snapshots available — this is unrecoverable without a backup.');
        }
        // An explicit, confirmed opt-out is a choice, not a fault — it does
        // not block and it does not nag with a WARN on every single boot.
        // But it is never reported as PASS either: this file has no cipher,
        // no integrity hash and no tamper detection, and the screen is the
        // one place that is guaranteed to say so.
        if (p.plain) {
          return step('vault_format', 'Vault format', NOTICE,
            'Unencrypted vault — the file is plain readable JSON. Anything on this ' +
            'machine can read or change it, and a change cannot be detected.',
            'Turn encryption on in Settings to seal it.');
        }
        return p.legacy
          ? step('vault_format', 'Vault format', NOTICE, 'v5 format — upgrades to v6 on the next save')
          : step('vault_format', 'Vault format', PASS, 'v6 · ' + (p.kdfIterations
              ? p.kdfIterations.toLocaleString() + ' KDF iterations' : 'sealed'));
      },
    },
    {
      // Whether THIS file is encrypted is answered by vault_format. This
      // asks a different question: does that match what was expected, based
      // on the last time this machine successfully opened this vault. The
      // two can disagree in only one dangerous direction — encryption was
      // expected and the file on disk is now plain. Normal use never
      // produces that: turning encryption OFF requires the password and an
      // explicit confirmation (optsDecryptVault), and turning it ON from
      // plain is the opposite, safe direction. A file that silently lost
      // its cipher between sessions was replaced or stripped by something
      // outside the app, so this blocks rather than just noting it — unlike
      // vault_format's NOTICE for a vault that was plain on purpose from
      // the start.
      id: 'encryption_expected',
      label: 'Encryption match',
      run: (p) => {
        if (!p.vaultExists || !p.parseOk) return step('encryption_expected', 'Encryption match', 'skipped', 'No readable vault');
        if (p.expectedEncrypted == null) {
          return step('encryption_expected', 'Encryption match', 'skipped', 'No prior record on this machine to compare against');
        }
        const isPlain = !!p.plain;
        if (p.expectedEncrypted === true && isPlain) {
          return step('encryption_expected', 'Encryption match', CRITICAL,
            'This vault was encrypted (AES-256-GCM) the last time this machine opened it. The file on disk is now ' +
            'plain, unencrypted JSON. Encryption is never removed silently by normal use — this points at the ' +
            'file having been replaced, or its encryption stripped, outside the app.',
            p.snapshotCount > 0
              ? 'Do not enter your password. Restore a verified snapshot, or confirm in person that this change was intentional.'
              : 'Do not enter your password. No snapshots are available — investigate before doing anything else with this file.');
        }
        if (p.expectedEncrypted === false && !isPlain) {
          // The safe direction — encryption was turned on since the last
          // session. Worth saying, not worth blocking.
          return step('encryption_expected', 'Encryption match', NOTICE,
            'This vault was unencrypted last time; the file on disk is now encrypted — matches turning encryption on in Settings.');
        }
        return step('encryption_expected', 'Encryption match', PASS,
          isPlain ? 'Unencrypted, as expected' : 'Encrypted, as expected');
      },
    },
    {
      id: 'integrity',
      label: 'File integrity',
      // Checkable without a password, which is why it runs before unlock.
      run: (p) => {
        if (!p.vaultExists || !p.parseOk) return step('integrity', 'File integrity', 'skipped', 'No readable vault');
        // Without this, a plain vault reports ciphertextIntact === false and
        // the screen accuses an intact file of being damaged. There is no
        // ciphertext, so there is nothing to be intact or not.
        if (p.plain) return step('integrity', 'File integrity', NOTICE,
          'Unencrypted vaults carry no ciphertext hash — outside edits cannot be detected');
        if (p.legacy) return step('integrity', 'File integrity', NOTICE, 'v5 has no ciphertext hash to check');
        return p.ciphertextIntact
          ? step('integrity', 'File integrity', PASS, 'Ciphertext hash verified')
          : step('integrity', 'File integrity', CRITICAL,
              'Ciphertext hash MISMATCH. The vault file is damaged — this is not a password problem.',
              p.snapshotCount > 0 ? 'Restore the most recent verified snapshot.' : 'No snapshots available.');
      },
    },
    {
      id: 'ledger',
      label: 'Audit ledger',
      run: (p) => {
        if (p.ledgerMissing) {
          return p.vaultAnchored
            ? step('ledger', 'Audit ledger', CRITICAL,
                'The vault is sealed against an audit chain that is not on disk. It was deleted, or the vault was moved without it.',
                'Investigate before unlocking.')
            : step('ledger', 'Audit ledger', NOTICE, 'Starting a new chain');
        }
        return p.ledgerChainOk
          ? step('ledger', 'Audit ledger', PASS, p.ledgerSeq + ' entries · chain verified' +
              (p.unlockFailures ? ' · ' + p.unlockFailures + ' failed unlock(s) recorded' : ''))
          : step('ledger', 'Audit ledger', CRITICAL,
              'The audit chain is BROKEN' + (p.ledgerReason ? ' (' + p.ledgerReason + ')' : '') +
              '. Entries cannot be edited without breaking the hash chain, so this file was modified outside MASTERMIND.',
              'Investigate before unlocking.');
      },
    },
    {
      id: 'snapshots',
      label: 'Snapshots',
      run: (p) => {
        if (!p.snapshotCount) {
          return step('snapshots', 'Snapshots', WARN,
            'No snapshots exist. If the vault file is lost or damaged, there is nothing to restore from.',
            'A snapshot will be taken now.');
        }
        if (p.newestSnapshotVerified === false) {
          return step('snapshots', 'Snapshots', WARN,
            'The most recent snapshot FAILED verification: ' + (p.newestSnapshotProblem || 'unknown') +
            '. Older snapshots may still be good.',
            'Check older snapshots before relying on a restore.');
        }
        const stale = p.newestSnapshotAgeHours != null && p.newestSnapshotAgeHours > 168;
        return stale
          ? step('snapshots', 'Snapshots', NOTICE,
              p.snapshotCount + ' snapshot(s) · newest is ' +
              Math.round(p.newestSnapshotAgeHours / 24) + ' days old')
          : step('snapshots', 'Snapshots', PASS,
              p.snapshotCount + ' snapshot(s) · newest verified' +
              (p.newestSnapshotAgeHours != null ? ' · ' + p.newestSnapshotAgeHours + 'h old' : ''));
      },
    },
    {
      id: 'watcher',
      label: 'Vault watcher',
      run: (p) => p.watcherArmed
        ? step('watcher', 'Vault watcher', PASS, 'Watching the vault file for deletion or outside edits')
        : step('watcher', 'Vault watcher', WARN,
            'The vault file is not being watched. Deletion or modification by another process would go unnoticed.',
            'Restart the app; if it persists, check filesystem watch limits.'),
    },
  ];

  // ── Run ────────────────────────────────────────────────────────────
  // Returns every step, not just the failing ones: a boot report that
  // only lists problems teaches nobody what "healthy" looks like.

  function run(probes) {
    const p = probes || {};
    const steps = CHECKS.map((c) => {
      try { return c.run(p); }
      catch (e) {
        return step(c.id, c.label, CRITICAL, 'Check itself failed: ' + e.message,
          'This is a bug in the boot sequence, not necessarily in your vault.');
      }
    });

    const worst = steps.reduce((w, s) => (RANK[s.status] || 0) > RANK[w] ? s.status : w, PASS);
    const blocking = steps.filter((s) => s.status === CRITICAL);
    const warnings = steps.filter((s) => s.status === WARN);

    return {
      steps,
      worst,
      canProceed: blocking.length === 0,
      blocking,
      warnings,
      summary: blocking.length
        ? blocking.length + ' blocking problem(s) — cannot open the vault'
        : warnings.length
          ? warnings.length + ' warning(s) — vault will open'
          : 'All checks passed',
    };
  }

  return { run, CHECKS, PASS, NOTICE, WARN, CRITICAL, RANK, step };
});
