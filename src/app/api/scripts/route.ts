import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

// Check both script locations
const SCRIPTS_DIRS = [
  process.env.SCRIPTS_PATH || "/home/clawdbot/.openclaw/workspace/scripts",
  "/home/clawdbot/.openclaw/scripts",
];

async function readScriptsFromDir(dir: string, source: string) {
  try {
    const files = await fs.readdir(dir);
    const scripts = files
      .filter((f) => f.endsWith(".sh"))
      .map((f) => ({
        name: f,
        path: path.join(dir, f),
        source,
      }));

    return await Promise.all(
      scripts.map(async (script) => {
        try {
          const content = await fs.readFile(script.path, "utf-8");
          const stat = await fs.stat(script.path);
          const lines = content.split("\n");

          // Collect all comment lines at the top (after shebang) as description
          const descriptionLines: string[] = [];

          for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines at the start
            if (!trimmed && descriptionLines.length === 0) continue;

            // Skip shebang
            if (trimmed.startsWith("#!")) {
              continue;
            }

            // Collect comment lines as description
            if (trimmed.startsWith("#")) {
              const commentText = trimmed.slice(1).trim();
              if (commentText) {
                descriptionLines.push(commentText);
              }
            } else if (trimmed) {
              // Stop at first non-comment, non-empty line
              break;
            }
          }

          const description = descriptionLines.slice(0, 3).join(" "); // Max 3 lines
          const sizeKb = Math.round((stat.size / 1024) * 10) / 10;
          const lineCount = lines.length;

          return {
            name: script.name,
            description: description || "No description",
            lineCount,
            sizeKb,
            modifiedAt: stat.mtime.toISOString(),
            source: script.source,
            fullPath: script.path,
          };
        } catch {
          return {
            name: script.name,
            description: "Unable to read script",
            lineCount: 0,
            sizeKb: 0,
            source: script.source,
            fullPath: script.path,
          };
        }
      })
    );
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }
}

export async function GET() {
  try {
    // Read scripts from both directories
    const [workspaceScripts, openclawScripts] = await Promise.all([
      readScriptsFromDir(SCRIPTS_DIRS[0], "workspace"),
      readScriptsFromDir(SCRIPTS_DIRS[1], "openclaw"),
    ]);

    // Combine and dedupe (workspace takes priority if same name exists)
    const allScripts = [...workspaceScripts];
    const workspaceNames = new Set(workspaceScripts.map((s) => s.name));

    for (const script of openclawScripts) {
      if (!workspaceNames.has(script.name)) {
        allScripts.push(script);
      }
    }

    // Sort by name
    allScripts.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ scripts: allScripts });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list scripts", scripts: [] },
      { status: 500 }
    );
  }
}
