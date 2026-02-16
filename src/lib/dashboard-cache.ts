"use client";

const CACHE_KEY = "cc:dashboard";
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // stale data shown for max 5 min

export interface DashboardData {
  health: { connected: boolean; uptime?: number };
  cronJobs: Array<Record<string, unknown>>;
  heartbeat: Record<string, unknown> | null;
  proposals: string;
  heartbeatMd: string;
  agentInfo: {
    name: string;
    model: string;
    provider: string;
    emoji: string;
    description: string;
    hasAvatar: boolean;
  };
  systemHealth: {
    system: {
      memoryUsedMb: number;
      memoryTotalMb: number;
      memoryPercent: number;
      loadAvg: number[];
      diskUsedMb: number;
    };
    sessions: { total: number; active: number };
    agent: { model: string; maxConcurrent: number };
  };
}

interface CachedDashboard {
  ts: number;
  data: DashboardData;
}

/** Read cached dashboard data from localStorage (instant paint). Returns null if expired or missing. */
export function readDashboardCache(): DashboardData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedDashboard = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_MAX_AGE_MS) return null;
    return cached.data;
  } catch {
    return null;
  }
}

/** Write dashboard data to localStorage cache. */
export function writeDashboardCache(data: DashboardData): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CachedDashboard = { ts: Date.now(), data };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}
