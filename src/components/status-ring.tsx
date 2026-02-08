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

  // Collapsed view - just icons and status
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="w-full bg-zinc-900 rounded-xl border border-zinc-800 p-4 card-hover flex items-center justify-between cursor-pointer"
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

  // Expanded view - entire card is clickable
  return (
    <div 
      onClick={toggleCollapsed}
      className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover cursor-pointer"
    >
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
        <ChevronUp className="w-5 h-5 text-zinc-500" />
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

        {/* Heartbeat instructions/text OR heartbeat details */}
        {heartbeatText ? (
          <div className="pt-2 border-t border-zinc-800">
            <div className="flex items-start gap-2 mb-1">
              <span className="text-zinc-400 text-xs">
                {heartbeatSource ? "Instructions" : "Daily Tasks"}
              </span>
              {heartbeatSource && (
                <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-500">
                  {heartbeatSource}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {heartbeatText}
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 italic">
              No active instructions. Heartbeat is running on interval.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
