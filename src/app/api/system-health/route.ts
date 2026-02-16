import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(OPENCLAW_ROOT, "openclaw.json");
const SESSIONS_PATH = path.join(OPENCLAW_ROOT, "agents", "main", "sessions", "sessions.json");

// Cache disk usage -- changes slowly, no need to re-measure every request
let cachedDiskMb = 0;
let diskCacheExpiry = 0;
const DISK_CACHE_TTL = 60_000;

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
      diskCacheExpiry = now + DISK_CACHE_TTL;
    }
  } catch {
    // skip disk measurement
  }
  return cachedDiskMb;
}

export async function GET() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();

    // Run disk + sessions + config reads in parallel
    const [diskUsedMb, sessionsResult, configResult] = await Promise.all([
      getDiskUsage(),
      fs.readFile(SESSIONS_PATH, "utf-8").catch(() => null),
      fs.readFile(OPENCLAW_CONFIG, "utf-8").catch(() => null),
    ]);

    let sessionsTotal = 0;
    let sessionsActive = 0;
    if (sessionsResult) {
      try {
        const sessions = JSON.parse(sessionsResult) as Record<string, { updatedAt?: number }>;
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        for (const session of Object.values(sessions)) {
          sessionsTotal++;
          if (session.updatedAt && session.updatedAt > fiveMinAgo) {
            sessionsActive++;
          }
        }
      } catch {
        // malformed sessions file
      }
    }

    let model = "";
    let maxConcurrent = 4;
    if (configResult) {
      try {
        const config = JSON.parse(configResult);
        model = config.agents?.defaults?.model?.primary || "";
        maxConcurrent = config.agents?.defaults?.maxConcurrent || 4;
      } catch {
        // malformed config
      }
    }

    return NextResponse.json({
      system: {
        memoryUsedMb: Math.round(usedMem / 1024 / 1024),
        memoryTotalMb: Math.round(totalMem / 1024 / 1024),
        memoryPercent: Math.round((usedMem / totalMem) * 100),
        loadAvg: loadAvg.map((v) => Math.round(v * 100) / 100),
        diskUsedMb,
      },
      sessions: {
        total: sessionsTotal,
        active: sessionsActive,
      },
      agent: {
        model,
        maxConcurrent,
      },
    });
  } catch (error) {
    console.error("System health error:", error);
    return NextResponse.json(
      { error: "Failed to get system health" },
      { status: 500 }
    );
  }
}
