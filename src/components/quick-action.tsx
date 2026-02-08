"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface QuickActionProps {
  icon?: string;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "default" | "primary";
}

export function QuickAction({
  icon,
  label,
  sublabel,
  onClick,
  loading,
  disabled,
  variant = "default",
}: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "w-full min-h-[80px] rounded-xl border p-4 text-left transition-all btn-press",
        "flex flex-col justify-center",
        variant === "primary"
          ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20"
          : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800/80",
        "disabled:opacity-50 disabled:cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
        ) : (
          icon && <span className="text-xl">{icon}</span>
        )}
        <span className="font-medium">{label}</span>
      </div>
      {sublabel && (
        <span className="text-sm text-zinc-400 mt-1">{sublabel}</span>
      )}
    </button>
  );
}

interface QuickActionsGridProps {
  children: React.ReactNode;
}

export function QuickActionsGrid({ children }: QuickActionsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {children}
    </div>
  );
}
