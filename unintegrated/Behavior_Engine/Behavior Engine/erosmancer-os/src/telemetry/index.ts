// ============================================================
// ErosmancerOS — Telemetry
// Structured JSONL logger. In-memory ring buffer + disk flush.
// ============================================================

import { randomUUID } from "crypto";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import type { TelemetryEvent, OSConfig } from "../types/index.ts";

export class Telemetry {
  private readonly config: OSConfig["telemetry"];
  private buffer: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: OSConfig["telemetry"]) {
    this.config = config;

    if (config.persistPath) {
      const dir = dirname(config.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    this.flushTimer = setInterval(() => this.flush(), config.flushIntervalMs);
  }

  emit(
    category: TelemetryEvent["category"],
    level: TelemetryEvent["level"],
    message: string,
    data?: unknown,
    ctx?: { tabId?: string; nodeUuid?: string; commandId?: string }
  ): void {
    const event: TelemetryEvent = {
      id: randomUUID(),
      ts: Date.now(),
      category,
      level,
      message,
      data,
      ...ctx,
    };

    this.buffer.push(event);

    // Ring buffer: evict oldest when over limit
    if (this.buffer.length > this.config.maxEvents) {
      this.buffer.shift();
    }

    // Always print to stderr so it's visible without file config
    const prefix = `[${level.toUpperCase()}][${category}]`;
    if (level === "error" || level === "warn") {
      console.error(`${prefix} ${message}`, data ?? "");
    } else {
      console.log(`${prefix} ${message}`, data ?? "");
    }
  }

  debug(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "debug", msg, data, ctx as never);
  }
  info(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "info", msg, data, ctx as never);
  }
  warn(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "warn", msg, data, ctx as never);
  }
  error(cat: TelemetryEvent["category"], msg: string, data?: unknown, ctx?: object): void {
    this.emit(cat, "error", msg, data, ctx as never);
  }

  private flush(): void {
    if (!this.config.persistPath || this.buffer.length === 0) return;

    const lines = this.buffer.map((e) => JSON.stringify(e)).join("\n") + "\n";
    try {
      appendFileSync(this.config.persistPath, lines, "utf8");
    } catch (err) {
      console.error("[Telemetry] flush failed:", err);
    }
  }

  getEvents(filter?: Partial<Pick<TelemetryEvent, "category" | "level">>): TelemetryEvent[] {
    if (!filter) return [...this.buffer];
    return this.buffer.filter((e) => {
      if (filter.category && e.category !== filter.category) return false;
      if (filter.level && e.level !== filter.level) return false;
      return true;
    });
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(); // final flush on shutdown
  }
}
