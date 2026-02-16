import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GATEWAY_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 15_000;
const CACHEABLE_METHODS = new Set(["status", "health", "system-presence", "last-heartbeat"]);

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function makeCacheKey(method: string, params: unknown): string {
  const safeParams =
    params && typeof params === "object" && !Array.isArray(params) ? params : {};
  return `${method}:${JSON.stringify(safeParams)}`;
}

// Use the OpenClaw CLI as a stable gateway transport bridge.
// This avoids WS auth/context edge-cases in newer OpenClaw versions.
async function gatewayRequest(method: string, params: unknown = {}): Promise<unknown> {
  const key = makeCacheKey(method, params);
  const now = Date.now();
  const canCache = CACHEABLE_METHODS.has(method);

  if (canCache) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    const pending = inflight.get(key);
    if (pending) {
      return pending;
    }
  }

  const run = (async () => {
    const safeParams =
      params && typeof params === "object" && !Array.isArray(params) ? params : {};

    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      [
        "gateway",
        "call",
        method,
        "--json",
        "--timeout",
        String(GATEWAY_TIMEOUT_MS),
        "--params",
        JSON.stringify(safeParams),
      ],
      { timeout: GATEWAY_TIMEOUT_MS + 3000 }
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error(`Gateway call returned empty output${stderr ? `: ${stderr.trim()}` : ""}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Gateway call returned non-JSON output: ${trimmed.slice(0, 400)}`);
    }

    if (canCache) {
      responseCache.set(key, { data: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return parsed;
  })();

  if (canCache) {
    inflight.set(key, run);
  }

  try {
    return await run;
  } finally {
    if (canCache) {
      inflight.delete(key);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, params } = body as { method: string; params?: unknown };

    if (!method) {
      return NextResponse.json({ error: "Method required" }, { status: 400 });
    }

    const result = await gatewayRequest(method, params || {});
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const method = searchParams.get("method");

  if (!method) {
    return NextResponse.json({ error: "Method required" }, { status: 400 });
  }

  try {
    const result = await gatewayRequest(method, {});
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
