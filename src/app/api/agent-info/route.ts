import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  readAgentIdentity,
  writeAgentName,
  DEFAULT_AGENT_NAME,
} from "@/lib/agent-identity";

const OPENCLAW_CONFIG =
  process.env.OPENCLAW_CONFIG || "/home/clawdbot/.openclaw/openclaw.json";
const IDENTITY_PATH =
  process.env.IDENTITY_PATH || "/home/clawdbot/.openclaw/workspace/IDENTITY.md";
const SOUL_PATH = process.env.SOUL_PATH || "/home/clawdbot/.openclaw/workspace/SOUL.md";
const WORKSPACE_ROOT =
  process.env.WORKSPACE_PATH || "/home/clawdbot/.openclaw/workspace";

export interface AgentInfo {
  name: string;
  model: string;
  provider: string;
  emoji: string;
  description: string;
  hasAvatar: boolean;
}

export async function GET() {
  try {
    // Read config for model info
    let model = "unknown";
    let provider = "unknown";
    try {
      const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
      const config = JSON.parse(raw);
      const primaryModel = config?.agents?.defaults?.model?.primary;
      if (primaryModel) {
        const parts = primaryModel.split("/");
        provider = parts[0] || "unknown";
        model = parts.slice(1).join("/") || primaryModel;
      }
    } catch {
      // config unreadable
    }

    // Read identity for name/emoji
    const identity = await readAgentIdentity({
      identityPath: IDENTITY_PATH,
      soulPath: SOUL_PATH,
      configPath: OPENCLAW_CONFIG,
    });
    const name = identity.name || DEFAULT_AGENT_NAME;
    const emoji = identity.emoji || "🦞";
    const description = identity.description || "";

    // Check if avatar exists -- parallel stat calls instead of sequential
    const avatarExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
    const avatarChecks = await Promise.allSettled(
      avatarExts.map((ext) =>
        fs.stat(path.join(WORKSPACE_ROOT, `avatar${ext}`)).then((s) => s.isFile())
      )
    );
    const hasAvatar = avatarChecks.some(
      (r) => r.status === "fulfilled" && r.value === true
    );

    return NextResponse.json({
      name,
      model,
      provider,
      emoji,
      description,
      hasAvatar,
    } satisfies AgentInfo);
  } catch (error) {
    console.error("Agent info error:", error);
    return NextResponse.json(
      { name: DEFAULT_AGENT_NAME, model: "unknown", provider: "unknown", emoji: "🦞", description: "", hasAvatar: false },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: unknown };
    const rawName = typeof body.name === "string" ? body.name : "";
    const nextName = rawName.trim();

    if (!nextName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (nextName.length > 80) {
      return NextResponse.json(
        { error: "Name must be 80 characters or less" },
        { status: 400 }
      );
    }

    await writeAgentName(IDENTITY_PATH, nextName);
    return NextResponse.json({ ok: true, name: nextName });
  } catch (error) {
    console.error("Agent info update error:", error);
    return NextResponse.json(
      { error: "Failed to update agent identity" },
      { status: 500 }
    );
  }
}
