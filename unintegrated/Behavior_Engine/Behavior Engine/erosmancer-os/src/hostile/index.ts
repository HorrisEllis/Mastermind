// ============================================================
// ErosmancerOS — Hostile Detection
//
// Watches CDP events, HTTP responses, and page-level signals
// for bot traps and anti-automation defenses. Scores the
// current threat level and emits actionable signals.
//
// Detects:
//   - Cloudflare (challenge pages, JS challenges, Turnstile)
//   - Generic CAPTCHA (reCAPTCHA, hCaptcha, custom)
//   - Honeypot traps (hidden form fields with content)
//   - Rate limiting (429, rapid redirect chains)
//   - Browser fingerprinting scripts (common libraries)
//   - CDP detection scripts (automation flags)
//
// Response:
//   - Emits threat:detected event with level + type
//   - Recommends routing escalation (direct → redundant)
//   - Recommends behavior profile (precise → exploratory)
//   - Does NOT take autonomous action — routes signals up
// ============================================================

import EventEmitter from "eventemitter3";
import type { BridgeCore } from "../bridge/index.ts";
import type { Telemetry }  from "../telemetry/index.ts";
import type { CDPEvent }   from "../types/index.ts";

// ─── Types ───────────────────────────────────────────────────

export type ThreatLevel = "none" | "low" | "medium" | "high" | "critical";

export type ThreatType =
  | "cloudflare-challenge"
  | "cloudflare-turnstile"
  | "recaptcha"
  | "hcaptcha"
  | "custom-captcha"
  | "honeypot"
  | "rate-limit"
  | "fingerprint-script"
  | "cdp-detection"
  | "redirect-chain"
  | "unknown-hostile";

export interface ThreatSignal {
  id:         string;
  ts:         number;
  type:       ThreatType;
  level:      ThreatLevel;
  tabId:      string;
  evidence:   string;
  raw?:       unknown;
}

export interface ThreatState {
  level:             ThreatLevel;
  activeSignals:     ThreatSignal[];
  score:             number;         // 0-100
  recommendProfile:  "precise" | "cautious" | "exploratory";
  recommendRoute:    "direct" | "parallel" | "redundant";
  lastUpdated:       number;
}

interface HostileDetectionEvents {
  "threat:detected":  [signal: ThreatSignal, state: ThreatState];
  "threat:cleared":   [tabId: string];
  "threat:escalated": [tabId: string, from: ThreatLevel, to: ThreatLevel];
}

// ─── Threat Signatures ───────────────────────────────────────

const THREAT_PATTERNS: Array<{
  type:     ThreatType;
  level:    ThreatLevel;
  score:    number;
  match:    (data: ThreatInput) => boolean;
}> = [
  // Cloudflare challenge page
  {
    type:  "cloudflare-challenge",
    level: "high",
    score: 70,
    match: ({ url, title, html }) =>
      /challenge\.cloudflare\.com/.test(url ?? "") ||
      /cf-browser-verification/i.test(html ?? "") ||
      /checking your browser/i.test(title ?? "") ||
      /cloudflare.*challenge/i.test(html ?? ""),
  },

  // Cloudflare Turnstile widget
  {
    type:  "cloudflare-turnstile",
    level: "high",
    score: 65,
    match: ({ html, scripts }) =>
      /challenges\.cloudflare\.com\/turnstile/.test(html ?? "") ||
      (scripts ?? []).some((s) => /turnstile/.test(s)),
  },

  // reCAPTCHA
  {
    type:  "recaptcha",
    level: "medium",
    score: 55,
    match: ({ html, scripts }) =>
      /recaptcha\.net|google\.com\/recaptcha/i.test(html ?? "") ||
      (scripts ?? []).some((s) => /recaptcha/i.test(s)),
  },

  // hCaptcha
  {
    type:  "hcaptcha",
    level: "medium",
    score: 50,
    match: ({ html, scripts }) =>
      /hcaptcha\.com/i.test(html ?? "") ||
      (scripts ?? []).some((s) => /hcaptcha/i.test(s)),
  },

  // Rate limiting
  {
    type:  "rate-limit",
    level: "medium",
    score: 45,
    match: ({ statusCode, title }) =>
      statusCode === 429 ||
      /too many requests/i.test(title ?? ""),
  },

  // Browser fingerprinting libraries
  {
    type:  "fingerprint-script",
    level: "low",
    score: 25,
    match: ({ scripts }) =>
      (scripts ?? []).some((s) =>
        /fp2\.js|fingerprintjs|datadome|px\.gif|perimeterx|distil|botd/i.test(s)
      ),
  },

  // CDP / webdriver detection scripts
  {
    type:  "cdp-detection",
    level: "low",
    score: 20,
    match: ({ html }) =>
      /navigator\.webdriver|__selenium|__webdriver|_phantom/i.test(html ?? ""),
  },

  // Redirect chain (>3 redirects = suspicious)
  {
    type:  "redirect-chain",
    level: "low",
    score: 15,
    match: ({ redirectCount }) => (redirectCount ?? 0) > 3,
  },

  // Honeypot: hidden inputs with names that suggest traps
  {
    type:  "honeypot",
    level: "medium",
    score: 40,
    match: ({ html }) =>
      /<input[^>]+style="[^"]*display:\s*none[^"]*"[^>]+name="(email|phone|address|website|url)"/i.test(
        html ?? ""
      ),
  },
];

