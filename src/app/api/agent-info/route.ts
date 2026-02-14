import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const OPENCLAW_CONFIG =
  process.env.OPENCLAW_CONFIG || "/home/clawdbot/.openclaw/openclaw.json";
const IDENTITY_PATH =
  process.env.IDENTITY_PATH || "/home/clawdbot/.openclaw/workspace/IDENTITY.md";
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

function parseIdentity(content: string): { name?: string; emoji?: string; description?: string } {
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
    let name = "ClawdTM";
    let emoji = "🦞";
    let description = "";
    try {
      const identityContent = await fs.readFile(IDENTITY_PATH, "utf-8");
      const parsed = parseIdentity(identityContent);
      if (parsed.name) name = parsed.name;
      if (parsed.emoji) emoji = parsed.emoji;
      if (parsed.description) description = parsed.description;
    } catch {
      // identity file missing
    }

    // Check if avatar exists
    let hasAvatar = false;
    const avatarExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
    for (const ext of avatarExts) {
      try {
        const stat = await fs.stat(path.join(WORKSPACE_ROOT, `avatar${ext}`));
        if (stat.isFile()) {
          hasAvatar = true;
          break;
        }
      } catch {
        // not found, try next
      }
    }

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
      { name: "ClawdTM", model: "unknown", provider: "unknown", emoji: "🦞", description: "", hasAvatar: false },
    );
  }
}
