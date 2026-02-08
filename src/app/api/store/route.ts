import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";

const CREDENTIALS_PATH =
  process.env.CLAWDTM_CREDENTIALS || "/home/clawdbot/.config/clawdtm/credentials.json";
const CLAWDTM_BASE = process.env.CLAWDTM_API_URL || "https://clawdtm.com/api/v1";

async function getApiKey(): Promise<string | null> {
  // Prefer env var
  if (process.env.CLAWDTM_API_KEY) return process.env.CLAWDTM_API_KEY;

  try {
    const raw = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(raw);
    return creds.api_key || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ClawdTM API key not configured" },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action") || "list";
  const slug = searchParams.get("slug");
  const query = searchParams.get("q");
  const filter = searchParams.get("filter") || "combined";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    let url: string;

    switch (action) {
      case "details":
        if (!slug) {
          return NextResponse.json({ error: "slug required" }, { status: 400 });
        }
        url = `${CLAWDTM_BASE}/skills?slug=${encodeURIComponent(slug)}`;
        break;

      case "reviews":
        if (!slug) {
          return NextResponse.json({ error: "slug required" }, { status: 400 });
        }
        url = `${CLAWDTM_BASE}/skills/reviews?slug=${encodeURIComponent(slug)}&filter=${filter}`;
        break;

      case "list":
      default:
        // Build query params for listing/searching
        url = `${CLAWDTM_BASE}/skills`;
        if (query) {
          url += `?q=${encodeURIComponent(query)}`;
        }
        break;
    }

    const res = await fetch(url, { headers });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("ClawdTM API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch from ClawdTM" },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ClawdTM API key not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { action, slug, ...rest } = body as {
    action: string;
    slug?: string;
    [key: string]: unknown;
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    let url: string;
    let method = "POST";

    switch (action) {
      case "upvote":
        url = `${CLAWDTM_BASE}/skills/upvote`;
        break;
      case "downvote":
        url = `${CLAWDTM_BASE}/skills/downvote`;
        break;
      case "remove-vote":
        url = `${CLAWDTM_BASE}/skills/vote`;
        method = "DELETE";
        break;
      case "review":
        url = `${CLAWDTM_BASE}/skills/reviews`;
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify({ slug, ...rest }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("ClawdTM API error:", error);
    return NextResponse.json(
      { error: "Failed to contact ClawdTM" },
      { status: 502 }
    );
  }
}
