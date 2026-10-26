// ============================================================
// ErosmancerOS — DOM Observer
//
// Two responsibilities:
//
// 1. MutationObserver — watches CDP DOM events (childList,
//    attributes, characterData). Debounces rapid changes.
//    Emits DOMChange events. Marks affected registered nodes
//    as stale so the selector engine re-resolves them.
//
// 2. ShadowDOMMapper — traverses shadow roots recursively
//    via CDP. Registers shadow host + pierced children into
//    the NodeRegistry. Required for Web Components.
// ============================================================

import EventEmitter from "eventemitter3";
import type { BridgeCore } from "../bridge/index.ts";
import type { NodeRegistry } from "../registry/index.ts";
import type { Telemetry } from "../telemetry/index.ts";
import type { DOMChange, OSConfig, CDPEvent } from "../types/index.ts";

// ─── DOM Mutation Observer ────────────────────────────────────

interface ObserverEvents {
  "dom:changed": [change: DOMChange];
  "dom:batch":   [changes: DOMChange[]];
}

export class DOMObserver extends EventEmitter<ObserverEvents> {
  private readonly config:    OSConfig["observer"];
  private readonly bridge:    BridgeCore;
  private readonly registry:  NodeRegistry;
  private readonly telemetry: Telemetry;

  // tabId:sessionId → debounce timer
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // tabId:sessionId → pending batch
  private pending        = new Map<string, DOMChange[]>();

  private watchedTabs    = new Set<string>();   // tabIds

