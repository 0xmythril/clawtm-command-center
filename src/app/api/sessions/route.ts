import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const SESSIONS_DIR = path.join(OPENCLAW_ROOT, "agents", "main", "sessions");
const SESSIONS_PATH = path.join(SESSIONS_DIR, "sessions.json");
const ADDRESS_BOOK_PATH = path.join(OPENCLAW_ROOT, "address-book.json");

interface SessionEntry {
  key: string;
  label: string;
  type: "main" | "channel" | "cron" | "subagent" | "unknown";
  channel?: string;
  updatedAt: number;
  createdAt: number;
  tokenCount: number;
  turnCount: number;
  model?: string;
  active: boolean;
  contactName?: string;
}

function parseSessionKey(key: string): {
  type: SessionEntry["type"];
  label: string;
  channel?: string;
  contactId?: string;
} {
  const parts = key.split(":");
  // agent:main:main -> Main session
  // agent:main:telegram:dm:5546883071 -> Telegram DM
  // agent:main:telegram:group:-5159692794 -> Telegram Group
  // agent:main:cron:07c2a010... -> Cron job
  // agent:main:subagent:... -> Subagent

  if (parts.length >= 3) {
    const segment = parts[2];

    if (segment === "main") {
      return { type: "main", label: "Main Session" };
    }

    if (segment === "cron") {
      const cronId = parts.slice(3).join(":");
      return { type: "cron", label: `Cron: ${cronId.slice(0, 8)}...` };
    }

    if (segment === "subagent") {
      const subId = parts.slice(3).join(":");
      return { type: "subagent", label: `Subagent: ${subId.slice(0, 12)}` };
    }

    // Channel sessions: agent:main:telegram:dm:ID or agent:main:telegram:group:ID
    const channelName = segment;
    const msgType = parts[3] || "dm";
    const contactId = parts.slice(4).join(":");

    if (msgType === "dm") {
      return {
        type: "channel",
        label: `${capitalize(channelName)} DM: ${contactId}`,
        channel: channelName,
        contactId,
      };
    }
    if (msgType === "group") {
      return {
        type: "channel",
        label: `${capitalize(channelName)} Group: ${contactId}`,
        channel: channelName,
      };
    }

    return {
      type: "channel",
      label: `${capitalize(channelName)}: ${parts.slice(3).join(":")}`,
      channel: channelName,
      contactId,
    };
  }

  return { type: "unknown", label: key };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadAddressBook(): Promise<Record<string, string>> {
  // Returns map of channel:id -> displayName
  const nameMap: Record<string, string> = {};
  try {
    const raw = await fs.readFile(ADDRESS_BOOK_PATH, "utf-8");
    const book = JSON.parse(raw);
    if (book.contacts) {
      for (const contact of Object.values(book.contacts) as Array<{
        displayName?: string;
        identities?: Array<{ channel: string; id: string }>;
      }>) {
        if (contact.displayName && contact.identities) {
          for (const id of contact.identities) {
            nameMap[`${id.channel}:${id.id}`] = contact.displayName;
          }
        }
      }
    }
  } catch {
    // address book may not exist
  }
  return nameMap;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const sessionId = searchParams.get("id");
    const typeFilter = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Single session detail
    if (sessionId) {
      return getSessionDetail(sessionId, limit);
    }

    // Session list
    const raw = await fs.readFile(SESSIONS_PATH, "utf-8");
    const sessions = JSON.parse(raw) as Record<string, {
      updatedAt?: number;
      createdAt?: number;
      tokenCount?: number;
      turnCount?: number;
      model?: string;
    }>;

    const nameMap = await loadAddressBook();
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;

    let entries: SessionEntry[] = Object.entries(sessions).map(([key, s]) => {
      const parsed = parseSessionKey(key);
      const contactName = parsed.contactId && parsed.channel
        ? nameMap[`${parsed.channel}:${parsed.contactId}`]
        : undefined;

      return {
        key,
        label: contactName ? `${capitalize(parsed.channel || "")} DM: ${contactName}` : parsed.label,
        type: parsed.type,
        channel: parsed.channel,
        updatedAt: s.updatedAt || 0,
        createdAt: s.createdAt || 0,
        tokenCount: s.tokenCount || 0,
        turnCount: s.turnCount || 0,
        model: s.model,
        active: (s.updatedAt || 0) > fiveMinAgo,
        contactName,
      };
    });

    // Filter by type
    if (typeFilter && typeFilter !== "all") {
      entries = entries.filter((e) => e.type === typeFilter);
    }

    // Sort: active first, then by updatedAt descending
    entries.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

    entries = entries.slice(0, limit);

    const activeCount = entries.filter((e) => e.active).length;

    return NextResponse.json({ sessions: entries, total: entries.length, activeCount });
  } catch (error) {
    console.error("Sessions error:", error);
    return NextResponse.json(
      { error: "Failed to read sessions" },
      { status: 500 }
    );
  }
}

async function getSessionDetail(sessionId: string, limit: number) {
  try {
    // Find the session JSONL file
    // Session files are named by the session key with colons replaced
    const safeKey = sessionId.replace(/[:/]/g, "_");
    const possibleFiles = [
      `${safeKey}.jsonl`,
      `${sessionId}.jsonl`,
    ];

    let sessionFile: string | null = null;
    for (const f of possibleFiles) {
      try {
        await fs.access(path.join(SESSIONS_DIR, f));
        sessionFile = f;
        break;
      } catch {
        // try next
      }
    }

    if (!sessionFile) {
      // Try to find by listing directory
      const files = await fs.readdir(SESSIONS_DIR);
      const match = files.find(
        (f) => f.endsWith(".jsonl") && f.includes(safeKey.slice(-12))
      );
      if (match) sessionFile = match;
    }

    if (!sessionFile) {
      return NextResponse.json(
        { error: "Session file not found" },
        { status: 404 }
      );
    }

    const raw = await fs.readFile(path.join(SESSIONS_DIR, sessionFile), "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const recentLines = lines.slice(-limit);

    const history = recentLines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });

    return NextResponse.json({ sessionId, history, totalTurns: lines.length });
  } catch (error) {
    console.error("Session detail error:", error);
    return NextResponse.json(
      { error: "Failed to read session detail" },
      { status: 500 }
    );
  }
}
