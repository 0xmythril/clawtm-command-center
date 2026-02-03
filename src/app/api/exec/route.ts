import { NextRequest, NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execAsync = promisify(exec);

const SCRIPTS_DIR = process.env.SCRIPTS_PATH || "/home/clawdbot/.openclaw/workspace/scripts";
const WORKSPACE_DIR = process.env.WORKSPACE_PATH || "/home/clawdbot/.openclaw/workspace";

// Allowed script patterns (security)
const ALLOWED_SCRIPTS = [
  "review_skills.sh",
  "hide_skill.sh",
  "add_audit_entry.sh",
  "clawdtm_notion_manager.sh",
];

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

    // Security: Only allow specific scripts
    const scriptName = path.basename(script);
    if (!ALLOWED_SCRIPTS.includes(scriptName)) {
      return NextResponse.json(
        { error: `Script not allowed: ${scriptName}` },
        { status: 403 }
      );
    }

    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    
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
