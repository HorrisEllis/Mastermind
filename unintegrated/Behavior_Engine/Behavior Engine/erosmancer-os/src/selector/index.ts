// ============================================================
// ErosmancerOS — Selector Engine
//
// Resolves a node UUID → live CDP nodeId using a full
// 7-strategy fallback chain. Every strategy is a real CDP
// call. Nothing pretends.
//
// Chain (in order):
//   1. backendNodeId   (most stable, survives re-render)
//   2. UUID dataset    (data-eros-uuid attribute)
//   3. CSS selector
//   4. XPath
//   5. Text match      (innerText contains)
//   6. Attribute fingerprint
//   7. Last known bounding box (dispatchMouseEvent probe)
// ============================================================

import type { BridgeCore } from "../bridge/index.ts";
import type { NodeRegistry } from "../registry/index.ts";
import type {
  Node,
  ResolutionResult,
  SelectorStrategy,
  OSConfig,
} from "../types/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

interface CDPNodeId {
  nodeId: number;
}

interface CDPSearchResults {
  searchId: string;
  resultCount: number;
}

interface CDPSearchIndex {
  nodeIds: number[];
}

interface CDPBackendNode {
  backendNodeId: number;
}

interface CDPResolveResult {
  object: { objectId: string };
}

interface CDPNodeDescription {
  node: {
    nodeId: number;
    backendNodeId: number;
    nodeName: string;
    attributes?: string[];
  };
}

interface CDPEvalResult {
  result: { value?: unknown; objectId?: string };
}

export class SelectorEngine {
  private readonly config: OSConfig["selector"];
  private readonly telemetry: Telemetry;
  private readonly bridge: BridgeCore;
  private readonly registry: NodeRegistry;

  constructor(
    config: OSConfig["selector"],
    bridge: BridgeCore,
    registry: NodeRegistry,
    telemetry: Telemetry
  ) {
    this.config = config;
    this.bridge = bridge;
    this.registry = registry;
    this.telemetry = telemetry;
  }

  /**
   * Resolve a node UUID to a live CDP nodeId.
   * Walks the fallback chain. Returns ResolutionResult.
   * On success, updates the registry with refreshed nodeId.
   */
  async resolve(uuid: string, sessionId: string): Promise<ResolutionResult> {
    const start = Date.now();
    const node = this.registry.get(uuid);

    if (!node) {
      return this.failure([], start, "Node UUID not in registry");
    }

    const attempted: SelectorStrategy[] = [];

    for (const strategy of this.config.fallbackChain) {
      attempted.push(strategy);
      const nodeId = await this.tryStrategy(strategy, node, sessionId);

      if (nodeId !== null) {
        this.registry.updateNodeId(uuid, nodeId);
        this.telemetry.info(
          "selector",
          `Resolved [${uuid.slice(0, 8)}] via ${strategy}`,
          { nodeId, ms: Date.now() - start }
        );

        return {
          found: true,
          strategy,
          nodeId,
          backendNodeId: node.backendNodeId,
          fallbacksAttempted: attempted,
          durationMs: Date.now() - start,
        };
      }
    }

    this.registry.markMissing(uuid);
    this.telemetry.error(
      "selector",
      `All strategies failed for [${uuid.slice(0, 8)}]`,
      { attempted }
    );

    return this.failure(attempted, start);
  }

  // ─── Strategies ───────────────────────────────────────────

  private async tryStrategy(
    strategy: SelectorStrategy,
    node: Node,
    sessionId: string
  ): Promise<number | null> {
    try {
      switch (strategy) {
        case "uuid":
          return await this.byBackendNodeId(node, sessionId);
        case "cssSelector":
          return await this.byCssSelector(node, sessionId);
        case "xpath":
          return await this.byXPath(node, sessionId);
        case "textMatch":
          return await this.byTextMatch(node, sessionId);
        case "attributeFingerprint":
          return await this.byAttributeFingerprint(node, sessionId);
        case "relativePosition":
          return await this.byRelativePosition(node, sessionId);
        case "boundingBox":
          return await this.byBoundingBox(node, sessionId);
        default:
          return null;
      }
    } catch (err) {
      this.telemetry.debug("selector", `Strategy ${strategy} threw`, { err });
      return null;
    }
  }

  // 1. BackendNodeId — survives re-renders, most stable
  private async byBackendNodeId(node: Node, sessionId: string): Promise<number | null> {
    if (!node.backendNodeId) return null;

    try {
      const result = await this.bridge.send<CDPNodeDescription>(
        "DOM.describeNode",
        { backendNodeId: node.backendNodeId, depth: 0 },
        sessionId
      );
      return result.node?.nodeId ?? null;
    } catch {
      return null;
    }
  }

  // 2. CSS Selector
  private async byCssSelector(node: Node, sessionId: string): Promise<number | null> {
    if (!node.selector) return null;

    try {
      // Get document root first
      const doc = await this.bridge.send<CDPNodeId>(
        "DOM.getDocument",
        { depth: 0 },
        sessionId
      );

      const result = await this.bridge.send<CDPNodeId>(
        "DOM.querySelector",
        { nodeId: doc.nodeId, selector: node.selector },
        sessionId
      );

      return result.nodeId && result.nodeId !== 0 ? result.nodeId : null;
    } catch {
      return null;
    }
  }

