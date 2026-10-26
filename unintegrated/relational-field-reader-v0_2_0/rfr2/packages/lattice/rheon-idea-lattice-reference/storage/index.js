/**
 * Storage index — initialise and export all storage primitives.
 *
 * Import order follows §3.1 (bottom-up):
 *   Ledger → Store → IdeaStore → ProjectStore
 *
 * DATA_ROOT defaults to ~/.rheon — override with RHEON_DATA env var.
 * §2.2 The storage device is the source of truth.
 */

import path from 'path';
import os from 'os';
import { Ledger }       from './Ledger.js';
import { Store }        from './Store.js';
import { IdeaStore }    from './IdeaStore.js';
import { ProjectStore } from './ProjectStore.js';

const DATA_ROOT     = process.env.RHEON_DATA || path.join(os.homedir(), '.rheon');
const LEDGER_PATH   = path.join(DATA_ROOT, 'ledger', 'events.jsonl');
const STORE_ROOT    = path.join(DATA_ROOT, 'store');
const IDEAS_DIR     = path.join(DATA_ROOT, 'ideas');
const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects');

// L0: Ledger — must exist before anything else
const ledger = new Ledger(LEDGER_PATH);

// L1: Content-addressed store
const store = new Store(STORE_ROOT, ledger);

// L2: Idea store + lattice
const ideaStore = new IdeaStore(IDEAS_DIR, ledger);

// L3: Project store (wraps git + file ops)
const projectStore = new ProjectStore(PROJECTS_ROOT, store, ledger);

export { ledger, store, ideaStore, projectStore, DATA_ROOT };
