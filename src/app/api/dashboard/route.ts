import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gatewayRequest } from "../gateway/route";

const execFileAsync = promisify(execFile);

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const OPENCLAW_CONFIG =
  process.env.OPENCLAW_CONFIG || path.join(OPENCLAW_ROOT, "openclaw.json");
const IDENTITY_PATH =
  process.env.IDENTITY_PATH || path.join(OPENCLAW_ROOT, "workspace", "IDENTITY.md");
const WORKSPACE_ROOT =
  process.env.WORKSPACE_PATH || path.join(OPENCLAW_ROOT, "workspace");
const SESSIONS_PATH = path.join(
  OPENCLAW_ROOT,
  "agents",
  "main",
  "sessions",
  "sessions.json"
);

// Disk cache (shared with system-health route concept)
let cachedDiskMb = 0;
let diskCacheExpiry = 0;

async function getDiskUsage(): Promise<number> {
  const now = Date.now();
  if (cachedDiskMb > 0 && now < diskCacheExpiry) return cachedDiskMb;
  try {
    const { stdout } = await execFileAsync("du", ["-sm", OPENCLAW_ROOT], {
      timeout: 5000,
    });
    const match = stdout.match(/^(\d+)/);
    if (match) {
      cachedDiskMb = parseInt(match[1], 10);
      diskCacheExpiry = now + 60_000;
    }
  } catch {
    // skip
  }
  return cachedDiskMb;
}

function parseIdentity(
  content: string
): { name?: string; emoji?: string; description?: string } {
  const result: { name?: string; emoji?: string; description?: string } = {};
  for (const line of content.split("\n")) {
    const nameMatch = line.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) result.name = nameMatch[1].trim();
    const emojiMatch = line.match(/\*\*Emoji:\*\*\s*(.+)/);
    if (emojiMatch) result.emoji = emojiMatch[1].trim();
    const creatureMatch = line.match(/\*\*Creature:\*\*\s*(.+)/);
    if (creatureMatch) result.description = creatureMatch[1].trim();
  }
  return result;
}

/**
 * Single endpoint that returns ALL data needed for the dashboard page.
 * Replaces 7+ separate HTTP requests with 1.
 *
 * Runs everything in parallel:
 *   - Gateway: system-presence / status, cron.list, last-heartbeat
 *   - Filesystem: PROPOSALS.md, HEARTBEAT.md, IDENTITY, config, sessions, avatar check
 *   - OS: memory, load, disk
 */
