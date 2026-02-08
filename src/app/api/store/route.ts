import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const CLAWDTM_BASE = process.env.CLAWDTM_API_URL || "https://clawdtm.com/api/v1";
const SKILLS_DIR =
  process.env.SKILLS_PATH || "/home/clawdbot/.openclaw/skills";

// ─── Search skills (public, no auth) ─────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action") || "search";

  try {
    switch (action) {
      case "search":
      case "list": {
        const params = new URLSearchParams();
        const q = searchParams.get("q");
        // The ClawdTM API requires `q` -- use a broad wildcard when browsing without a query
        params.set("q", q || "");
        params.set("limit", searchParams.get("limit") || "15");
        const sort = searchParams.get("sort");
        if (sort) params.set("sort", sort);
        if (searchParams.get("safe_only") === "true") params.set("safe_only", "true");
        if (searchParams.get("include_risky") === "true") params.set("include_risky", "true");
        const minRating = searchParams.get("min_rating");
        if (minRating) params.set("min_rating", minRating);
        const category = searchParams.get("category");
        if (category) params.set("category", category);

        const url = `${CLAWDTM_BASE}/skills/search?${params}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
          return NextResponse.json(
            { error: data.error || "Search failed", results: [] },
            { status: res.status }
          );
        }

        return NextResponse.json({
          results: data.results || [],
          result_count: data.result_count || 0,
          query: data.query || "",
        });
      }

      case "install-info": {
        // Fetch install manifest (files + security) without writing to disk.
        // The client uses this to show the risk modal before confirming.
        const slug = searchParams.get("slug");
        if (!slug) {
          return NextResponse.json({ error: "slug required" }, { status: 400 });
        }

        const ackRisk = searchParams.get("acknowledge_risk") === "true";
        let url = `${CLAWDTM_BASE}/skills/install?slug=${encodeURIComponent(slug)}`;
        if (ackRisk) url += "&acknowledge_risk=true";

        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
          return NextResponse.json(
            { error: data.error || "Install fetch failed", security: data.security },
            { status: res.status }
          );
        }

        return NextResponse.json(data);
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("ClawdTM Advisor API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch from ClawdTM" },
      { status: 502 }
    );
  }
}

// ─── Install skill (write files to disk) ─────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, acknowledge_risk } = body as {
      slug: string;
      acknowledge_risk?: boolean;
    };

    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }

    // Fetch the install manifest from the Advisor API
    let url = `${CLAWDTM_BASE}/skills/install?slug=${encodeURIComponent(slug)}`;
    if (acknowledge_risk) url += "&acknowledge_risk=true";

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      return NextResponse.json(
        {
          error: data.error || "Install failed",
          security: data.security,
        },
        { status: res.status }
      );
    }

    // Write files to disk
    const files: Array<{ path: string; content: string }> = data.files;
    if (!files || files.length === 0) {
      // Fallback: no files returned, suggest CLI install
      return NextResponse.json({
        success: false,
        error: "No files returned from API. Use CLI: " + (data.skill?.install_command || `clawhub install ${slug}`),
        fallback_command: data.skill?.install_command || `clawhub install ${slug}`,
      });
    }

    const skillDir = path.join(SKILLS_DIR, slug);
    await fs.mkdir(skillDir, { recursive: true });

    const written: string[] = [];
    for (const file of files) {
      // Security: prevent path traversal
      const safeName = path.normalize(file.path).replace(/^(\.\.[/\\])+/, "");
      const filePath = path.join(skillDir, safeName);
      const resolvedDir = path.dirname(filePath);

      // Ensure the file stays within the skill directory
      if (!filePath.startsWith(skillDir)) {
        console.warn(`Skipping file with path traversal attempt: ${file.path}`);
        continue;
      }

      await fs.mkdir(resolvedDir, { recursive: true });
      await fs.writeFile(filePath, file.content, "utf-8");
      written.push(safeName);
    }

    return NextResponse.json({
      success: true,
      skill: data.skill,
      security: data.security,
      community: data.community,
      files_written: written,
      install_dir: skillDir,
    });
  } catch (error) {
    console.error("Skill install error:", error);
    return NextResponse.json(
      { error: "Failed to install skill" },
      { status: 500 }
    );
  }
}
