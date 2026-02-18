import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GATEWAY_TIMEOUT_MS = 15_000;

// Tiered cache TTLs: volatile data gets short TTL, stable data gets longer
const CACHE_TTLS: Record<string, number> = {
  "status": 10_000,
  "health": 10_000,
  "system-presence": 8_000,
  "last-heartbeat": 10_000,
  "cron.list": 15_000,
  "cron.status": 15_000,
  "skills.status": 30_000,
  "device.pair.list": 20_000,
};

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
async function gatewayRequest(method: string, params: unknown = {}): Promise<unknown> {
  const key = makeCacheKey(method, params);
  const now = Date.now();
  const ttl = CACHE_TTLS[method];
  const canCache = ttl !== undefined;

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

    if (canCache && ttl) {
      responseCache.set(key, { data: parsed, expiresAt: Date.now() + ttl });
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

// Exported for use by other server-side API routes (avoids self-referential HTTP)
export { gatewayRequest };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Batch mode: { batch: [{ method, params }, ...] }
    if (Array.isArray(body.batch)) {
      const calls = body.batch as Array<{ method: string; params?: unknown }>;
      if (calls.length > 10) {
        return NextResponse.json({ error: "Max 10 batch calls" }, { status: 400 });
      }
      const results = await Promise.allSettled(
        calls.map((c) => gatewayRequest(c.method, c.params || {}))
      );
      const data = results.map((r, i) =>
        r.status === "fulfilled"
          ? { ok: true, method: calls[i].method, data: r.value }
          : { ok: false, method: calls[i].method, error: String(r.reason) }
      );
      return NextResponse.json({ ok: true, results: data });
    }

    // Single call mode
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
