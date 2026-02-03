"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StatusCard } from "@/components/status-ring";
import { SoulCard } from "@/components/soul-card";
import { CronTimeline } from "@/components/cron-timeline";
import { FavoritesGrid } from "@/components/favorites-grid";
import { AgentLevelBadge } from "@/components/agent-level";
import { RefreshCw, Sparkles } from "lucide-react";
import { useLocalStorage } from "@/lib/use-local-storage";
import {
  getCronJobs,
  getLastHeartbeat,
  getGatewayHealth,
  type CronJob,
  type HeartbeatEvent,
} from "@/lib/gateway-api";

function formatUptime(ms?: number): string {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function formatRelativeTime(ts?: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState<number | undefined>();
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<HeartbeatEvent | null>(null);
  const [soul, setSoul] = useState<string>("");
  const [soulLoading, setSoulLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [proposals, setProposals] = useState<string>("");
  
  // Favorites stored in localStorage
  const [favorites, setFavorites] = useLocalStorage<string[]>("pinned-scripts", []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [health, jobs, heartbeat] = await Promise.all([
        getGatewayHealth(),
        getCronJobs().catch(() => []),
        getLastHeartbeat(),
      ]);
      
      setConnected(health.connected);
      setUptime(health.uptime);
      setCronJobs(jobs);
      setLastHeartbeat(heartbeat);
    } catch (err) {
      console.error("Refresh failed:", err);
      setConnected(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Fetch SOUL.md and PROPOSALS.md content
  useEffect(() => {
    async function fetchWorkspaceFiles() {
      try {
        const [soulRes, proposalsRes] = await Promise.all([
          fetch("/api/workspace?file=SOUL.md"),
          fetch("/api/workspace?file=PROPOSALS.md").catch(() => null),
        ]);
        
        const soulData = await soulRes.json();
        setSoul(soulData.content || "");
        
        if (proposalsRes) {
          const proposalsData = await proposalsRes.json();
          setProposals(proposalsData.content || "");
        }
      } catch {
        setSoul("");
      } finally {
        setSoulLoading(false);
      }
    }
    fetchWorkspaceFiles();
  }, []);

  const handleRunScript = async (scriptName: string) => {
    try {
      await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptName }),
      });
    } catch (err) {
      console.error("Failed to run script:", err);
    }
  };

  const uptimeStr = uptime ? formatUptime(uptime * 1000) : undefined;
  const heartbeatTime = lastHeartbeat?.ts
    ? formatRelativeTime(lastHeartbeat.ts)
    : undefined;

  // Check if there are proposals
  const hasProposals = proposals.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🦞</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">ClawdTM</h1>
              <AgentLevelBadge uptimeSeconds={uptime} />
            </div>
            <p className="text-sm text-zinc-400">Command Center</p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      </header>

      {/* Status Card - Collapsible */}
      <StatusCard
        connected={connected}
        uptime={uptimeStr}
        lastHeartbeat={heartbeatTime}
        defaultCollapsed={false}
      />

      {/* Proposals Banner (if any) */}
      {hasProposals && (
        <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-xl border border-orange-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <span className="font-medium text-orange-200">Agent has ideas!</span>
          </div>
          <p className="text-sm text-zinc-300 line-clamp-2">
            {proposals.split("\n").find(l => l.trim() && !l.startsWith("#")) || "Check proposals..."}
          </p>
        </div>
      )}

      {/* Soul Card */}
      <SoulCard content={soul} loading={soulLoading} />

      {/* Upcoming Jobs */}
      <CronTimeline jobs={cronJobs} loading={refreshing && cronJobs.length === 0} />

      {/* Quick Actions - Favorites */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          {favorites.length > 0 && (
            <button
              onClick={() => router.push("/actions")}
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              Manage
            </button>
          )}
        </div>
        <FavoritesGrid
          favorites={favorites}
          onRun={handleRunScript}
          onManage={() => router.push("/actions")}
        />
      </section>
    </div>
  );
}
