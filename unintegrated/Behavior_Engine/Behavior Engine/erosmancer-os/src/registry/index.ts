// ============================================================
// ErosmancerOS — Node Registry
//
// Sovereign identity layer for every DOM node the OS touches.
// Nodes are born here, tracked here, and mourned here.
//
// Persistence: JSON snapshot to disk on every mutation.
// Fingerprint: sha256(tag + sorted attrs + trimmed text)
// Stale detection: nodes unseen beyond threshold → "stale"
// ============================================================

import { randomUUID, createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import EventEmitter from "eventemitter3";
import type { Node, OSConfig } from "../types/index.ts";
import { NodeSchema } from "../types/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

interface RegistryEvents {
  "node:registered": [node: Node];
  "node:updated": [node: Node];
  "node:stale": [uuid: string];
  "node:missing": [uuid: string];
  "node:evicted": [uuid: string];
}

export class NodeRegistry extends EventEmitter<RegistryEvents> {
  private readonly config: OSConfig["registry"];
  private readonly telemetry: Telemetry;

  // Primary store: uuid → Node
  private nodes = new Map<string, Node>();

  // Secondary indexes for fast lookup
  private byFingerprint = new Map<string, string>();          // fingerprint → uuid
  private bySelector = new Map<string, string>();             // selector → uuid
  private byTabAndBackendId = new Map<string, string>();      // `tabId:backendNodeId` → uuid

  private dirty = false;
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OSConfig["registry"], telemetry: Telemetry) {
    super();
    this.config = config;
    this.telemetry = telemetry;
    this.load();
    this.startPersistLoop();
  }

  // ─── Registration ─────────────────────────────────────────

  /**
   * Register a new node from raw CDP/DOM data.
   * Returns existing node if fingerprint matches — deduplication is law.
   */
  register(input: {
    tag: string;
    tabId: string;
    frameId?: string;
    nodeId?: number;
    backendNodeId?: number;
    selector?: string;
    xpath?: string;
    textContent?: string;
    attributes?: Record<string, string>;
    shadowHost?: boolean;
    inShadowRoot?: boolean;
    shadowHostUuid?: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }): Node {
    const fingerprint = this.computeFingerprint(
      input.tag,
      input.attributes ?? {},
      input.textContent ?? ""
    );

    // Dedup by fingerprint within same tab
    const fpKey = `${input.tabId}:${fingerprint}`;
    const existingUuid = this.byFingerprint.get(fpKey);
    if (existingUuid) {
      return this.touch(existingUuid, input);
    }

    // Dedup by backendNodeId (stable across navigations within a tab)
    if (input.backendNodeId) {
      const bKey = `${input.tabId}:${input.backendNodeId}`;
      const bUuid = this.byTabAndBackendId.get(bKey);
      if (bUuid) return this.touch(bUuid, input);
    }

    const now = new Date().toISOString();
    const uuid = randomUUID();

    const node = NodeSchema.parse({
      uuid,
      tag: input.tag,
      tabId: input.tabId,
      frameId: input.frameId,
      nodeId: input.nodeId,
      backendNodeId: input.backendNodeId,
      selector: input.selector,
      xpath: input.xpath,
      textContent: input.textContent,
      attributes: input.attributes ?? {},
      shadowHost: input.shadowHost ?? false,
      inShadowRoot: input.inShadowRoot ?? false,
      shadowHostUuid: input.shadowHostUuid,
      boundingBox: input.boundingBox,
      fingerprint,
      state: "active",
      firstSeen: now,
      lastSeen: now,
      seenCount: 1,
    });

    this.commit(node, fpKey);
    this.emit("node:registered", node);
    this.telemetry.info("registry", `Registered ${node.tag} [${uuid.slice(0, 8)}]`, {
      selector: node.selector,
      tabId: node.tabId,
    });

    return node;
  }

  // ─── Lookup ───────────────────────────────────────────────

  get(uuid: string): Node | undefined {
    return this.nodes.get(uuid);
  }

  getBySelector(selector: string): Node | undefined {
    const uuid = this.bySelector.get(selector);
    return uuid ? this.nodes.get(uuid) : undefined;
  }

  getByFingerprint(tabId: string, fingerprint: string): Node | undefined {
    const uuid = this.byFingerprint.get(`${tabId}:${fingerprint}`);
    return uuid ? this.nodes.get(uuid) : undefined;
  }

  getByBackendNodeId(tabId: string, backendNodeId: number): Node | undefined {
    const uuid = this.byTabAndBackendId.get(`${tabId}:${backendNodeId}`);
    return uuid ? this.nodes.get(uuid) : undefined;
  }

  getByTab(tabId: string): Node[] {
    return [...this.nodes.values()].filter((n) => n.tabId === tabId);
  }

  all(): Node[] {
    return [...this.nodes.values()];
  }

  size(): number {
    return this.nodes.size;
  }

  // ─── State Mutation ───────────────────────────────────────

  markMissing(uuid: string): void {
    const node = this.nodes.get(uuid);
    if (!node) return;
    const updated = { ...node, state: "missing" as const };
    this.nodes.set(uuid, updated);
    this.dirty = true;
    this.emit("node:missing", uuid);
    this.telemetry.warn("registry", `Node missing [${uuid.slice(0, 8)}]`, {
      tag: node.tag,
      selector: node.selector,
    });
  }

  markStale(uuid: string): void {
    const node = this.nodes.get(uuid);
    if (!node) return;
    const updated = { ...node, state: "stale" as const };
    this.nodes.set(uuid, updated);
    this.dirty = true;
    this.emit("node:stale", uuid);
  }

  updateBoundingBox(
    uuid: string,
    box: { x: number; y: number; width: number; height: number }
  ): void {
    const node = this.nodes.get(uuid);
    if (!node) return;
    this.nodes.set(uuid, { ...node, boundingBox: box, lastSeen: new Date().toISOString() });
    this.dirty = true;
  }

  updateNodeId(uuid: string, nodeId: number): void {
    const node = this.nodes.get(uuid);
    if (!node) return;
    this.nodes.set(uuid, { ...node, nodeId, lastSeen: new Date().toISOString() });
    this.dirty = true;
  }

  // ─── Stale Sweep ──────────────────────────────────────────

  /**
   * Mark nodes unseen beyond threshold as stale.
   * Call this periodically or after DOM mutations.
   */
  sweepStale(): void {
    const cutoff = Date.now() - this.config.staleThresholdMs;
    let swept = 0;
    for (const node of this.nodes.values()) {
      if (node.state !== "active") continue;
      if (new Date(node.lastSeen).getTime() < cutoff) {
        this.markStale(node.uuid);
        swept++;
      }
    }
    if (swept > 0) {
      this.telemetry.info("registry", `Stale sweep: ${swept} nodes marked stale`);
    }
  }

  /**
   * Evict stale/missing nodes for a specific tab when it closes or reloads.
   */
  evictTab(tabId: string): void {
    let evicted = 0;
    for (const node of this.nodes.values()) {
      if (node.tabId !== tabId) continue;
      this.nodes.delete(node.uuid);
      if (node.fingerprint) this.byFingerprint.delete(`${tabId}:${node.fingerprint}`);
      if (node.selector) this.bySelector.delete(node.selector);
      if (node.backendNodeId) this.byTabAndBackendId.delete(`${tabId}:${node.backendNodeId}`);
      this.emit("node:evicted", node.uuid);
      evicted++;
    }
    this.dirty = true;
    this.telemetry.info("registry", `Evicted ${evicted} nodes for tab ${tabId}`);
  }

  // ─── Fingerprinting ───────────────────────────────────────

  /**
   * Deterministic fingerprint of a node's identity.
   * Stable across re-queries as long as tag + attrs + text don't change.
   */
  static computeFingerprint(
    tag: string,
    attributes: Record<string, string>,
    textContent: string
  ): string {
    const attrStr = Object.entries(attributes)
      .filter(([k]) => !["class", "style", "id"].includes(k)) // exclude volatile attrs
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("|");

    const raw = `${tag}::${attrStr}::${textContent.trim().slice(0, 100)}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }

  // ─── Persistence ──────────────────────────────────────────

  private load(): void {
    const path = this.config.persistPath;
    if (!path) return;

    if (!existsSync(path)) {
      this.telemetry.info("registry", "No existing registry snapshot — starting fresh");
      return;
    }

    try {
      const raw = readFileSync(path, "utf8");
      const data = JSON.parse(raw) as { nodes: Node[] };

      for (const node of data.nodes) {
        const parsed = NodeSchema.safeParse(node);
        if (!parsed.success) continue;
        this.commitParsed(parsed.data);
      }

      this.telemetry.info("registry", `Loaded ${this.nodes.size} nodes from snapshot`);
    } catch (err) {
      this.telemetry.error("registry", "Failed to load snapshot", { err });
    }
  }

  private persist(): void {
    const path = this.config.persistPath;
    if (!path || !this.dirty) return;

    try {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const data = { nodes: [...this.nodes.values()], savedAt: new Date().toISOString() };
      writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
      this.dirty = false;
      this.telemetry.debug("registry", `Persisted ${this.nodes.size} nodes`);
    } catch (err) {
      this.telemetry.error("registry", "Persist failed", { err });
    }
  }

  private startPersistLoop(): void {
    // Persist every 5 seconds if dirty
    this.persistTimer = setInterval(() => this.persist(), 5000);
  }

  destroy(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    this.persist(); // final flush
  }

  // ─── Private Helpers ──────────────────────────────────────

  private computeFingerprint(
    tag: string,
    attributes: Record<string, string>,
    textContent: string
  ): string {
    return NodeRegistry.computeFingerprint(tag, attributes, textContent);
  }

  private touch(
    uuid: string,
    input: Partial<Parameters<NodeRegistry["register"]>[0]>
  ): Node {
    const node = this.nodes.get(uuid)!;
    const updated: Node = {
      ...node,
      nodeId: input.nodeId ?? node.nodeId,
      backendNodeId: input.backendNodeId ?? node.backendNodeId,
      boundingBox: input.boundingBox ?? node.boundingBox,
      state: "active",
      lastSeen: new Date().toISOString(),
      seenCount: node.seenCount + 1,
    };
    this.nodes.set(uuid, updated);
    this.dirty = true;
    this.emit("node:updated", updated);
    return updated;
  }

  private commit(node: Node, fpKey: string): void {
    // Evict if over max
    if (this.nodes.size >= this.config.maxNodes) {
      this.evictOldest();
    }

    this.nodes.set(node.uuid, node);
    this.byFingerprint.set(fpKey, node.uuid);
    if (node.selector) this.bySelector.set(node.selector, node.uuid);
    if (node.backendNodeId) {
      this.byTabAndBackendId.set(`${node.tabId}:${node.backendNodeId}`, node.uuid);
    }
    this.dirty = true;
  }

  private commitParsed(node: Node): void {
    this.nodes.set(node.uuid, node);
    if (node.fingerprint) {
      this.byFingerprint.set(`${node.tabId}:${node.fingerprint}`, node.uuid);
    }
    if (node.selector) this.bySelector.set(node.selector, node.uuid);
    if (node.backendNodeId) {
      this.byTabAndBackendId.set(`${node.tabId}:${node.backendNodeId}`, node.uuid);
    }
  }

  private evictOldest(): void {
    let oldest: Node | null = null;
    for (const node of this.nodes.values()) {
      if (!oldest || new Date(node.lastSeen) < new Date(oldest.lastSeen)) {
        oldest = node;
      }
    }
    if (!oldest) return;
    this.nodes.delete(oldest.uuid);
    if (oldest.fingerprint) this.byFingerprint.delete(`${oldest.tabId}:${oldest.fingerprint}`);
    if (oldest.selector) this.bySelector.delete(oldest.selector);
    if (oldest.backendNodeId) {
      this.byTabAndBackendId.delete(`${oldest.tabId}:${oldest.backendNodeId}`);
    }
    this.emit("node:evicted", oldest.uuid);
    this.telemetry.warn("registry", `Evicted oldest node to stay under maxNodes`, {
      uuid: oldest.uuid,
    });
  }
}
