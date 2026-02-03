"use client";

import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "@/components/status-ring";
import { SoulCard } from "@/components/soul-card";
import { CronTimeline } from "@/components/cron-timeline";
import { QuickAction, QuickActionsGrid } from "@/components/quick-action";
import { RefreshCw } from "lucide-react";
import {
  getCronJobs,
  getLastHeartbeat,
  getGatewayHealth,
  runCronJob,
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
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState<number | undefined>();
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<HeartbeatEvent | null>(null);
  const [soul, setSoul] = useState<string>("");
  const [soulLoading, setSoulLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningStandup, setRunningStandup] = useState(false);

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

  // Fetch SOUL.md content
  useEffect(() => {
    async function fetchSoul() {
      try {
        const res = await fetch("/api/workspace?file=SOUL.md");
        const data = await res.json();
        setSoul(data.content || "");
      } catch {
        setSoul("");
      } finally {
        setSoulLoading(false);
      }
    }
    fetchSoul();
  }, []);

  const handleRunStandup = async () => {
    const standupJob = cronJobs.find((j) =>
      j.name.toLowerCase().includes("standup")
    );
    if (!standupJob) return;
    
    setRunningStandup(true);
    try {
      await runCronJob(standupJob.id);
      await refresh();
    } catch (err) {
      console.error("Failed to run standup:", err);
    } finally {
      setRunningStandup(false);
    }
  };

  const uptimeStr = uptime ? formatUptime(uptime * 1000) : undefined;
  const heartbeatTime = lastHeartbeat?.ts
    ? formatRelativeTime(lastHeartbeat.ts)
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ClawdTM</h1>
          <p className="text-sm text-zinc-400">Command Center</p>
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

      {/* Status Card */}
      <StatusCard
        connected={connected}
        uptime={uptimeStr}
        lastHeartbeat={heartbeatTime}
      />

      {/* Soul Card */}
      <SoulCard content={soul} loading={soulLoading} />

      {/* Cron Timeline */}
      <CronTimeline jobs={cronJobs} loading={refreshing && cronJobs.length === 0} />

      {/* Quick Actions */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <QuickActionsGrid>
          <QuickAction
            icon="🔄"
            label="Refresh All"
            sublabel="Reload data"
            onClick={refresh}
            loading={refreshing}
          />
          <QuickAction
            icon="📊"
            label="Run Standup"
            sublabel="Daily standup"
            onClick={handleRunStandup}
            loading={runningStandup}
            disabled={!cronJobs.some((j) => j.name.toLowerCase().includes("standup"))}
          />
          <QuickAction
            icon="🔍"
            label="Review Skills"
            sublabel="Check moderation"
            onClick={async () => {
              try {
                await fetch("/api/exec", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ script: "review_skills.sh", args: ["5"] }),
                });
              } catch (err) {
                console.error("Failed to run script:", err);
              }
            }}
          />
          <QuickAction
            icon="📝"
            label="View Memory"
            sublabel="Today's notes"
            onClick={() => {
              window.location.href = "/memory";
            }}
          />
        </QuickActionsGrid>
      </section>
    </div>
  );
}
