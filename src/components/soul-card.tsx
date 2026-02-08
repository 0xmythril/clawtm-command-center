"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";

interface SoulCardProps {
  content?: string;
  loading?: boolean;
}

export function SoulCard({ content, loading }: SoulCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🦞</span>
          <Skeleton className="h-5 w-20 skeleton-shimmer" />
        </div>
        <Skeleton className="h-4 w-full skeleton-shimmer mb-2" />
        <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
      </div>
    );
  }

  // Extract first meaningful paragraph from SOUL.md for preview
  const lines = content?.split("\n") || [];
  const meaningfulLines = lines.filter(
    (line) => line.trim() && !line.startsWith("#") && !line.startsWith("_")
  );
  const excerpt = meaningfulLines.slice(0, 3).join(" ").slice(0, 280);
  const hasMore = content && content.length > 280;

  const toggleExpanded = () => {
    if (hasMore) {
      setExpanded(!expanded);
    }
  };

  return (
    <div 
      onClick={toggleExpanded}
      className={`bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover ${hasMore ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🦞</span>
          <h3 className="font-semibold">Soul</h3>
        </div>
        {hasMore && (
          <div className="p-1 text-zinc-400">
            {expanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </div>
        )}
      </div>
      
      {expanded ? (
        <div 
          className="mt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <MarkdownContent
            content={content || ""}
            fileName="SOUL.md"
            maxHeight="60vh"
          />
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed line-clamp-3">
          {excerpt || "No soul content available."}
          {excerpt && excerpt.length >= 280 && "..."}
        </p>
      )}
    </div>
  );
}
