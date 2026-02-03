import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || "/home/clawdbot/.openclaw/workspace";

// Allowed files that can be read
const ALLOWED_FILES = [
  "SOUL.md",
  "IDENTITY.md",
  "MEMORY.md",
  "HEARTBEAT.md",
  "TOOLS.md",
  "USER.md",
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const file = searchParams.get("file");

  if (!file) {
    // List available files
    try {
      const files = await fs.readdir(WORKSPACE_ROOT);
      const mdFiles = files.filter(
        (f) => f.endsWith(".md") && ALLOWED_FILES.includes(f)
      );
      return NextResponse.json({ files: mdFiles });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to list workspace files" },
        { status: 500 }
      );
    }
  }

  // Security: Only allow specific files
  if (!ALLOWED_FILES.includes(file)) {
    return NextResponse.json(
      { error: "File not allowed" },
      { status: 403 }
    );
  }

  // Prevent path traversal
  const safePath = path.join(WORKSPACE_ROOT, path.basename(file));
  if (!safePath.startsWith(WORKSPACE_ROOT)) {
    return NextResponse.json(
      { error: "Invalid path" },
      { status: 400 }
    );
  }

  try {
    const content = await fs.readFile(safePath, "utf-8");
    return NextResponse.json({ file, content });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ file, content: "" });
    }
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}
