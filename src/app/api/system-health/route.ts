import { NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || path.join(OPENCLAW_ROOT, "openclaw.json");
const SESSIONS_PATH = path.join(OPENCLAW_ROOT, "agents", "main", "sessions", "sessions.json");

export async function GET() {
  try {
    // ── System metrics ──
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();

    // ── Disk usage of ~/.openclaw/ ──
    let diskUsedMb = 0;
    try {
      const duOutput = execSync(`du -sm "${OPENCLAW_ROOT}" 2>/dev/null`, { encoding: "utf-8", timeout: 5000 });
      const match = duOutput.match(/^(\d+)/);
      if (match) diskUsedMb = parseInt(match[1], 10);
    } catch {
      // fallback: skip disk measurement
    }

    // ── Sessions ──
    let sessionsTotal = 0;
    let sessionsActive = 0;
    try {
      const raw = await fs.readFile(SESSIONS_PATH, "utf-8");
      const sessions = JSON.parse(raw) as Record<string, { updatedAt?: number }>;
      const now = Date.now();
      const fiveMinAgo = now - 5 * 60 * 1000;

      for (const session of Object.values(sessions)) {
        sessionsTotal++;
        if (session.updatedAt && session.updatedAt > fiveMinAgo) {
          sessionsActive++;
        }
      }
    } catch {
      // sessions file may not exist
    }

    // ── Agent config ──
    let model = "";
    let maxConcurrent = 4;
    try {
      const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
      const config = JSON.parse(raw);
      model = config.agents?.defaults?.model?.primary || "";
      maxConcurrent = config.agents?.defaults?.maxConcurrent || 4;
    } catch {
      // config may not exist
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
