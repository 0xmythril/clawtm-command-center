import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const WORKSPACE_ROOT =
  process.env.WORKSPACE_PATH || "/home/clawdbot/.openclaw/workspace";
const AVATAR_FILENAME = "avatar.png";
const AVATAR_PATH = path.join(WORKSPACE_ROOT, AVATAR_FILENAME);

// Supported image types
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

const EXT_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

/**
 * GET /api/avatar — serve the bot's avatar image if it exists
 */
export async function GET() {
  // Check for avatar file with any supported extension
  const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
  for (const ext of extensions) {
    const filePath = path.join(
      WORKSPACE_ROOT,
      `avatar${ext}`
    );
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const data = await fs.readFile(filePath);
        const contentType =
          ext === ".svg"
            ? "image/svg+xml"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".webp"
                ? "image/webp"
                : ext === ".gif"
                  ? "image/gif"
                  : "image/png";
        return new NextResponse(data, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          },
        });
      }
    } catch {
      // try next extension
    }
  }

  return NextResponse.json({ error: "No avatar found" }, { status: 404 });
}

/**
 * POST /api/avatar — upload a new avatar image
 * Accepts multipart form data with a "file" field.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 2MB)" },
        { status: 400 }
      );
    }

    const ext = EXT_MAP[file.type] || ".png";
    const avatarPath = path.join(WORKSPACE_ROOT, `avatar${ext}`);

    // Remove old avatar files first
    const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
    for (const oldExt of extensions) {
      try {
        await fs.unlink(path.join(WORKSPACE_ROOT, `avatar${oldExt}`));
      } catch {
        // doesn't exist, fine
      }
    }

    // Write the new file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(avatarPath, buffer);

    // Try to sync with OpenClaw identity (best-effort)
    try {
      await execAsync(
        `openclaw agents set-identity --avatar "workspace/avatar${ext}" 2>/dev/null || true`,
        { timeout: 5000 }
      );
    } catch {
      // openclaw CLI might not be available, that's ok
    }

    return NextResponse.json({
      ok: true,
      path: `avatar${ext}`,
      size: file.size,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/avatar — remove the bot's avatar
 */
export async function DELETE() {
  const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
  let deleted = false;
  for (const ext of extensions) {
    try {
      await fs.unlink(path.join(WORKSPACE_ROOT, `avatar${ext}`));
      deleted = true;
    } catch {
      // doesn't exist
    }
  }

  return NextResponse.json({ ok: true, deleted });
}