interface ThreatInput {
  url?:          string;
  title?:        string;
  html?:         string;
  scripts?:      string[];
  statusCode?:   number;
  redirectCount?: number;
}

// ─── HostileDetection ─────────────────────────────────────────

const SIGNAL_TTL_MS = 5 * 60 * 1_000;  // signals expire after 5 min

export class HostileDetection extends EventEmitter<HostileDetectionEvents> {
  private readonly bridge:    BridgeCore;
  private readonly telemetry: Telemetry;

  // tabId → threat state
  private states = new Map<string, ThreatState>();

  // tabId → signals ring buffer
  private signals = new Map<string, ThreatSignal[]>();

  constructor(bridge: BridgeCore, telemetry: Telemetry) {
    super();
    this.bridge    = bridge;
    this.telemetry = telemetry;
    this.attachBridgeListener();
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Actively probe a tab for hostile signals.
   * Evaluates JS in page to check for known detection artifacts.
   */
  async probe(tabId: string, sessionId: string): Promise<ThreatState> {
    try {
      // Get page metadata
      const [urlResult, titleResult, htmlResult, scriptsResult] =
        await Promise.allSettled([
          this.bridge.send<{ result: { value?: string } }>(
            "Runtime.evaluate",
            { expression: "location.href", returnByValue: true },
            sessionId
          ),
          this.bridge.send<{ result: { value?: string } }>(
            "Runtime.evaluate",
            { expression: "document.title", returnByValue: true },
            sessionId
          ),
          this.bridge.send<{ result: { value?: string } }>(
            "Runtime.evaluate",
            {
              expression:    "document.documentElement.outerHTML.slice(0, 8000)",
              returnByValue: true,
            },
            sessionId
          ),
          this.bridge.send<{ result: { value?: string } }>(
            "Runtime.evaluate",
            {
              expression:    "Array.from(document.scripts).map(s=>s.src).filter(Boolean).join('|')",
              returnByValue: true,
            },
            sessionId
          ),
        ]);

      const url     = urlResult.status     === "fulfilled" ? urlResult.value.result?.value     : undefined;
      const title   = titleResult.status   === "fulfilled" ? titleResult.value.result?.value   : undefined;
      const html    = htmlResult.status    === "fulfilled" ? htmlResult.value.result?.value    : undefined;
      const scripts = scriptsResult.status === "fulfilled"
        ? (scriptsResult.value.result?.value ?? "").split("|").filter(Boolean)
        : [];

      const input: ThreatInput = { url, title, html, scripts };

      this.evaluate(tabId, input);
    } catch (err) {
      this.telemetry.warn("system", `HostileDetection probe failed on ${tabId}`, { err });
    }

    return this.getState(tabId);
  }

  /**
   * Evaluate a threat input directly (for HTTP response metadata).
   */
  evaluate(tabId: string, input: ThreatInput): ThreatState {
    const newSignals: ThreatSignal[] = [];

    for (const pattern of THREAT_PATTERNS) {
      if (pattern.match(input)) {
        const signal: ThreatSignal = {
          id:       `sig-${Math.random().toString(36).slice(2, 10)}`,
          ts:       Date.now(),
          type:     pattern.type,
          level:    pattern.level,
          tabId,
          evidence: this.buildEvidence(pattern.type, input),
          raw:      undefined,
        };
        newSignals.push(signal);
      }
    }

    if (newSignals.length > 0) {
      this.appendSignals(tabId, newSignals);
      const state = this.recomputeState(tabId);

      for (const signal of newSignals) {
        this.emit("threat:detected", signal, state);
        this.telemetry.warn("system", `Threat detected [${signal.type}] on ${tabId}`, {
          level: signal.level,
          score: state.score,
        });
      }

      return state;
    }

    return this.getState(tabId);
  }

  /** Manually clear all signals for a tab (e.g., after CAPTCHA solved). */
  clear(tabId: string): void {
    this.signals.delete(tabId);
    this.states.delete(tabId);
    this.emit("threat:cleared", tabId);
  }

  getState(tabId: string): ThreatState {
    return this.states.get(tabId) ?? this.emptyState(tabId);
  }

  allStates(): Record<string, ThreatState> {
    const out: Record<string, ThreatState> = {};
    for (const [tabId, state] of this.states) out[tabId] = state;
    return out;
  }

  // ─── Bridge Listener ───────────────────────────────────────

  private attachBridgeListener(): void {
    this.bridge.on("event", (event: CDPEvent) => {
      // Watch for navigation events — re-probe on page load
      if (event.method === "Page.loadEventFired") {
        const tabId = this.sessionToTab(event.sessionId);
        if (tabId && event.sessionId) {
          this.probe(tabId, event.sessionId).catch(() => {});
        }
      }

      // HTTP response status codes
      if (event.method === "Network.responseReceived") {
        const resp = event.params.response as { status?: number; url?: string } | undefined;
        if (resp?.status === 429) {
          const tabId = this.sessionToTab(event.sessionId);
          if (tabId) this.evaluate(tabId, { statusCode: 429, url: resp.url });
        }
      }
    });
  }

  private sessionToTab(sessionId: string | undefined): string | null {
    if (!sessionId) return null;
    for (const tabId of this.states.keys()) {
      if (this.bridge.getSession(tabId) === sessionId) return tabId;
    }
    return null;
  }

  // ─── State Computation ─────────────────────────────────────

  private recomputeState(tabId: string): ThreatState {
    const now     = Date.now();
    const all     = (this.signals.get(tabId) ?? [])
      .filter((s) => now - s.ts < SIGNAL_TTL_MS);

    // Deduplicate by type (keep most recent per type)
    const byType  = new Map<ThreatType, ThreatSignal>();
    for (const s of all) {
      const existing = byType.get(s.type);
      if (!existing || s.ts > existing.ts) byType.set(s.type, s);
    }
    const active  = [...byType.values()];

    // Compute score (capped at 100)
    const score   = Math.min(
      active.reduce((sum, s) => {
        const pattern = THREAT_PATTERNS.find((p) => p.type === s.type);
        return sum + (pattern?.score ?? 10);
      }, 0),
      100
    );

    const level   = this.scoreToLevel(score);
    const prevState = this.states.get(tabId);

    const state: ThreatState = {
      level,
      activeSignals:    active,
      score,
      recommendProfile: level === "none" ? "precise"
        : level === "low"    ? "cautious"
        : "exploratory",
      recommendRoute:   level === "none" ? "direct"
        : level === "low"    ? "parallel"
        : "redundant",
      lastUpdated:      now,
    };

    if (prevState && prevState.level !== level) {
      this.emit("threat:escalated", tabId, prevState.level, level);
    }

    this.states.set(tabId, state);
    return state;
  }

  private appendSignals(tabId: string, newSignals: ThreatSignal[]): void {
    if (!this.signals.has(tabId)) this.signals.set(tabId, []);
    const buf = this.signals.get(tabId)!;
    buf.push(...newSignals);
    if (buf.length > 200) buf.splice(0, buf.length - 200);
  }

  private scoreToLevel(score: number): ThreatLevel {
    if (score === 0)   return "none";
    if (score < 25)    return "low";
    if (score < 55)    return "medium";
    if (score < 80)    return "high";
    return "critical";
  }

  private emptyState(tabId: string): ThreatState {
    return {
      level:             "none",
      activeSignals:     [],
      score:             0,
      recommendProfile:  "precise",
      recommendRoute:    "direct",
      lastUpdated:       Date.now(),
    };
  }

  private buildEvidence(type: ThreatType, input: ThreatInput): string {
    const parts: string[] = [type];
    if (input.url)        parts.push(`url=${input.url.slice(0, 80)}`);
    if (input.title)      parts.push(`title=${input.title.slice(0, 40)}`);
    if (input.statusCode) parts.push(`status=${input.statusCode}`);
    return parts.join(" | ");
  }
}
