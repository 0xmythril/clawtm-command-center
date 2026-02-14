"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { StatusRing } from "@/components/status-ring";
import { StatusCard } from "@/components/status-ring";
import { CronTimeline } from "@/components/cron-timeline";
import { AgentLevelBadge } from "@/components/agent-level";
import { ChannelLinks } from "@/components/channel-links";
import { ContactsSummary } from "@/components/contacts-summary";
import { RefreshCw, Sparkles, Heart, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState<number | undefined>();
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<HeartbeatEvent | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [proposals, setProposals] = useState("");
  const [heartbeatMd, setHeartbeatMd] = useState("");
  const [agentInfo, setAgentInfo] = useState<{
    name?: string;
    model?: string;
    provider?: string;
    emoji?: string;
    description?: string;
    hasAvatar?: boolean;
  } | undefined>();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Avatar upload handler
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/avatar", { method: "POST", body: formData });
      if (res.ok) {
        // Bust cache with timestamp
        setAvatarUrl(`/api/avatar?t=${Date.now()}`);
        setAgentInfo(prev => prev ? { ...prev, hasAvatar: true } : prev);
      }
    } catch (err) {
      console.error("Avatar upload failed:", err);
    } finally {
      setAvatarUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Fetch PROPOSALS.md, HEARTBEAT.md, and agent info
  useEffect(() => {
    async function fetchWorkspaceFiles() {
      try {
        const [proposalsRes, heartbeatRes, agentRes] = await Promise.all([
          fetch("/api/workspace?file=PROPOSALS.md").catch(() => null),
          fetch("/api/workspace?file=HEARTBEAT.md").catch(() => null),
          fetch("/api/agent-info").catch(() => null),
        ]);
        
        if (proposalsRes) {
          const proposalsData = await proposalsRes.json();
          setProposals(proposalsData.content || "");
        }

        if (heartbeatRes) {
          const heartbeatData = await heartbeatRes.json();
          setHeartbeatMd(heartbeatData.content || "");
        }

        if (agentRes) {
          const agentData = await agentRes.json();
          setAgentInfo(agentData);
          if (agentData.hasAvatar) {
            setAvatarUrl(`/api/avatar?t=${Date.now()}`);
          }
        }
      } catch {
        // ignore
      }
    }
    fetchWorkspaceFiles();
  }, []);

  const uptimeStr = uptime ? formatUptime(uptime * 1000) : undefined;
  const heartbeatTime = lastHeartbeat?.ts
    ? formatRelativeTime(lastHeartbeat.ts)
    : undefined;

  // Check if there are proposals
  const hasProposals = proposals.trim().length > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Header - Bot identity with avatar */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar / Bot image — click to upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="relative group flex-shrink-0"
            title="Upload bot avatar"
          >
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={avatarUrl}
                alt={agentInfo?.name || "Bot"}
                className="w-11 h-11 rounded-full object-cover ring-2 ring-zinc-800 group-hover:ring-emerald-500/50 transition-all"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-zinc-800 ring-2 ring-zinc-700 group-hover:ring-emerald-500/50 transition-all flex items-center justify-center text-lg">
                {agentInfo?.emoji || "🤖"}
              </div>
            )}
            {/* Upload overlay on hover */}
            <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            {/* Loading spinner */}
            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-white animate-spin" />
              </div>
            )}
            {/* Connection dot overlay */}
            <StatusRing
              connected={connected}
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 ring-2 ring-[#0a0a0a]"
            />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {agentInfo?.name || "Agent"}
              </h1>
              <AgentLevelBadge uptimeSeconds={uptime} />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {uptimeStr && <span>Up {uptimeStr}</span>}
              {uptimeStr && heartbeatTime && <span>·</span>}
              {heartbeatTime && (
                <span className="flex items-center gap-1">
                  <Heart className={cn(
                    "w-3 h-3",
                    heartbeatTime && !heartbeatTime.includes("d")
                      ? "text-red-400 animate-pulse"
                      : "text-zinc-600"
                  )} />
                  {heartbeatTime}
                </span>
              )}
              {uptimeStr || heartbeatTime ? <span>·</span> : null}
              <span className="flex items-center gap-1 text-zinc-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-clawdTM-green.png" alt="" className="w-3 h-3 rounded-full opacity-60" />
                ClawdTM
              </span>
            </div>
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

      {/* Heartbeat / Instructions - collapsible, default collapsed */}
      <StatusCard
        connected={connected}
        uptime={uptimeStr}
        lastHeartbeat={heartbeatTime}
        heartbeatText={lastHeartbeat?.text || heartbeatMd}
        heartbeatSource={lastHeartbeat?.source}
        agentInfo={agentInfo}
        defaultCollapsed={true}
      />

      {/* Proposals Banner (if any) */}
      {hasProposals && (
        <div className="bg-gradient-to-r from-emerald-500/20 to-yellow-500/20 rounded-xl border border-emerald-500/30 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="font-medium text-sm text-emerald-200">Agent has ideas!</span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2">
            {proposals.split("\n").find(l => l.trim() && !l.startsWith("#")) || "Check proposals..."}
          </p>
        </div>
      )}

      {/* Channel Quick Links */}
      <ChannelLinks />

      {/* Contacts & Access */}
      <ContactsSummary />

      {/* Upcoming Jobs - only show if there are jobs */}
      {cronJobs.length > 0 && (
        <CronTimeline jobs={cronJobs} loading={refreshing && cronJobs.length === 0} />
      )}
    </div>
  );
}