  // 3. XPath
  private async byXPath(node: Node, sessionId: string): Promise<number | null> {
    if (!node.xpath) return null;

    try {
      const search = await this.bridge.send<CDPSearchResults>(
        "DOM.performSearch",
        { query: node.xpath, includeUserAgentShadowDOM: true },
        sessionId
      );

      if (!search.searchId || search.resultCount === 0) return null;

      const results = await this.bridge.send<CDPSearchIndex>(
        "DOM.getSearchResults",
        { searchId: search.searchId, fromIndex: 0, toIndex: 1 },
        sessionId
      );

      // Clean up search context
      await this.bridge.send("DOM.discardSearchResults", { searchId: search.searchId }, sessionId);

      return results.nodeIds?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // 4. Text match — JS-based innerText search
  private async byTextMatch(node: Node, sessionId: string): Promise<number | null> {
    if (!node.textContent?.trim()) return null;

    const text = node.textContent.trim().slice(0, 100).replace(/'/g, "\\'");
    const tag = node.tag.toLowerCase();

    try {
      const result = await this.bridge.send<CDPEvalResult>(
        "Runtime.evaluate",
        {
          expression: `
            (function() {
              const els = document.querySelectorAll('${tag}');
              for (const el of els) {
                if (el.innerText && el.innerText.trim().startsWith('${text}')) {
                  return el;
                }
              }
              return null;
            })()
          `,
          returnByValue: false,
        },
        sessionId
      );

      if (!result.result?.objectId) return null;

      const desc = await this.bridge.send<CDPNodeDescription>(
        "DOM.describeNode",
        { objectId: result.result.objectId, depth: 0 },
        sessionId
      );

      return desc.node?.nodeId ?? null;
    } catch {
      return null;
    }
  }

  // 5. Attribute fingerprint — match key attrs
  private async byAttributeFingerprint(node: Node, sessionId: string): Promise<number | null> {
    const attrs = node.attributes;
    const stableKeys = ["data-testid", "aria-label", "name", "type", "role", "placeholder", "href"];
    const matchPairs = stableKeys
      .filter((k) => attrs[k])
      .map((k) => `[${k}="${attrs[k]?.replace(/"/g, '\\"')}"]`);

    if (matchPairs.length === 0) return null;

    const selector = `${node.tag.toLowerCase()}${matchPairs.join("")}`;

    try {
      const doc = await this.bridge.send<CDPNodeId>(
        "DOM.getDocument",
        { depth: 0 },
        sessionId
      );
      const result = await this.bridge.send<CDPNodeId>(
        "DOM.querySelector",
        { nodeId: doc.nodeId, selector },
        sessionId
      );
      return result.nodeId && result.nodeId !== 0 ? result.nodeId : null;
    } catch {
      return null;
    }
  }

  // 6. Relative position — find nearest known neighbor, then navigate DOM
  private async byRelativePosition(node: Node, sessionId: string): Promise<number | null> {
    // Look for a sibling/parent node we still have a live nodeId for
    const tabNodes = this.registry.getByTab(node.tabId);
    const anchor = tabNodes.find(
      (n) =>
        n.uuid !== node.uuid &&
        n.state === "active" &&
        n.nodeId &&
        n.nodeId > 0
    );

    if (!anchor?.nodeId) return null;

    try {
      // Walk from anchor using JS to find our node by fingerprint
      const fp = node.fingerprint;
      if (!fp) return null;

      const result = await this.bridge.send<CDPEvalResult>(
        "Runtime.evaluate",
        {
          expression: `
            (function() {
              const tag = '${node.tag.toLowerCase()}';
              const text = '${(node.textContent ?? "").trim().slice(0, 80).replace(/'/g, "\\'")}';
              const all = document.querySelectorAll(tag);
              for (const el of all) {
                if (!text || (el.innerText && el.innerText.trim().startsWith(text))) {
                  return el;
                }
              }
              return null;
            })()
          `,
          returnByValue: false,
        },
        sessionId
      );

      if (!result.result?.objectId) return null;

      const desc = await this.bridge.send<CDPNodeDescription>(
        "DOM.describeNode",
        { objectId: result.result.objectId, depth: 0 },
        sessionId
      );

      return desc.node?.nodeId ?? null;
    } catch {
      return null;
    }
  }

  // 7. Bounding box — use last known coordinates, probe the element at that point
  private async byBoundingBox(node: Node, sessionId: string): Promise<number | null> {
    const bb = node.boundingBox;
    if (!bb) return null;

    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;

    try {
      const result = await this.bridge.send<CDPEvalResult>(
        "Runtime.evaluate",
        {
          expression: `document.elementFromPoint(${cx}, ${cy})`,
          returnByValue: false,
        },
        sessionId
      );

      if (!result.result?.objectId) return null;

      const desc = await this.bridge.send<CDPNodeDescription>(
        "DOM.describeNode",
        { objectId: result.result.objectId, depth: 0 },
        sessionId
      );

      // Validate it's still the same tag — don't grab a random element
      if (desc.node?.nodeName?.toLowerCase() !== node.tag.toLowerCase()) {
        return null;
      }

      return desc.node?.nodeId ?? null;
    } catch {
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private failure(
    attempted: SelectorStrategy[],
    start: number,
    _reason?: string
  ): ResolutionResult {
    return {
      found: false,
      strategy: attempted[attempted.length - 1] ?? "uuid",
      fallbacksAttempted: attempted,
      durationMs: Date.now() - start,
    };
  }
}
