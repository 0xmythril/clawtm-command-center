"use client";

import { useState } from "react";
import { Heart, ChevronDown, ChevronUp, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

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
  defaultCollapsed?: boolean;
}

export function StatusCard({ 
  connected, 
  uptime, 
  lastHeartbeat,
  defaultCollapsed = false 
}: StatusCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Collapsed view - just icons and status
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-full bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-hover flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <StatusRing connected={connected} />
          </div>
          
          {/* Heartbeat */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Heart className={cn(
              "w-4 h-4",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span>{lastHeartbeat || "—"}</span>
          </div>
          
          {/* Uptime badge */}
          {uptime && (
            <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full text-zinc-400">
              {uptime}
            </span>
          )}
        </div>
        
        <ChevronDown className="w-5 h-5 text-zinc-500" />
      </button>
    );
  }

  // Expanded view
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {connected ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-500" />
          )}
          <StatusRing connected={connected} />
          <span className="font-medium">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-zinc-800 rounded transition-colors"
        >
          <ChevronUp className="w-5 h-5 text-zinc-500" />
        </button>
      </div>
      
      <div className="space-y-3 text-sm">
        {/* Uptime */}
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Uptime</span>
          <span className="font-mono text-zinc-200">{uptime || "—"}</span>
        </div>
        
        {/* Heartbeat with icon */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-zinc-400">
            <Heart className={cn(
              "w-4 h-4",
              lastHeartbeat && !lastHeartbeat.includes("d") 
                ? "text-red-400 animate-pulse" 
                : "text-zinc-600"
            )} />
            <span>Last heartbeat</span>
          </div>
          <span className="font-mono text-zinc-200">{lastHeartbeat || "—"}</span>
        </div>
      </div>
    </div>
  );
}