  constructor(
    config:    OSConfig["observer"],
    bridge:    BridgeCore,
    registry:  NodeRegistry,
    telemetry: Telemetry
  ) {
    super();
    this.config    = config;
    this.bridge    = bridge;
    this.registry  = registry;
    this.telemetry = telemetry;

    if (config.enabled) {
      this.attachBridgeListener();
    }
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Start watching DOM mutations for a tab.
   * Enables the DOM domain (required for mutation events).
   */
  async watchTab(tabId: string, sessionId: string): Promise<void> {
    if (this.watchedTabs.has(tabId)) return;

    // Enable DOM domain so CDP fires mutation events
    await this.bridge.send("DOM.enable", {}, sessionId);

    this.watchedTabs.add(tabId);
    this.telemetry.info("system", `DOMObserver watching tab ${tabId}`);
  }

  /**
   * Stop watching a tab and clean up.
   */
  async unwatchTab(tabId: string, sessionId: string): Promise<void> {
    this.watchedTabs.delete(tabId);
    this.clearDebounce(`${tabId}:${sessionId}`);
    this.pending.delete(`${tabId}:${sessionId}`);

    try {
      await this.bridge.send("DOM.disable", {}, sessionId);
    } catch {
      // Tab may already be closed
    }
  }

  // ─── Bridge Event Listener ─────────────────────────────────

  private attachBridgeListener(): void {
    this.bridge.on("event", (event: CDPEvent) => {
      // CDP DOM mutation events arrive as method strings
      this.routeCDPEvent(event);
    });
  }

  private routeCDPEvent(event: CDPEvent): void {
    const { method, params, sessionId } = event;

    switch (method) {
      case "DOM.setChildNodes":
      case "DOM.childNodeInserted":
        this.handleChildChange(params, sessionId, "childList");
        break;

      case "DOM.childNodeRemoved":
        this.handleChildChange(params, sessionId, "childList");
        break;

      case "DOM.attributeModified":
      case "DOM.attributeRemoved":
        this.handleAttributeChange(params, sessionId);
        break;

      case "DOM.characterDataModified":
        this.handleDataChange(params, sessionId);
        break;

      case "DOM.documentUpdated":
        // Full reload — invalidate everything for this session's tab
        this.handleDocumentUpdate(sessionId);
        break;
    }
  }

  // ─── Change Handlers ───────────────────────────────────────

  private handleChildChange(
    params:    Record<string, unknown>,
    sessionId: string | undefined,
    type:      DOMChange["type"]
  ): void {
    const tabId = this.sessionToTab(sessionId);
    if (!tabId) return;

    const parentNodeId = params.parentNodeId as number | undefined;
    const addedNode    = params.node    as { nodeId: number } | undefined;
    const removedId    = params.nodeId  as number | undefined;

    const change: DOMChange = {
      type,
      targetNodeId: parentNodeId,
      tabId,
      sessionId: sessionId ?? "",
      timestamp:  Date.now(),
      addedNodes:   addedNode  ? [addedNode.nodeId] : undefined,
      removedNodes: removedId  ? [removedId]        : undefined,
    };

    // Correlate to registered UUID
    if (parentNodeId) {
      const nodes = this.registry.getByTab(tabId);
      const match = nodes.find((n) => n.nodeId === parentNodeId);
      if (match) {
        change.targetUuid = match.uuid;
        // Children of a node changed — mark it stale
        this.registry.markStale(match.uuid);
      }
    }

    this.queueChange(tabId, sessionId ?? "", change);
  }

  private handleAttributeChange(
    params:    Record<string, unknown>,
    sessionId: string | undefined
  ): void {
    const tabId  = this.sessionToTab(sessionId);
    if (!tabId) return;

    const nodeId = params.nodeId       as number | undefined;
    const attrName  = params.name      as string | undefined;
    const attrValue = params.value     as string | undefined;

    const change: DOMChange = {
      type:           "attributes",
      targetNodeId:   nodeId,
      tabId,
      sessionId:      sessionId ?? "",
      timestamp:      Date.now(),
      attributeName:  attrName,
      attributeValue: attrValue,
    };

    if (nodeId) {
      const nodes = this.registry.getByTab(tabId);
      const match = nodes.find((n) => n.nodeId === nodeId);
      if (match) {
        change.targetUuid = match.uuid;
        this.registry.markStale(match.uuid);
      }
    }

    this.queueChange(tabId, sessionId ?? "", change);
  }

  private handleDataChange(
    params:    Record<string, unknown>,
    sessionId: string | undefined
  ): void {
    const tabId = this.sessionToTab(sessionId);
    if (!tabId) return;

    const change: DOMChange = {
      type:         "characterData",
      targetNodeId: params.nodeId as number | undefined,
      tabId,
      sessionId:    sessionId ?? "",
      timestamp:    Date.now(),
    };

    this.queueChange(tabId, sessionId ?? "", change);
  }

  private handleDocumentUpdate(sessionId: string | undefined): void {
    const tabId = this.sessionToTab(sessionId);
    if (!tabId) return;

    this.telemetry.warn("system", `Full document update on tab ${tabId} — invalidating all nodes`);
    this.registry.evictTab(tabId);

    const change: DOMChange = {
      type:      "subtreeModified",
      tabId,
      sessionId: sessionId ?? "",
      timestamp: Date.now(),
    };
    this.emit("dom:changed", change);
  }

  // ─── Debounce / Batching ───────────────────────────────────

  private queueChange(tabId: string, sessionId: string, change: DOMChange): void {
    const key = `${tabId}:${sessionId}`;

    if (!this.pending.has(key)) this.pending.set(key, []);
    this.pending.get(key)!.push(change);

    // Emit individual immediately
    this.emit("dom:changed", change);

    // Debounce batch emit
    this.clearDebounce(key);
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        const batch = this.pending.get(key) ?? [];
        this.pending.delete(key);
        if (batch.length > 1) {
          this.emit("dom:batch", batch);
          this.telemetry.debug("system", `DOM batch: ${batch.length} changes on tab ${tabId}`);
        }
      }, this.config.debounceMs)
    );
  }

  private clearDebounce(key: string): void {
    const t = this.debounceTimers.get(key);
    if (t) { clearTimeout(t); this.debounceTimers.delete(key); }
  }

  // CDP sessionId → tabId reverse lookup
  private sessionToTab(sessionId: string | undefined): string | null {
    if (!sessionId) return null;
    // Bridge maintains sessionId → targetId mapping
    // We iterate watched tabs and match via bridge
    for (const tabId of this.watchedTabs) {
      const s = this.bridge.getSession(tabId);
      if (s === sessionId) return tabId;
    }
    return null;
  }
}

// ─── Shadow DOM Mapper ────────────────────────────────────────

interface ShadowNode {
  uuid:       string;
  nodeId:     number;
  tabId:      string;
  isHost:     boolean;
  children:   ShadowNode[];
}

export class ShadowDOMMapper {
  private readonly bridge:    BridgeCore;
  private readonly registry:  NodeRegistry;
  private readonly telemetry: Telemetry;

  constructor(bridge: BridgeCore, registry: NodeRegistry, telemetry: Telemetry) {
    this.bridge    = bridge;
    this.registry  = registry;
    this.telemetry = telemetry;
  }

