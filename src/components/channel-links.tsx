"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageCircle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelInfo {
  id: string;
  name: string;
  enabled: boolean;
  deepLink?: string;
  username?: string;
  icon: string;
}

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
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChannels() {
      try {
        const res = await fetch("/api/channels");
        const data = await res.json();
        setChannels(data.channels || []);
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
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold">Channels</h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold">Channels</h3>
        </div>
        <p className="text-sm text-zinc-400">No channels configured</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
      <div className="flex items-center gap-2 mb-4">
        <Radio className="w-5 h-5 text-orange-500" />
        <h3 className="font-semibold">Message Me On</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {channels.map((channel) => {
          const meta = channelMeta[channel.icon] || {
            color: "from-zinc-500/20 to-zinc-600/20",
            emoji: "📡",
          };

          if (channel.deepLink) {
            return (
              <a
                key={channel.id}
                href={channel.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl border transition-all",
                  "bg-gradient-to-br border-zinc-800 hover:border-zinc-700",
                  "btn-press",
                  meta.color
                )}
              >
                <span className="text-2xl">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{channel.name}</div>
                  {channel.username && (
                    <div className="text-xs text-zinc-400 truncate">
                      @{channel.username}
                    </div>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0" />
              </a>
            );
          }

          return (
            <div
              key={channel.id}
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl border",
                "bg-gradient-to-br border-zinc-800",
                meta.color
              )}
            >
              <span className="text-2xl">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{channel.name}</div>
                <div className="text-xs text-zinc-500">Active</div>
              </div>
              <MessageCircle className="w-4 h-4 text-zinc-500 shrink-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
