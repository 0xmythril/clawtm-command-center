"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelInfo {
  id: string;
  name: string;
  enabled: boolean;
  deepLink?: string;
  username?: string;
  icon: string;
}

const CACHE_KEY = "cc:channels";
const CACHE_MAX_AGE = 3 * 60 * 1000;

// Channel brand colors & icons
const channelMeta: Record<string, { color: string; emoji: string }> = {
  telegram: { color: "from-sky-500/20 to-blue-500/20", emoji: "✈️" },
  discord: { color: "from-indigo-500/20 to-purple-500/20", emoji: "🎮" },
  slack: { color: "from-green-500/20 to-emerald-500/20", emoji: "💬" },
  whatsapp: { color: "from-green-500/20 to-lime-500/20", emoji: "📱" },
  signal: { color: "from-blue-500/20 to-sky-500/20", emoji: "🔒" },
  imessage: { color: "from-blue-500/20 to-cyan-500/20", emoji: "💬" },
};

export function ChannelLinks() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelInfo[]>(() => {
    // Hydrate from cache for instant paint
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; data: ChannelInfo[] };
        if (Date.now() - cached.ts < CACHE_MAX_AGE) return cached.data;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [loading, setLoading] = useState(channels.length === 0);

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch("/api/channels");
        const data = await res.json();
        const ch = data.channels || [];
        setChannels(ch);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: ch }));
        } catch { /* full */ }
      } catch {
        setChannels([]);
      } finally {
        setLoading(false);
      }
    }
    fetchChannels();
  }, []);

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-5 h-5 text-emerald-500" />
          <h3 className="font-semibold">Channels</h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.push("/contacts?tab=channels")}
      className={cn(
        "w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover",
        "transition-colors"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Radio className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold">Channels</h3>
            <p className="text-sm text-zinc-400 mt-0.5">
              {channels.length === 0
                ? "No channels configured"
                : `${channels.length} active`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {channels.length > 0 && (
            <div className="flex -space-x-1.5">
              {channels.slice(0, 4).map((ch) => {
                const meta = channelMeta[ch.icon] || { emoji: "📡" };
                return (
                  <span
                    key={ch.id}
                    className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm"
                    title={ch.name}
                  >
                    {meta.emoji}
                  </span>
                );
              })}
            </div>
          )}
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        </div>
      </div>
    </button>
  );
}
