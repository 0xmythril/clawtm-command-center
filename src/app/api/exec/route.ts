import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execAsync = promisify(exec);

// Trusted script directories - only scripts from these dirs can be executed
const TRUSTED_SCRIPT_DIRS = [
  process.env.SCRIPTS_PATH || "/home/clawdbot/.openclaw/workspace/scripts",
  "/home/clawdbot/.openclaw/scripts",
];

const WORKSPACE_DIR = process.env.WORKSPACE_PATH || "/home/clawdbot/.openclaw/workspace";

// Find the script in one of the trusted directories
// Returns full path if found AND the script is a .sh file
async function findTrustedScript(scriptName: string): Promise<string | null> {
  // Security: Only allow .sh files
  if (!scriptName.endsWith(".sh")) {
    return null;
  }
  
  // Security: No path traversal
  const baseName = path.basename(scriptName);
  if (baseName !== scriptName || scriptName.includes("..")) {
    return null;
  }
  
  for (const dir of TRUSTED_SCRIPT_DIRS) {
    const scriptPath = path.join(dir, baseName);
    try {
      const stat = await fs.stat(scriptPath);
      if (stat.isFile()) {
        // Verify the resolved path is still within the trusted directory
        const realPath = await fs.realpath(scriptPath);
        const realDir = await fs.realpath(dir).catch(() => dir);
        if (realPath.startsWith(realDir)) {
          return scriptPath;
        }
      }
    } catch {
      // Script not in this directory, try next
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { script, args } = body as { script?: string; args?: string[] };

    if (!script) {
      return NextResponse.json(
        { error: "Script name required" },
        { status: 400 }
      );
    }

    // Find script in trusted directories
    const scriptPath = await findTrustedScript(script);
    if (!scriptPath) {
      return NextResponse.json(
        { error: `Script not found or not allowed: ${script}` },
        { status: 404 }
      );
    }

    // Build command with safe args
    const safeArgs = (args || [])
      .map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`)
      .join(" ");

    const command = `bash "${scriptPath}" ${safeArgs}`.trim();

    const { stdout, stderr } = await execAsync(command, {
      cwd: WORKSPACE_DIR,
      timeout: 60000, // 60 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    return NextResponse.json({
      success: true,
      stdout: stdout.slice(0, 10000), // Limit output size
      stderr: stderr.slice(0, 10000),
    });
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json({
      success: false,
      error: execError.message || "Execution failed",
      stdout: execError.stdout?.slice(0, 10000) || "",
      stderr: execError.stderr?.slice(0, 10000) || "",
    });
  }
}
