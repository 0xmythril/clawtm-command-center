import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const SCRIPTS_DIR = process.env.SCRIPTS_PATH || "/home/clawdbot/.openclaw/workspace/scripts";

export async function GET() {
  try {
    const files = await fs.readdir(SCRIPTS_DIR);
    const scripts = files
      .filter((f) => f.endsWith(".sh"))
      .map((f) => ({
        name: f,
        path: path.join(SCRIPTS_DIR, f),
      }));

    // Read script info
    const scriptsWithInfo = await Promise.all(
      scripts.map(async (script) => {
        try {
          const content = await fs.readFile(script.path, "utf-8");
          const stat = await fs.stat(script.path);
          const lines = content.split("\n");
          
          // Collect all comment lines at the top (after shebang) as description
          const descriptionLines: string[] = [];
          let foundShebang = false;
          
          for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip empty lines at the start
            if (!trimmed && descriptionLines.length === 0) continue;
            
            // Skip shebang
            if (trimmed.startsWith("#!")) {
              foundShebang = true;
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
          const sizeKb = Math.round(stat.size / 1024 * 10) / 10;
          const lineCount = lines.length;
          
          return {
            name: script.name,
            description: description || "No description",
            lineCount,
            sizeKb,
            modifiedAt: stat.mtime.toISOString(),
          };
        } catch {
          return { 
            name: script.name, 
            description: "Unable to read script",
            lineCount: 0,
            sizeKb: 0,
          };
        }
      })
    );

    // Sort by name
    scriptsWithInfo.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ scripts: scriptsWithInfo });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list scripts", scripts: [] },
      { status: 500 }
    );
  }
}
