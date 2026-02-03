"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SoulCardProps {
  content?: string;
  loading?: boolean;
}

export function SoulCard({ content, loading }: SoulCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
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
  const excerpt = meaningfulLines.slice(0, 2).join(" ").slice(0, 200);
  const hasMore = content && content.length > 200;

  // Format full content for expanded view
  const formattedContent = content
    ?.split("\n")
    .map((line) => {
      if (line.startsWith("# ")) {
        return { type: "h1", text: line.slice(2) };
      }
      if (line.startsWith("## ")) {
        return { type: "h2", text: line.slice(3) };
      }
      if (line.startsWith("### ")) {
        return { type: "h3", text: line.slice(4) };
      }
      if (line.startsWith("- ")) {
        return { type: "li", text: line.slice(2) };
      }
      if (line.trim() === "") {
        return { type: "br", text: "" };
      }
      return { type: "p", text: line };
    }) || [];

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 card-hover">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => hasMore && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🦞</span>
          <h3 className="font-semibold">Soul</h3>
        </div>
        {hasMore && (
          <button className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors">
            {expanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      
      {expanded ? (
        <div className="mt-4 space-y-2 text-sm text-zinc-300 leading-relaxed max-h-[60vh] overflow-y-auto">
          {formattedContent.map((line, i) => {
            if (line.type === "h1") {
              return <h1 key={i} className="text-xl font-bold text-zinc-100 mt-4 first:mt-0">{line.text}</h1>;
            }
            if (line.type === "h2") {
              return <h2 key={i} className="text-lg font-semibold text-zinc-200 mt-3">{line.text}</h2>;
            }
            if (line.type === "h3") {
              return <h3 key={i} className="text-base font-medium text-zinc-300 mt-2">{line.text}</h3>;
            }
            if (line.type === "li") {
              return <div key={i} className="flex gap-2 pl-2"><span className="text-orange-500">•</span><span>{line.text}</span></div>;
            }
            if (line.type === "br") {
              return <div key={i} className="h-2" />;
            }
            return <p key={i} className="text-zinc-400">{line.text}</p>;
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          {excerpt || "No soul content available."}
          {excerpt && excerpt.length >= 200 && "..."}
        </p>
      )}
    </div>
  );
}
