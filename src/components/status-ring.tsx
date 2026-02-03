"use client";

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
}

export function StatusCard({ connected, uptime, lastHeartbeat }: StatusCardProps) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
      <div className="flex items-center gap-3 mb-4">
        <StatusRing connected={connected} />
        <span className="font-medium">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="space-y-2 text-sm text-zinc-400">
        <div className="flex justify-between">
          <span>Uptime</span>
          <span className="font-mono text-zinc-200">{uptime || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span>Last heartbeat</span>
          <span className="font-mono text-zinc-200">{lastHeartbeat || "—"}</span>
        </div>
      </div>
    </div>
  );
}
