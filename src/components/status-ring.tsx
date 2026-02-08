"use client";

import { useState } from "react";
import { Heart, ChevronDown, ChevronUp, Wifi, WifiOff } from "lucide-react";
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

interface StatusCardProps {
  connected: boolean;
  uptime?: string;
  lastHeartbeat?: string;
  heartbeatText?: string;
  heartbeatSource?: string;
  defaultCollapsed?: boolean;
}

export function StatusCard({ 
  connected, 
  uptime, 
  lastHeartbeat,
  heartbeatText,
  heartbeatSource,
  defaultCollapsed = false 
}: StatusCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = () => setCollapsed(!collapsed);

  // Brief summary for collapsed view
  const heartbeatSummary = heartbeatText
    ? (() => {
        const lines = heartbeatText.split("\n").filter((l) => l.trim());
        const items = lines.filter((l) => l.startsWith("- ") || l.startsWith("## ") || l.startsWith("### "));
        if (items.length > 0) return `${items.length} items`;
        return "View details";
      })()
    : null;

  // Collapsed view - compact inline
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="w-full bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          {/* Connection status */}
          <div className="flex items-center gap-2 shrink-0">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <StatusRing connected={connected} />
          </div>
          
          {/* Heartbeat */}
          <div className="flex items-center gap-1.5 text-sm text-zinc-400 shrink-0">
            <Heart className={cn(
              "w-3.5 h-3.5",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span className="text-xs">{lastHeartbeat || "—"}</span>
          </div>
          
          {/* Uptime badge */}
          {uptime && (
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500 shrink-0">
              {uptime}
            </span>
          )}

          {/* Heartbeat summary */}
          {heartbeatSummary && (
            <span className="text-xs text-zinc-600 truncate hidden sm:inline">
              · {heartbeatSummary}
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
        <div className="flex items-center gap-3">
          {connected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <StatusRing connected={connected} />
          <span className="font-medium text-sm">
            {connected ? "Connected" : "Disconnected"}
          </span>
          {uptime && (
            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500">
              {uptime}
            </span>
          )}
        </div>
        <ChevronUp className="w-4 h-4 text-zinc-500" />
      </div>
      
      <div className="mt-3 space-y-2 text-sm">
        {/* Heartbeat with icon */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-zinc-400">
            <Heart className={cn(
              "w-3.5 h-3.5",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span className="text-xs">Last heartbeat</span>
          </div>
          <span className="font-mono text-xs text-zinc-300">{lastHeartbeat || "—"}</span>
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
      </div>
    </div>
  );
}
