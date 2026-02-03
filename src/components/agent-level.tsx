"use client";

import { cn } from "@/lib/utils";

interface AgentLevelProps {
  uptimeSeconds?: number;
  className?: string;
}

// Calculate level from uptime (1 day = 1 level, exponential scaling)
function calculateLevel(uptimeSeconds: number): { level: number; xp: number; xpToNext: number; progress: number } {
  const hours = uptimeSeconds / 3600;
  
  // Level thresholds in hours: 1h, 6h, 24h, 72h, 168h (1 week), 336h (2 weeks), etc.
  const thresholds = [1, 6, 24, 72, 168, 336, 720, 1440, 2880, 5760];
  
  let level = 1;
  let prevThreshold = 0;
  let nextThreshold = thresholds[0];
  
  for (let i = 0; i < thresholds.length; i++) {
    if (hours >= thresholds[i]) {
      level = i + 2;
      prevThreshold = thresholds[i];
      nextThreshold = thresholds[i + 1] || thresholds[i] * 2;
    } else {
      break;
    }
  }
  
  const xpInLevel = hours - prevThreshold;
  const xpNeeded = nextThreshold - prevThreshold;
  const progress = Math.min(100, (xpInLevel / xpNeeded) * 100);
  
  return {
    level,
    xp: Math.floor(hours),
    xpToNext: Math.floor(nextThreshold),
    progress,
  };
}

// Level titles
function getLevelTitle(level: number): string {
  const titles = [
    "Hatchling",      // 1
    "Young Claw",     // 2
    "Apprentice",     // 3
    "Journeyman",     // 4
    "Adept",          // 5
    "Expert",         // 6
    "Master",         // 7
    "Grand Master",   // 8
    "Legendary",      // 9
    "Mythical",       // 10+
  ];
  return titles[Math.min(level - 1, titles.length - 1)];
}

export function AgentLevel({ uptimeSeconds, className }: AgentLevelProps) {
  if (!uptimeSeconds) {
    return null;
  }
  
  const { level, progress } = calculateLevel(uptimeSeconds);
  const title = getLevelTitle(level);
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Level Badge */}
      <div className="relative">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-orange-500/20">
          {level}
        </div>
        {/* Progress ring */}
        <svg className="absolute inset-0 w-10 h-10 -rotate-90">
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="3"
          />
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="rgba(251,146,60,0.8)"
            strokeWidth="3"
            strokeDasharray={`${(progress / 100) * 113} 113`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
      </div>
      
      {/* Title */}
      <div className="hidden sm:block">
        <div className="text-xs text-zinc-400">Level {level}</div>
        <div className="text-sm font-medium text-orange-400">{title}</div>
      </div>
    </div>
  );
}

// Compact version for header
export function AgentLevelBadge({ uptimeSeconds, className }: AgentLevelProps) {
  if (!uptimeSeconds) {
    return null;
  }
  
  const { level } = calculateLevel(uptimeSeconds);
  const title = getLevelTitle(level);
  
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full",
        "bg-gradient-to-r from-orange-500/20 to-yellow-500/20",
        "border border-orange-500/30",
        className
      )}
    >
      <span className="text-orange-400 font-bold text-xs">Lv.{level}</span>
      <span className="text-zinc-400 text-xs hidden sm:inline">{title}</span>
    </div>
  );
}
