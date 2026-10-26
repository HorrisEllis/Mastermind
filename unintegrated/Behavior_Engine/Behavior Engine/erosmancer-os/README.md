# ErosmancerOS

**Version:** 0.1.0  
**Author:** James Brooks  
**Language:** TypeScript (ESM)  
**Runtime:** Node.js 20+  
**Purpose:** CDP-native browser automation engine — identity resolution under DOM entropy

---

## What It Is

ErosmancerOS is a CDP orchestration layer. It is not a test framework, not a scraper, not a Playwright replacement at the API level. It is a **perception + action engine** that solves one hard problem:

> How do you re-find and act on a DOM node that no longer exists the way you captured it?

That is not a UI testing problem. That is a **state reconstruction problem under mutation**. The architecture reflects that.

---

## Architecture

```
ErosmancerOS
├── Telemetry          JSONL ring buffer + disk flush
├── BridgeCore         WebSocket CDP transport, session mgmt, reconnect, ping
├── NodeRegistry       UUID → Node map, fingerprinting, dedup, stale sweep, persistence
├── SelectorEngine     7-strategy UUID → live nodeId resolver
│   ├── 1. backendNodeId    (most stable, survives re-render)
│   ├── 2. UUID dataset     (data-eros-uuid attribute)
│   ├── 3. CSS selector
│   ├── 4. XPath
│   ├── 5. Text match       (innerText startsWith)
│   ├── 6. Attribute fingerprint (stable attrs only)
│   └── 7. Bounding box     (elementFromPoint probe — last resort)
└── SignalDispatcher   Priority queue, bounded retry, CDP primitive execution
    ├── click / type / hover / scroll
    ├── evaluate / navigate / screenshot
    ├── getAttribute / getProperty / waitForSelector
    └── Retry: exponential backoff, commandFailed event on ceiling
```

---

## Stack

```json
{
  "runtime": "Node.js 20+",
  "language": "TypeScript 5.4+ (ESM)",
  "dependencies": {
    "ws": "WebSocket CDP transport",
    "eventemitter3": "Typed event bus",
    "uuid": "UUID generation",
    "zod": "Runtime config validation"
  }
}
```

---

## Quick Start

```bash
npm install
npm run dev          # tsx watch — live reload
npm run build        # tsc output to dist/
npm run test         # integration test suite (no browser required)
npm run lint         # tsc --noEmit
```

### Minimal usage

```typescript
import { ErosmancerOS } from './src/index.ts';

const os = new ErosmancerOS({
  bridge: {
    target: { type: 'local', port: 9222 }
  }
});

await os.start();

const tab = await os.openTab('https://example.com');
const node = os.registerNode({
  tag: 'button',
  tabId: tab.tabId,
  selector: '#submit',
  attributes: { 'data-testid': 'submit-btn' },
  backendNodeId: 42
});

os.click(node.uuid, tab.tabId);
```

---

## Configuration

All config is typed via `OSConfig`. Partial overrides merge with `DEFAULT_CONFIG`.

```typescript
interface OSConfig {
  bridge: {
    target: BridgeTarget;          // { type: 'local', port: 9222 } | { type: 'remote', wsUrl: string }
    commandTimeoutMs: number;      // default: 30_000
    pingIntervalMs: number;        // default: 15_000
    reconnectDelayMs: number;      // default: 1_000
    maxReconnectAttempts: number;  // default: 10
  };
  selector: {
    fallbackChain: SelectorStrategy[]; // ordered resolution strategies
  };
  registry: {
    staleThresholdMs: number;     // default: 60_000
    maxNodes: number;             // default: 5_000
    persistPath?: string;         // optional JSONL persistence
  };
  dispatcher: {
    maxQueueSize: number;         // default: 500
    defaultMaxRetries: number;    // default: 3
    retryDelayMs: number;         // default: 500
  };
  telemetry: {
    maxEvents: number;            // ring buffer size
    flushIntervalMs: number;
    persistPath?: string;         // optional JSONL flush
  };
}
```

---

## Events

```typescript
os.on('ready', () => {});
os.on('shutdown', () => {});
os.on('node:registered', (node) => {});
os.on('node:missing', (uuid) => {});
os.on('tab:opened', (tab) => {});
os.on('tab:closed', (targetId) => {});
os.on('command:success', (result) => {});
os.on('command:failed', (result, command) => {});
```

---

## Known Bugs

| # | Location | Description | Severity |
|---|----------|-------------|----------|
| 1 | `byTextMatch`, `byRelativePosition` | String interpolation in `Runtime.evaluate` expressions — `textContent` not sanitized against JS injection. Use `Runtime.callFunctionOn` with arg params instead. | HIGH |
| 2 | `BridgeCore` | No backpressure. Concurrent `send()` calls stack unbounded pending promises. CDP will degrade under load. | HIGH |
| 3 | `SelectorEngine` | `relativePosition` strategy is misnamed — it falls back to the same global tag scan as `textMatch`. No actual DOM hierarchy traversal. | MEDIUM |
| 4 | `SelectorEngine` | Fallback chain is static across all node types. `backendNodeId` and `boundingBox` carry equal weight in the chain. | MEDIUM |
| 5 | `tryStrategy` case `"uuid"` | Routes to `byBackendNodeId()` — the naming is inconsistent. `uuid` strategy should resolve via `data-eros-uuid` attribute. `backendNodeId` strategy does the `DOM.describeNode` call. | LOW |

---

## Limitations (Current Scope)

- External process only. Not designed to run inside a browser extension. For in-extension CDP, use `chrome.debugger` / `browser.debugger` API directly.
- Firefox CDP via `--remote-debugging-port` is supported but some CDP domains (e.g. `Input.dispatchKeyEvent` character routing) differ from Chromium.
- No multi-frame support. `DOM.querySelector` scopes to main frame only.
- `SelectorEngine` has no feedback loop. Resolution history is not tracked. Every resolution attempt starts from position zero.
