import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const CRON_RUNS_DIR = path.join(OPENCLAW_ROOT, "cron", "runs");
const SESSIONS_PATH = path.join(OPENCLAW_ROOT, "agents", "main", "sessions", "sessions.json");

interface LogEntry {
  ts: number;
  type: "cron" | "session";
  source: string;
  summary: string;
  status?: string;
  durationMs?: number;
  sessionKey?: string;
}

async function readCronLogs(limit: number): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];
  try {
    const files = await fs.readdir(CRON_RUNS_DIR);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl")).sort().reverse();

    for (const file of jsonlFiles) {
      if (entries.length >= limit) break;
      try {
        const raw = await fs.readFile(path.join(CRON_RUNS_DIR, file), "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        for (const line of lines) {
          if (entries.length >= limit) break;
          try {
            const parsed = JSON.parse(line);
            entries.push({
              ts: parsed.ts || parsed.timestamp || Date.now(),
              type: "cron",
              source: parsed.jobId || file.replace(".jsonl", ""),
              summary: parsed.summary || parsed.action || parsed.message || "Cron run",
              status: parsed.status || (parsed.success === false ? "error" : "ok"),
              durationMs: parsed.durationMs,
            });
          } catch {
            // skip malformed lines
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // cron runs dir may not exist
  }

  return entries;
}

async function readSessionLogs(limit: number): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];
  try {
    const raw = await fs.readFile(SESSIONS_PATH, "utf-8");
    const sessions = JSON.parse(raw) as Record<string, {
      updatedAt?: number;
      createdAt?: number;
      tokenCount?: number;
      turnCount?: number;
      model?: string;
    }>;

    const sorted = Object.entries(sessions)
      .sort(([, a], [, b]) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit);

    for (const [key, session] of sorted) {
      // parse session key for readable label
      const parts = key.split(":");
      let label = key;
      if (parts.length >= 4) {
        const channel = parts[2];
        const type = parts[3];
        const id = parts.slice(4).join(":");
        label = `${channel}${type ? `:${type}` : ""}${id ? ` ${id}` : ""}`;
      } else if (parts.length >= 3) {
        label = parts.slice(2).join(":");
      }

      entries.push({
        ts: session.updatedAt || session.createdAt || 0,
        type: "session",
        source: label,
        summary: `${session.turnCount || 0} turns, ${session.tokenCount ? `${(session.tokenCount / 1000).toFixed(1)}k tokens` : "0 tokens"}`,
        sessionKey: key,
      });
    }
  } catch {
    // sessions file may not exist
  }

  return entries;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type") || "all";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const search = searchParams.get("search")?.toLowerCase();

    let entries: LogEntry[] = [];

    if (type === "all" || type === "cron") {
      entries.push(...(await readCronLogs(limit)));
    }
    if (type === "all" || type === "sessions") {
      entries.push(...(await readSessionLogs(limit)));
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.ts - a.ts);

    // Filter by search
    if (search) {
      entries = entries.filter(
        (e) =>
          e.source.toLowerCase().includes(search) ||
          e.summary.toLowerCase().includes(search)
      );
    }

    // Paginate
    const total = entries.length;
    entries = entries.slice(offset, offset + limit);

    return NextResponse.json({ entries, total });
  } catch (error) {
    console.error("Logs error:", error);
    return NextResponse.json({ error: "Failed to read logs" }, { status: 500 });
  }
}
