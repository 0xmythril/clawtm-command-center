"use client";

import { useState } from "react";
import { Heart, ChevronDown, ChevronUp, Wifi, WifiOff, Cpu, Bot, HardDrive, Activity, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";

interface StatusRingProps {
  connected: boolean;
  className?: string;
}

export function StatusRing({ connected, className }: StatusRingProps) {
  return (
    <div
      className={cn(
        "w-3 h-3 rounded-full",
        connected
          ? "bg-green-500 status-connected"
          : "bg-red-500 status-disconnected",
        className
      )}
    />
  );
}

interface AgentInfo {
  name?: string;
  model?: string;
  provider?: string;
  emoji?: string;
  description?: string;
}

export interface SystemHealth {
  system: {
    memoryUsedMb: number;
    memoryTotalMb: number;
    memoryPercent: number;
    loadAvg: number[];
    diskUsedMb: number;
  };
  sessions: {
    total: number;
    active: number;
  };
  agent: {
    model: string;
    maxConcurrent: number;
  };
}

interface StatusCardProps {
  connected: boolean;
  uptime?: string;
  lastHeartbeat?: string;
  heartbeatText?: string;
  heartbeatSource?: string;
  agentInfo?: AgentInfo;
  systemHealth?: SystemHealth | null;
  defaultCollapsed?: boolean;
}

export function StatusCard({ 
  connected, 
  uptime, 
  lastHeartbeat,
  heartbeatText,
  heartbeatSource,
  agentInfo,
  systemHealth,
  defaultCollapsed = false 
}: StatusCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => setCollapsed(!collapsed);

  // Better collapsed summary: show first instruction line or task count
  const heartbeatSummary = heartbeatText
    ? (() => {
        const lines = heartbeatText.split("\n").filter((l) => l.trim());
        // Find the first meaningful content line (not a heading)
        const firstContent = lines.find(
          (l) => !l.startsWith("#") && l.trim().length > 0
        );
        if (firstContent) {
          const clean = firstContent.replace(/^[- ]+/, "").trim();
          return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
        }
        return "View details";
      })()
    : null;

  // Collapsed view - show connection + model + heartbeat summary
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="w-full bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Connection dot */}
          <StatusRing connected={connected} className="shrink-0" />
          
          {/* Status label */}
          <span className="text-xs text-zinc-400 shrink-0">
            {connected ? "Online" : "Offline"}
          </span>

          {/* Divider */}
          <span className="text-zinc-700 shrink-0">·</span>
          
          {/* Model badge */}
          {agentInfo?.model && agentInfo.model !== "unknown" && (
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500 shrink-0 truncate max-w-[120px]">
              {agentInfo.model}
            </span>
          )}

          {/* Heartbeat */}
          <div className="flex items-center gap-1 shrink-0">
            <Heart className={cn(
              "w-3 h-3",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span className="text-[11px] text-zinc-500">{lastHeartbeat || "—"}</span>
          </div>

          {/* Summary preview */}
          {heartbeatSummary && (
            <span className="text-[11px] text-zinc-600 truncate hidden sm:block min-w-0">
              {heartbeatSummary}
            </span>
          )}
        </div>
        
        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0 ml-2" />
      </button>
    );
  }

  // Expanded view
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5">
      <div 
        onClick={toggleCollapsed}
        className="flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <StatusRing connected={connected} />
          <span className="font-medium text-sm">
            {connected ? "Connected" : "Disconnected"}
          </span>
          {uptime && (
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500">
              up {uptime}
            </span>
          )}
        </div>
        <ChevronUp className="w-4 h-4 text-zinc-500" />
      </div>
      
      <div className="mt-3 space-y-2">
        {/* Agent info row */}
        {agentInfo && (agentInfo.model !== "unknown" || agentInfo.description) && (
          <div className="flex flex-col gap-1.5 text-xs pb-2 border-b border-zinc-800">
            {agentInfo.model && agentInfo.model !== "unknown" && (
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400">Model</span>
                <span className="text-zinc-300 font-mono ml-auto">
                  {agentInfo.model}
                </span>
              </div>
            )}
            {agentInfo.provider && agentInfo.provider !== "unknown" && (
              <div className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400">Provider</span>
                <span className="text-zinc-300 font-mono ml-auto">
                  {agentInfo.provider}
                </span>
              </div>
            )}
            {agentInfo.description && (
              <div className="text-zinc-500 italic text-[11px] mt-0.5">
                {agentInfo.description}
              </div>
            )}
          </div>
        )}

        {/* Heartbeat row */}
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Heart className={cn(
              "w-3.5 h-3.5",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span>Last heartbeat</span>
          </div>
          <span className="font-mono text-zinc-300">{lastHeartbeat || "—"}</span>
        </div>

        {/* Heartbeat instructions/text */}
        {heartbeatText ? (
          <div className="pt-2">
            <MarkdownContent
              content={heartbeatText}
              fileName={heartbeatSource ? `via ${heartbeatSource}` : "HEARTBEAT.md"}
              maxHeight="12rem"
            />
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic pt-2 border-t border-zinc-800">
            No active instructions.
          </p>
        )}

        {/* System Health Section */}
        {systemHealth && (
          <div className="pt-3 mt-3 border-t border-zinc-800">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">System</span>
            </div>
            <div className="space-y-2.5">
              {/* Memory */}
              <div className="flex items-center gap-2 text-xs">
                <Cpu className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400 w-14 shrink-0">Memory</span>
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      systemHealth.system.memoryPercent < 60
                        ? "bg-emerald-500"
                        : systemHealth.system.memoryPercent < 80
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${Math.min(100, systemHealth.system.memoryPercent)}%` }}
                  />
                </div>
                <span className="text-zinc-500 font-mono shrink-0 w-28 text-right text-[11px]">
                  {systemHealth.system.memoryPercent}% ({(systemHealth.system.memoryUsedMb / 1024).toFixed(1)} / {(systemHealth.system.memoryTotalMb / 1024).toFixed(1)} GB)
                </span>
              </div>

              {/* Load Average */}
              <div className="flex items-center gap-2 text-xs">
                <Activity className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400 w-14 shrink-0">Load</span>
                <span className="text-zinc-300 font-mono">
                  {systemHealth.system.loadAvg.map((v) => v.toFixed(2)).join(" / ")}
                </span>
              </div>

              {/* Disk */}
              <div className="flex items-center gap-2 text-xs">
                <HardDrive className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400 w-14 shrink-0">Disk</span>
                <span className="text-zinc-300 font-mono">
                  {systemHealth.system.diskUsedMb >= 1024
                    ? `${(systemHealth.system.diskUsedMb / 1024).toFixed(1)} GB`
                    : `${systemHealth.system.diskUsedMb} MB`} used
                </span>
                <span className="text-zinc-600 text-[11px]">~/.openclaw/</span>
              </div>

              {/* Sessions */}
              <div className="flex items-center gap-2 text-xs">
                <Users className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-400 w-14 shrink-0">Sessions</span>
                <span className="text-zinc-300 font-mono">
                  {systemHealth.sessions.total} total
                </span>
                <span className="text-zinc-500">·</span>
                <span className={cn(
                  "font-mono",
                  systemHealth.sessions.active > 0 ? "text-emerald-400" : "text-zinc-500"
                )}>
                  {systemHealth.sessions.active} active
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
