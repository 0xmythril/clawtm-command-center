"use client";

import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  fileName?: string;
  className?: string;
  maxHeight?: string;
}

/**
 * Shared component for rendering .md file content with a visually distinct
 * treatment (left border accent, subtle background, file label, mono font)
 * so users can tell where UI chrome ends and file content begins.
 */
export function MarkdownContent({
  content,
  fileName,
  className,
  maxHeight,
}: MarkdownContentProps) {
  const rendered = content.split("\n").map((line, i) => {
    if (line.startsWith("# ")) {
      return (
        <h1
          key={i}
          className="text-xs sm:text-sm font-bold text-zinc-100 mt-3 first:mt-0 mb-1"
        >
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2
          key={i}
          className="text-xs sm:text-sm font-semibold text-zinc-200 mt-2.5 mb-0.5"
        >
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("### ")) {
      return (
        <h3
          key={i}
          className="text-xs font-medium text-zinc-300 mt-2 mb-0.5"
        >
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <div key={i} className="flex gap-1.5 pl-1.5 py-px">
          <span className="text-emerald-500 shrink-0 text-[10px] leading-[18px]">•</span>
          <span className="text-zinc-300 break-words text-xs leading-relaxed">{line.slice(2)}</span>
        </div>
      );
    }
    if (line.trim() === "") {
      return <div key={i} className="h-1" />;
    }
    return (
      <p key={i} className="text-zinc-400 break-words py-px text-xs leading-relaxed">
        {line}
      </p>
    );
  });

  return (
    <div
      className={cn(
        "border-l-2 border-emerald-500/30 bg-zinc-950/50 rounded-r-lg pl-3 pr-2 py-2.5",
        "font-[family-name:var(--font-geist-mono)]",
        className
      )}
    >
      {fileName && (
        <div className="mb-1.5">
          <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/80 px-1.5 py-0.5 rounded">
            {fileName}
          </span>
        </div>
      )}
      <div
        className={cn(
          "leading-relaxed overflow-x-hidden md-scrollbar",
          maxHeight && "overflow-y-auto"
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {rendered}
      </div>
    </div>
  );
}
