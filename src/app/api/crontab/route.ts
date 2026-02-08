import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface SystemCronEntry {
  id: string;
  expr: string;
  command: string;
  comment?: string;
  raw: string;
}

function parseCrontab(output: string): SystemCronEntry[] {
  const entries: SystemCronEntry[] = [];
  const lines = output.split("\n");
  let pendingComment: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      pendingComment = undefined;
      continue;
    }

    // Track comments (they often label the next cron line)
    if (trimmed.startsWith("#")) {
      pendingComment = trimmed.slice(1).trim();
      continue;
    }

    // Parse cron line: 5 fields + command
    // Format: min hour dom mon dow command
    const match = trimmed.match(
      /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/
    );
    if (!match) continue;

    const [, min, hour, dom, mon, dow, commandWithComment] = match;
    const expr = `${min} ${hour} ${dom} ${mon} ${dow}`;

    // Extract inline comment from command (e.g. "cmd # My Comment")
    let command = commandWithComment;
    let inlineComment: string | undefined;
    const commentIdx = commandWithComment.indexOf(" # ");
    if (commentIdx !== -1) {
      command = commandWithComment.slice(0, commentIdx).trim();
      inlineComment = commandWithComment.slice(commentIdx + 3).trim();
    }

    const comment = inlineComment || pendingComment;
    const id = `syscron-${Buffer.from(trimmed).toString("base64url").slice(0, 16)}`;

    entries.push({
      id,
      expr,
      command,
      comment,
      raw: trimmed,
    });

    pendingComment = undefined;
  }

  return entries;
}

export async function GET() {
  try {
    // crontab -l returns exit 1 when no crontab exists, so redirect stderr
    const { stdout } = await execAsync("crontab -l 2>/dev/null || true", {
      timeout: 5000,
    });
    const entries = parseCrontab(stdout);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Failed to read crontab:", error);
    return NextResponse.json({ entries: [] });
  }
}