export async function GET() {
  try {
    // Fire ALL async work in parallel
    const [
      presenceResult,
      cronResult,
      heartbeatResult,
      proposalsResult,
      heartbeatMdResult,
      identityResult,
      configResult,
      sessionsResult,
      diskUsedMb,
      avatarChecks,
    ] = await Promise.allSettled([
      // Gateway calls (each may spawn a CLI process, but they run in parallel
      // and benefit from the cache)
      gatewayRequest("system-presence", {}).catch(() =>
        gatewayRequest("status", {}).catch(() => null)
      ),
      gatewayRequest("cron.list", { includeDisabled: true }).catch(() => null),
      gatewayRequest("last-heartbeat", {}).catch(() => null),
      // Workspace files
      fs.readFile(path.join(WORKSPACE_ROOT, "PROPOSALS.md"), "utf-8").catch(
        () => ""
      ),
      fs.readFile(path.join(WORKSPACE_ROOT, "HEARTBEAT.md"), "utf-8").catch(
        () => ""
      ),
      fs.readFile(IDENTITY_PATH, "utf-8").catch(() => ""),
      fs.readFile(OPENCLAW_CONFIG, "utf-8").catch(() => ""),
      fs.readFile(SESSIONS_PATH, "utf-8").catch(() => ""),
      // System
      getDiskUsage(),
      // Avatar check (parallel stat)
      Promise.allSettled(
        [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].map((ext) =>
          fs
            .stat(path.join(WORKSPACE_ROOT, `avatar${ext}`))
            .then((s) => s.isFile())
        )
      ),
    ]);

    // ── Gateway health ──
    const presenceVal =
      presenceResult.status === "fulfilled" ? presenceResult.value : null;
    const connected = presenceVal !== null;
    let uptime: number | undefined;
    if (
      presenceVal &&
      typeof presenceVal === "object" &&
      "uptime" in (presenceVal as Record<string, unknown>)
    ) {
      uptime = (presenceVal as { uptime?: number }).uptime;
    }

    // ── Cron jobs ──
    const cronVal =
      cronResult.status === "fulfilled" ? cronResult.value : null;
    const cronJobs =
      cronVal &&
      typeof cronVal === "object" &&
      "jobs" in (cronVal as Record<string, unknown>)
        ? (cronVal as { jobs: unknown[] }).jobs
        : [];

    // ── Heartbeat ──
    const heartbeatVal =
      heartbeatResult.status === "fulfilled" ? heartbeatResult.value : null;

    // ── Workspace files ──
    const proposals =
      proposalsResult.status === "fulfilled"
        ? (proposalsResult.value as string)
        : "";
    const heartbeatMd =
      heartbeatMdResult.status === "fulfilled"
        ? (heartbeatMdResult.value as string)
        : "";

    // ── Agent info ──
    const identityRaw =
      identityResult.status === "fulfilled"
        ? (identityResult.value as string)
        : "";
    const configRaw =
      configResult.status === "fulfilled"
        ? (configResult.value as string)
        : "";

    let name = "ClawdTM";
    let emoji = "🦞";
    let description = "";
    if (identityRaw) {
      const parsed = parseIdentity(identityRaw);
      if (parsed.name) name = parsed.name;
      if (parsed.emoji) emoji = parsed.emoji;
      if (parsed.description) description = parsed.description;
    }

    let model = "unknown";
    let provider = "unknown";
    if (configRaw) {
      try {
        const config = JSON.parse(configRaw);
        const primaryModel = config?.agents?.defaults?.model?.primary;
        if (primaryModel) {
          const parts = primaryModel.split("/");
          provider = parts[0] || "unknown";
          model = parts.slice(1).join("/") || primaryModel;
        }
      } catch {
        // malformed config
      }
    }

    // ── Avatar ──
    const avatarResults =
      avatarChecks.status === "fulfilled"
        ? (avatarChecks.value as PromiseSettledResult<boolean>[])
        : [];
    const hasAvatar = avatarResults.some(
      (r) => r.status === "fulfilled" && r.value === true
    );

    // ── System health ──
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();
    const disk =
      diskUsedMb.status === "fulfilled" ? (diskUsedMb.value as number) : 0;

    let sessionsTotal = 0;
    let sessionsActive = 0;
    const sessionsRaw =
      sessionsResult.status === "fulfilled"
        ? (sessionsResult.value as string)
        : "";
    if (sessionsRaw) {
      try {
        const sessions = JSON.parse(sessionsRaw) as Record<
          string,
          { updatedAt?: number }
        >;
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        for (const session of Object.values(sessions)) {
          sessionsTotal++;
          if (session.updatedAt && session.updatedAt > fiveMinAgo) {
            sessionsActive++;
          }
        }
      } catch {
        // malformed sessions
      }
    }

    let maxConcurrent = 4;
    if (configRaw) {
      try {
        const config = JSON.parse(configRaw);
        maxConcurrent = config.agents?.defaults?.maxConcurrent || 4;
      } catch {
        // already handled
      }
    }

    return NextResponse.json({
      health: { connected, uptime },
      cronJobs,
      heartbeat: heartbeatVal,
      proposals,
      heartbeatMd,
      agentInfo: { name, model, provider, emoji, description, hasAvatar },
      systemHealth: {
        system: {
          memoryUsedMb: Math.round(usedMem / 1024 / 1024),
          memoryTotalMb: Math.round(totalMem / 1024 / 1024),
          memoryPercent: Math.round((usedMem / totalMem) * 100),
          loadAvg: loadAvg.map((v) => Math.round(v * 100) / 100),
          diskUsedMb: disk,
        },
        sessions: { total: sessionsTotal, active: sessionsActive },
        agent: { model, maxConcurrent },
      },
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
