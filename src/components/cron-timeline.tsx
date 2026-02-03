"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Info } from "lucide-react";

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  state?: {
    nextRunAtMs?: number;
  };
}

interface CronTimelineProps {
  jobs: CronJob[];
  loading?: boolean;
}

function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = ms - now;
  if (diff < 0) return "now";
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function formatAbsoluteTime(ms: number): string {
  const date = new Date(ms);
  return date.toLocaleTimeString("en-US", { 
    hour: "numeric", 
    minute: "2-digit",
    hour12: true 
  });
}

export function CronTimeline({ jobs, loading }: CronTimelineProps) {
  const enabledJobs = jobs
    .filter((job) => job.enabled && job.state?.nextRunAtMs)
    .sort((a, b) => (a.state?.nextRunAtMs || 0) - (b.state?.nextRunAtMs || 0))
    .slice(0, 6);

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
        <h3 className="font-semibold mb-4">Upcoming Jobs</h3>
        <div className="h-16 skeleton-shimmer rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold">Upcoming Jobs</h3>
        <div className="group relative">
          <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-56 p-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 shadow-lg z-10">
            These are your next scheduled cron jobs sorted by when they will run. Tap the Cron tab for full details.
          </div>
        </div>
      </div>
      {enabledJobs.length === 0 ? (
        <p className="text-sm text-zinc-400">No scheduled jobs</p>
      ) : (
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-3 pb-2">
            {enabledJobs.map((job, index) => (
              <div
                key={job.id}
                className="flex-shrink-0 bg-zinc-800 rounded-lg px-4 py-3 min-w-[150px] relative"
              >
                {/* Timeline connector */}
                {index < enabledJobs.length - 1 && (
                  <div className="absolute right-0 top-1/2 w-3 h-0.5 bg-zinc-700 translate-x-full" />
                )}
                <div className="text-sm font-medium truncate max-w-[130px]">
                  {job.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs bg-orange-500/20 text-orange-400 border-0">
                    {formatRelativeTime(job.state!.nextRunAtMs!)}
                  </Badge>
                  <span className="text-xs text-zinc-500">
                    {formatAbsoluteTime(job.state!.nextRunAtMs!)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
