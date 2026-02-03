import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const MEMORY_DIR = process.env.MEMORY_PATH || "/home/clawdbot/.openclaw/workspace/memory";
const INTELLIGENCE_DIR = process.env.INTELLIGENCE_PATH || "/home/clawdbot/.openclaw/workspace/intelligence";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const file = searchParams.get("file");
  const type = searchParams.get("type") || "memory"; // "memory" or "intelligence"

  const baseDir = type === "intelligence" ? INTELLIGENCE_DIR : MEMORY_DIR;

  if (!file) {
    // List available memory/intelligence files
    try {
      const files = await fs.readdir(baseDir);
      const mdFiles = files
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) => b.localeCompare(a)); // Most recent first
      return NextResponse.json({ files: mdFiles, type });
    } catch (error) {
      return NextResponse.json({ files: [], type });
    }
  }

  // Security: Only allow .md files with date format
  const fileName = path.basename(file);
  if (!fileName.match(/^\d{4}-\d{2}-\d{2}\.md$/)) {
    return NextResponse.json(
      { error: "Invalid file name format" },
      { status: 400 }
    );
  }

  const safePath = path.join(baseDir, fileName);
  if (!safePath.startsWith(baseDir)) {
    return NextResponse.json(
      { error: "Invalid path" },
      { status: 400 }
    );
  }

  try {
    const content = await fs.readFile(safePath, "utf-8");
    return NextResponse.json({ file: fileName, content, type });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ file: fileName, content: "", type });
    }
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