  /**
   * Recursively pierce all shadow roots in a tab, starting from the document root.
   * Registers each shadow host and its pierced children into the NodeRegistry.
   *
   * @returns  number of shadow nodes discovered
   */
  async mapTab(tabId: string, sessionId: string): Promise<number> {
    let discovered = 0;

    try {
      // Get full document with shadow roots
      const docResult = await this.bridge.send<{ root: { nodeId: number } }>(
        "DOM.getDocument",
        { depth: -1, pierce: true },  // pierce=true crosses shadow boundaries
        sessionId
      );

      const rootNodeId = docResult.root?.nodeId;
      if (!rootNodeId) return 0;

      // Perform a search for all elements that have shadow roots
      const searchResult = await this.bridge.send<{
        searchId: string;
        resultCount: number;
      }>(
        "DOM.performSearch",
        { query: "*", includeUserAgentShadowDOM: false },
        sessionId
      );

      if (!searchResult.searchId || searchResult.resultCount === 0) return 0;

      // Walk all found nodes, identify shadow hosts
      const MAX_NODES = 500;
      const count     = Math.min(searchResult.resultCount, MAX_NODES);
      const results   = await this.bridge.send<{ nodeIds: number[] }>(
        "DOM.getSearchResults",
        { searchId: searchResult.searchId, fromIndex: 0, toIndex: count },
        sessionId
      );

      await this.bridge.send(
        "DOM.discardSearchResults",
        { searchId: searchResult.searchId },
        sessionId
      );

      // For each node, check if it has a shadow root
      for (const nodeId of results.nodeIds ?? []) {
        try {
          const desc = await this.bridge.send<{
            node: {
              nodeId: number;
              nodeName: string;
              localName: string;
              attributes?: string[];
              shadowRoots?: Array<{
                nodeId: number;
                shadowRootType: string;
              }>;
              backendNodeId: number;
            };
          }>(
            "DOM.describeNode",
            { nodeId, depth: 1, pierce: true },
            sessionId
          );

          const node = desc.node;
          if (!node?.shadowRoots?.length) continue;

          // This is a shadow host
          const attrMap: Record<string, string> = {};
          const rawAttrs = node.attributes ?? [];
          for (let i = 0; i + 1 < rawAttrs.length; i += 2) {
            attrMap[rawAttrs[i]] = rawAttrs[i + 1];
          }

          const hostUuid = this.registry.register({
            tag:          node.localName ?? node.nodeName?.toLowerCase() ?? "unknown",
            tabId,
            nodeId:       node.nodeId,
            backendNodeId: node.backendNodeId,
            attributes:   attrMap,
            shadowHost:   true,
          }).uuid;

          discovered++;

          // Recurse into shadow root children
          for (const shadowRoot of node.shadowRoots) {
            discovered += await this.mapShadowRoot(
              shadowRoot.nodeId,
              tabId,
              sessionId,
              hostUuid
            );
          }

        } catch {
          // Individual node may fail — keep going
        }
      }

      this.telemetry.info(
        "system",
        `Shadow DOM map: ${discovered} shadow nodes in tab ${tabId}`
      );

    } catch (err) {
      this.telemetry.error("system", "Shadow DOM map failed", { err });
    }

    return discovered;
  }

  /**
   * Map children of a specific shadow root node.
   */
  private async mapShadowRoot(
    shadowRootNodeId: number,
    tabId:            string,
    sessionId:        string,
    hostUuid:         string
  ): Promise<number> {
    let count = 0;

    try {
      const desc = await this.bridge.send<{
        node: {
          children?: Array<{
            nodeId:      number;
            backendNodeId: number;
            localName:   string;
            nodeName:    string;
            attributes?: string[];
          }>;
        };
      }>(
        "DOM.describeNode",
        { nodeId: shadowRootNodeId, depth: 2, pierce: true },
        sessionId
      );

      for (const child of desc.node?.children ?? []) {
        if (!child.localName) continue;  // skip text nodes, etc.

        const attrMap: Record<string, string> = {};
        const rawAttrs = child.attributes ?? [];
        for (let i = 0; i + 1 < rawAttrs.length; i += 2) {
          attrMap[rawAttrs[i]] = rawAttrs[i + 1];
        }

        this.registry.register({
          tag:           child.localName ?? child.nodeName?.toLowerCase() ?? "unknown",
          tabId,
          nodeId:        child.nodeId,
          backendNodeId: child.backendNodeId,
          attributes:    attrMap,
          inShadowRoot:  true,
          shadowHostUuid: hostUuid,
        });

        count++;
      }
    } catch {
      // Silently continue
    }

    return count;
  }
}
