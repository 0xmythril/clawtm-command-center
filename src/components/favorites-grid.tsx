"use client";

import { useState } from "react";
import { Play, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FavoriteScript {
  name: string;
}

interface FavoritesGridProps {
  favorites: string[];
  onRun: (scriptName: string) => Promise<void>;
  onManage: () => void;
}

export function FavoritesGrid({ favorites, onRun, onManage }: FavoritesGridProps) {
  const [running, setRunning] = useState<string | null>(null);

  const handleRun = async (name: string) => {
    setRunning(name);
    try {
      await onRun(name);
    } finally {
      setRunning(null);
    }
  };

  // Show up to 4 favorites
  const displayFavorites = favorites.slice(0, 4);
  const emptySlots = Math.max(0, 4 - displayFavorites.length);

  return (
    <div className="grid grid-cols-2 gap-3">
      {displayFavorites.map((name) => (
        <button
          key={name}
          onClick={() => handleRun(name)}
          disabled={running === name}
          className={cn(
            "flex items-center gap-3 p-4 rounded-xl border transition-all",
            "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700",
            "btn-press disabled:opacity-50"
          )}
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            {running === name ? (
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            ) : (
              <Play className="w-5 h-5 text-emerald-500" />
            )}
          </div>
          <div className="text-left min-w-0">
            <div className="font-medium text-sm truncate">
              {name.replace(".sh", "")}
            </div>
            <div className="text-xs text-zinc-500">Tap to run</div>
          </div>
        </button>
      ))}
      
      {/* Empty slots - prompt to add favorites */}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <button
          key={`empty-${i}`}
          onClick={onManage}
          className={cn(
            "flex items-center justify-center gap-2 p-4 rounded-xl border transition-all",
            "bg-zinc-900/50 border-zinc-800/50 border-dashed",
            "hover:bg-zinc-900 hover:border-zinc-700 text-zinc-500 hover:text-zinc-400"
          )}
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm">Add action</span>
        </button>
      ))}
    </div>
  );
}
