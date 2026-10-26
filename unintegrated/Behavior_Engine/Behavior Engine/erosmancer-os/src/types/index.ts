// ============================================================
// ErosmancerOS — Core Types
// Single source of truth. Every module imports from here.
// ============================================================

import { z } from "zod";

// ----------------------------------------------------------
// Node Identity
// ----------------------------------------------------------

export const NodeSchema = z.object({
  uuid: z.string().uuid(),
  tag: z.string(),
  tabId: z.string(),
  frameId: z.string().optional(),
  nodeId: z.number().optional(),       // CDP nodeId (ephemeral)
  backendNodeId: z.number().optional(), // CDP backendNodeId (stable across nav)
  selector: z.string().optional(),
  xpath: z.string().optional(),
  textContent: z.string().optional(),
  attributes: z.record(z.string()).default({}),
  shadowHost: z.boolean().default(false),
  inShadowRoot: z.boolean().default(false),
  shadowHostUuid: z.string().uuid().optional(),
  boundingBox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  fingerprint: z.string().optional(),    // sha256(tag+attrs+text)
  state: z.enum(["active", "stale", "missing", "pending"]).default("active"),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  seenCount: z.number().default(1),
});

export type Node = z.infer<typeof NodeSchema>;

// ----------------------------------------------------------
// Tab Identity
// ----------------------------------------------------------

export const TabSchema = z.object({
  tabId: z.string(),
  targetId: z.string(),           // CDP targetId
  url: z.string(),
  title: z.string().optional(),
  role: z.enum(["primary", "shadow", "proxy"]).default("primary"),
  state: z.enum(["active", "loading", "crashed", "closed"]).default("active"),
  wsUrl: z.string(),              // CDP WebSocket URL for this tab
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
});

export type Tab = z.infer<typeof TabSchema>;

// ----------------------------------------------------------
// Bridge Connection
// ----------------------------------------------------------

export type BridgeTarget =
  | { type: "local"; port: number; host?: string }
  | { type: "remote"; wsUrl: string; apiKey?: string };

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

// ----------------------------------------------------------
// CDP Protocol
// ----------------------------------------------------------

export interface CDPMessage {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
  sessionId?: string;
}

export interface CDPEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

// ----------------------------------------------------------
// Commands (what the OS dispatches)
// ----------------------------------------------------------

export type CommandType =
  | "click"
  | "type"
  | "hover"
  | "scroll"
  | "evaluate"
  | "screenshot"
  | "navigate"
  | "waitForSelector"
  | "getAttribute"
  | "getProperty";

export interface Command {
  id: string;
  type: CommandType;
  targetUuid?: string;    // node uuid
  tabId: string;
  payload?: Record<string, unknown>;
  priority: number;       // 0 = highest
  createdAt: number;
  timeout?: number;       // ms
  retryCount: number;
  maxRetries: number;
}

export interface CommandResult {
  commandId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  attempt: number;
}

// ----------------------------------------------------------
// Selector Resolution
// ----------------------------------------------------------

export type SelectorStrategy =
  | "uuid"
  | "cssSelector"
  | "xpath"
  | "textMatch"
  | "attributeFingerprint"
  | "relativePosition"
  | "boundingBox";

export interface ResolutionResult {
  found: boolean;
  strategy: SelectorStrategy;
  nodeId?: number;
  backendNodeId?: number;
  fallbacksAttempted: SelectorStrategy[];
  durationMs: number;
}

// ----------------------------------------------------------
// Telemetry
// ----------------------------------------------------------

export interface TelemetryEvent {
  id: string;
  ts: number;
  category: "bridge" | "registry" | "selector" | "dispatcher" | "system";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
  tabId?: string;
  nodeUuid?: string;
  commandId?: string;
}

// ----------------------------------------------------------
// System Config
// ----------------------------------------------------------

export interface OSConfig {
  bridge: {
    target: BridgeTarget;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
    commandTimeoutMs: number;
    pingIntervalMs: number;
  };
  registry: {
    staleThresholdMs: number;
    maxNodes: number;
    persistPath?: string;          // file path for node registry persistence
  };
  selector: {
    fallbackChain: SelectorStrategy[];
    timeoutMs: number;
  };
  dispatcher: {
    maxQueueSize: number;
    defaultMaxRetries: number;
    retryDelayMs: number;
  };
  telemetry: {
    persistPath?: string;
    maxEvents: number;
    flushIntervalMs: number;
  };
}

// ----------------------------------------------------------
// Behavior Engine
// ----------------------------------------------------------

export type BehaviorProfileName = "precise" | "cautious" | "exploratory" | "turbo";

export type MovementStyle = "direct" | "curved" | "noisy";

export type ExecutionVariant =
  | "direct"
  | "hover"
  | "stepwise"
  | "miss"
  | "scroll";

export interface BehaviorProfile {
  name: BehaviorProfileName;
  baseDelayMu: number;        // normal dist mean (ms)
  baseDelaySigma: number;     // normal dist std dev
  hesitationRate: number;     // 0-1: prob of pause before action
  correctionRate: number;     // 0-1: prob of miss+correct on click
  hoverProbability: number;   // 0-1: prob of hover before click
  movementStyle: MovementStyle;
  variantWeights: Partial<Record<ExecutionVariant, number>>;
}

