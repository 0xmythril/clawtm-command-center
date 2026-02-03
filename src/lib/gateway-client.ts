"use client";

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayHelloOk = {
  type: "hello-ok";
  protocol: number;
  features?: { methods?: string[]; events?: string[] };
  snapshot?: {
    uptimeMs?: number;
    policy?: { tickIntervalMs?: number };
  };
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
  };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

export type GatewayClientOptions = {
  url: string;
  token?: string;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

function generateUUID(): string {
  // Works in both browser and Node.js
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private connectSent = false;
  private backoffMs = 800;
  private helloReceived = false;

  constructor(private opts: GatewayClientOptions) {}

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.flushPending(new Error("gateway client stopped"));
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN && this.helloReceived;
  }

  private connect() {
    if (this.closed) return;

    this.ws = new WebSocket(this.opts.url);
    this.connectSent = false;
    this.helloReceived = false;

    this.ws.addEventListener("open", () => {
      // Send connect frame after a short delay (like OpenClaw does)
      setTimeout(() => this.sendConnect(), 100);
    });

    this.ws.addEventListener("message", (ev) => {
      this.handleMessage(String(ev.data ?? ""));
    });

    this.ws.addEventListener("close", (ev) => {
      const reason = String(ev.reason ?? "");
      this.ws = null;
      this.helloReceived = false;
      this.flushPending(new Error(`gateway closed (${ev.code}): ${reason}`));
      this.opts.onClose?.({ code: ev.code, reason });
      this.opts.onDisconnect?.();
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      // ignored; close handler will fire
    });
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    setTimeout(() => this.connect(), delay);
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  private async sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "command-center",
        version: "1.0.0",
        platform: typeof navigator !== "undefined" ? navigator.platform : "web",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.admin", "operator.read", "operator.write"],
      caps: [],
      auth: this.opts.token ? { token: this.opts.token } : undefined,
    };

    try {
      const hello = await this.request<GatewayHelloOk>("connect", params);
      this.helloReceived = true;
      this.backoffMs = 800;
      this.opts.onHello?.(hello);
      this.opts.onConnect?.();
    } catch (err) {
      console.error("Gateway connect failed:", err);
      this.ws?.close(4008, "connect failed");
    }
  }

  private handleMessage(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };

    if (frame.type === "event") {
      const evt = parsed as GatewayEventFrame;
      this.opts.onEvent?.(evt);
      return;
    }

    if (frame.type === "res") {
      const res = parsed as GatewayResponseFrame;
      const pending = this.pending.get(res.id);
      if (!pending) return;

      this.pending.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message ?? "request failed"));
      }
      return;
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("gateway not connected"));
    }
    const id = generateUUID();
    const frame = { type: "req", id, method, params };
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
    });
    this.ws.send(JSON.stringify(frame));
    return p;
  }
}

// Types for gateway responses
export interface CronJob {
  id: string;
  agentId?: string;
  name: string;
  enabled: boolean;
  schedule: {
    kind: "cron" | "every" | "at";
    expr?: string;
    tz?: string;
    everyMs?: number;
    atMs?: number;
  };
  sessionTarget: "main" | "isolated";
  wakeMode: "now" | "next-heartbeat";
  payload: {
    kind: "systemEvent" | "agentTurn";
    text?: string;
    message?: string;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
  };
}

export interface CronStatus {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number;
}

export interface CronListResponse {
  jobs: CronJob[];
}

export interface SkillStatusEntry {
  skillKey: string;
  name: string;
  description: string;
  emoji?: string;
  source: string;
  eligible: boolean;
  disabled: boolean;
}

export interface SkillStatusReport {
  skills: SkillStatusEntry[];
}

export interface HeartbeatEvent {
  ts?: number;
  text?: string;
  source?: string;
}

export interface HealthSnapshot {
  ts: number;
  channels?: Record<string, { ok: boolean; error?: string }>;
}

export interface StatusSummary {
  version?: string;
  uptime?: number;
  platform?: string;
}
