import fs from "node:fs/promises";
import path from "node:path";

export interface AgentIdentity {
  name?: string;
  emoji?: string;
  description?: string;
}

export const DEFAULT_AGENT_NAME = "ClawdTM";

export function isPlaceholderAgentName(name?: string): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "agent" ||
    normalized === "openclaw agent" ||
    normalized === DEFAULT_AGENT_NAME.toLowerCase()
  );
}

export function parseIdentity(content: string): AgentIdentity {
  const result: AgentIdentity = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const normalized = line.replace(/^[-*]\s*/, "").trim();

    const nameMatch =
      normalized.match(/^\*\*name:\*\*\s*(.+)$/i) ??
      normalized.match(/^name:\s*(.+)$/i);
    if (nameMatch && !result.name) result.name = stripMd(nameMatch[1]);

    const emojiMatch =
      normalized.match(/^\*\*emoji:\*\*\s*(.+)$/i) ??
      normalized.match(/^emoji:\s*(.+)$/i);
    if (emojiMatch && !result.emoji) result.emoji = stripMd(emojiMatch[1]);

    const descMatch =
      normalized.match(/^\*\*(creature|role):\*\*\s*(.+)$/i) ??
      normalized.match(/^(creature|role):\s*(.+)$/i);
    if (descMatch && !result.description) result.description = stripMd(descMatch[2]);
  }

  // Fallback to first markdown heading as name when explicit name is missing.
  if (!result.name) {
    const heading = content
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("# "));
    if (heading) result.name = stripMd(heading.replace(/^#\s+/, ""));
  }

  return result;
}

export async function readAgentIdentity(paths: {
  identityPath: string;
  soulPath?: string;
  configPath?: string;
}): Promise<AgentIdentity> {
  const [identityRaw, soulRaw, configRaw] = await Promise.all([
    fs.readFile(paths.identityPath, "utf-8").catch(() => ""),
    paths.soulPath ? fs.readFile(paths.soulPath, "utf-8").catch(() => "") : Promise.resolve(""),
    paths.configPath ? fs.readFile(paths.configPath, "utf-8").catch(() => "") : Promise.resolve(""),
  ]);

  const fromIdentity = identityRaw ? parseIdentity(identityRaw) : {};
  const fromSoul = soulRaw ? parseIdentity(soulRaw) : {};
  const fromConfig = parseNameFromConfig(configRaw);

  const name = pickBestName(fromIdentity.name, fromSoul.name, fromConfig);
  const emoji = fromIdentity.emoji || fromSoul.emoji || "🦞";
  const description = fromIdentity.description || fromSoul.description || "";

  return { name, emoji, description };
}

export async function writeAgentName(identityPath: string, nextName: string): Promise<void> {
  const safeName = nextName.trim();
  const existing = await fs.readFile(identityPath, "utf-8").catch(() => "");
  const updated = updateIdentityName(existing, safeName);

  await fs.mkdir(path.dirname(identityPath), { recursive: true });
  await fs.writeFile(identityPath, updated, "utf-8");
}

function parseNameFromConfig(configRaw: string): string | undefined {
  if (!configRaw) return undefined;
  try {
    const config = JSON.parse(configRaw) as Record<string, unknown>;
    const agents = config.agents as Record<string, unknown> | undefined;
    const defaults = agents?.defaults as Record<string, unknown> | undefined;
    const name = defaults?.name;
    return typeof name === "string" ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

function pickBestName(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!isPlaceholderAgentName(candidate)) return candidate;
  }
  return candidates.find((c) => c && c.trim())?.trim();
}

function stripMd(value: string): string {
  return value.replace(/\*\*/g, "").trim();
}

function updateIdentityName(content: string, name: string): string {
  const lines = content ? content.split("\n") : [];
  const nameLinePattern = /^(\s*[-*]?\s*)(\*\*)?name:\2?\s*/i;

  for (let i = 0; i < lines.length; i++) {
    if (nameLinePattern.test(lines[i])) {
      const indent = lines[i].match(/^(\s*[-*]?\s*)/)?.[1] ?? "- ";
      lines[i] = `${indent}**Name:** ${name}`;
      return lines.join("\n");
    }
  }

  const insertionIndex = lines.findIndex((line) => line.trim().startsWith("# "));
  if (insertionIndex >= 0) {
    lines.splice(insertionIndex + 1, 0, "", `- **Name:** ${name}`);
    return lines.join("\n");
  }

  return `# IDENTITY.md - Who Am I?\n\n- **Name:** ${name}\n- **Creature:** AI assistant\n- **Emoji:** 🦞\n`;
}