export interface ExecutionStep {
  type:
    | "move"
    | "hover"
    | "click"
    | "keypress"
    | "delay"
    | "scroll"
    | "evaluate";
  // move
  x?: number;
  y?: number;
  path?: Array<{ x: number; y: number }>;
  // click
  button?: "left" | "right";
  miss?: boolean;
  // keypress
  char?: string;
  // delay/hover
  duration?: number;
  // scroll
  deltaX?: number;
  deltaY?: number;
  // evaluate
  expression?: string;
}

export interface TimingModel {
  nextDelay(stepIndex: number, fatigue: number): number;
}

export interface VarianceConfig {
  temporal: number;  // 0-1
  spatial: number;   // 0-1
  decision: number;  // 0-1
}

export interface ExecutionPlan {
  planId: string;
  intentId: string;
  profile: BehaviorProfileName;
  variant: ExecutionVariant;
  steps: ExecutionStep[];
  timing: TimingModel;
  variance: VarianceConfig;
  sandbox: boolean;
  meta: {
    confidence: number;
    sessionFatigue: number;
    errorRate: number;
  };
}

export interface BehaviorIntent {
  id: string;
  action: "click" | "type" | "scroll" | "hover" | "evaluate";
  target: {
    uuid?: string;
    nodeId?: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  };
  payload?: string | Record<string, unknown> | null;
}

export interface BehaviorContext {
  sessionId: string;
  environment: {
    detectionRisk: number;   // 0-1
    latency: number;         // ms
    stabilityScore: number;  // 0-1, higher = more stable
  };
}

export interface SessionSnapshot {
  sessionId: string;
  actionCount: number;
  elapsedSec: number;
  fatigue: number;
  errorRate: number;
  lastProfile: BehaviorProfileName;
}

// ----------------------------------------------------------
// Routing Engine
// ----------------------------------------------------------

export type RouteLevel = "direct" | "parallel" | "redundant";

export interface RouteTarget {
  tabId: string;
  sessionId: string;
  role: "primary" | "shadow" | "proxy";
  priority: number;
}

export interface RoutingDecision {
  level: RouteLevel;
  primary: RouteTarget;
  secondary?: RouteTarget;
  reason: string;
}

export interface RouteResult {
  success: boolean;
  level: RouteLevel;
  primary?: unknown;
  secondary?: unknown;
  mismatch?: boolean;
  durationMs: number;
}

// ----------------------------------------------------------
// Mutation Observer
// ----------------------------------------------------------

export interface DOMChange {
  type: "childList" | "attributes" | "characterData" | "subtreeModified";
  targetNodeId?: number;
  targetUuid?: string;
  tabId: string;
  sessionId: string;
  timestamp: number;
  addedNodes?: number[];    // CDP nodeIds
  removedNodes?: number[];  // CDP nodeIds
  attributeName?: string;
  attributeValue?: string;
}

// ----------------------------------------------------------
// System Config (extended)
// ----------------------------------------------------------

export interface OSConfig {
  bridge: {
    target: BridgeTarget;
    reconnectDelayMs: number;
    maxReconnectAttempts: number;
    commandTimeoutMs: number;
    pingIntervalMs: number;
  };
  registry: {
    staleThresholdMs: number;
    maxNodes: number;
    persistPath?: string;
  };
  selector: {
    fallbackChain: SelectorStrategy[];
    timeoutMs: number;
  };
  dispatcher: {
    maxQueueSize: number;
    defaultMaxRetries: number;
    retryDelayMs: number;
  };
  telemetry: {
    persistPath?: string;
    maxEvents: number;
    flushIntervalMs: number;
  };
  behavior: {
    defaultProfile: BehaviorProfileName;
    sandboxByDefault: boolean;
    maxSessionAgeMs: number;
  };
  routing: {
    defaultLevel: RouteLevel;
    mismatchThreshold: number;   // 0-1: how different results must be to flag
    shadowTabEnabled: boolean;
  };
  observer: {
    enabled: boolean;
    debounceMs: number;
    watchSubtree: boolean;
  };
}

export const DEFAULT_CONFIG: OSConfig = {
  bridge: {
    target: { type: "local", port: 9222, host: "localhost" },
    reconnectDelayMs: 1000,
    maxReconnectAttempts: 10,
    commandTimeoutMs: 30000,
    pingIntervalMs: 5000,
  },
  registry: {
    staleThresholdMs: 30000,
    maxNodes: 10000,
    persistPath: "./.erosmancer/registry.json",
  },
  selector: {
    fallbackChain: [
      "uuid",
      "cssSelector",
      "xpath",
      "textMatch",
      "attributeFingerprint",
      "relativePosition",
      "boundingBox",
    ],
    timeoutMs: 5000,
  },
  dispatcher: {
    maxQueueSize: 1000,
    defaultMaxRetries: 3,
    retryDelayMs: 500,
  },
  telemetry: {
    persistPath: "./.erosmancer/telemetry.jsonl",
    maxEvents: 50000,
    flushIntervalMs: 2000,
  },
};

// Appended defaults for new modules
// NOTE: Merged into DEFAULT_CONFIG above during build
export const BEHAVIOR_DEFAULTS = {
  behavior: {
    defaultProfile: "precise" as BehaviorProfileName,
    sandboxByDefault: false,
    maxSessionAgeMs: 30 * 60 * 1_000,
  },
  routing: {
    defaultLevel: "direct" as RouteLevel,
    mismatchThreshold: 0.3,
    shadowTabEnabled: false,
  },
  observer: {
    enabled: true,
    debounceMs: 100,
    watchSubtree: true,
  },
};
