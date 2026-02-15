import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(OPENCLAW_ROOT, "openclaw.json");

// Fields that should be masked in GET response
const SENSITIVE_KEYS = new Set([
  "botToken", "apiKey", "token", "secret", "password", "api_key",
]);

// Top-level sections that are read-only
const READ_ONLY_SECTIONS = new Set(["meta", "wizard"]);

function maskSecrets(obj: unknown, reveal = false): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskSecrets(v, reveal));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (!reveal && SENSITIVE_KEYS.has(key) && typeof value === "string" && value.length > 0) {
      // Show last 4 chars for identification
      const masked = "••••••••" + (value.length > 4 ? value.slice(-4) : "");
      result[key] = masked;
    } else if (typeof value === "object" && value !== null) {
      result[key] = maskSecrets(value, reveal);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function validateConfig(config: unknown): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    errors.push("Config must be a JSON object");
    return errors;
  }

  const c = config as Record<string, unknown>;

  // Check required top-level sections
  if (!c.channels || typeof c.channels !== "object") {
    errors.push("Missing or invalid 'channels' section");
  }
  if (!c.gateway || typeof c.gateway !== "object") {
    errors.push("Missing or invalid 'gateway' section");
  }
  if (!c.agents || typeof c.agents !== "object") {
    errors.push("Missing or invalid 'agents' section");
  }

  // Validate gateway port if present
  const gw = c.gateway as Record<string, unknown> | undefined;
  if (gw?.port !== undefined) {
    const port = Number(gw.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push("Gateway port must be between 1 and 65535");
    }
  }

  return errors;
}

function mergeSecrets(
  newConfig: Record<string, unknown>,
  originalConfig: Record<string, unknown>
): Record<string, unknown> {
  // Deep merge: restore masked values from original
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(newConfig)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === "string" && value.startsWith("••••••••")) {
      // Restore original secret
      result[key] = (originalConfig[key] as string) ?? value;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const origChild = (originalConfig[key] ?? {}) as Record<string, unknown>;
      result[key] = mergeSecrets(
        value as Record<string, unknown>,
        typeof origChild === "object" && origChild !== null ? origChild : {}
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

export async function GET() {
  try {
    const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
    const config = JSON.parse(raw);
    const masked = maskSecrets(config);

    return NextResponse.json({
      config: masked,
      raw: JSON.stringify(masked, null, 2),
      readOnlySections: Array.from(READ_ONLY_SECTIONS),
    });
  } catch (error) {
    console.error("Config read error:", error);
    return NextResponse.json(
      { error: "Failed to read config" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config: newConfig, action } = body;

    if (!newConfig || typeof newConfig !== "object") {
      return NextResponse.json(
        { error: "Invalid config payload" },
        { status: 400 }
      );
    }

    // Validate-only mode
    if (action === "validate") {
      const errors = validateConfig(newConfig);
      return NextResponse.json({
        valid: errors.length === 0,
        errors,
      });
    }

    // Full validation
    const errors = validateConfig(newConfig);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", errors },
        { status: 400 }
      );
    }

    // Read current config to restore masked secrets
    let originalConfig: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
      originalConfig = JSON.parse(raw);
    } catch {
      // if we can't read original, proceed with what we have
    }

    // Restore read-only sections from original
    const merged = { ...newConfig } as Record<string, unknown>;
    for (const section of READ_ONLY_SECTIONS) {
      if (section in originalConfig) {
        merged[section] = originalConfig[section];
      }
    }

    // Restore masked secrets
    const final = mergeSecrets(
      merged as Record<string, unknown>,
      originalConfig
    );

    // Update meta timestamp
    if (final.meta && typeof final.meta === "object") {
      (final.meta as Record<string, unknown>).lastTouchedAt = new Date().toISOString();
    }

    // Backup current config
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${OPENCLAW_CONFIG}.backup.${timestamp}`;
    try {
      await fs.copyFile(OPENCLAW_CONFIG, backupPath);
    } catch {
      // backup failure is non-fatal but log it
      console.warn("Failed to create config backup at", backupPath);
    }

    // Atomic write
    const dir = path.dirname(OPENCLAW_CONFIG);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${OPENCLAW_CONFIG}.${randomBytes(8).toString("hex")}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(final, null, 2), "utf-8");
    await fs.rename(tmpPath, OPENCLAW_CONFIG);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Config write error:", error);
    return NextResponse.json(
      { error: "Failed to write config" },
      { status: 500 }
    );
  }
}
