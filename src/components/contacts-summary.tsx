"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Summary {
  contactsCount: number;
  groupsCount: number;
  devicesCount: number;
  pendingPairingCount: number;
  pendingDevicesCount: number;
  suggestionCount?: number;
}

const CACHE_KEY = "cc:contacts-summary";
const CACHE_MAX_AGE = 3 * 60 * 1000;

export function ContactsSummary() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; data: Summary };
        if (Date.now() - cached.ts < CACHE_MAX_AGE) return cached.data;
      }
    } catch { /* ignore */ }
    return null;
  });
  const [loading, setLoading] = useState(summary === null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch("/api/contacts?summary=true");
        const data = await res.json();
        setSummary(data);
        try {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch { /* full */ }
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  const pendingTotal =
    (summary?.pendingPairingCount ?? 0) + (summary?.pendingDevicesCount ?? 0);
  const suggestionCount = summary?.suggestionCount ?? 0;

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-emerald-500" />
          <h3 className="font-semibold">Contacts & Access</h3>
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
      onClick={() => router.push("/contacts")}
      className={cn(
        "w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 card-hover",
        "flex items-center justify-between gap-4 transition-colors"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Users className="w-5 h-5 text-emerald-500 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-semibold">Contacts & Access</h3>
          <p className="text-sm text-zinc-400 mt-0.5">
            {summary
              ? `${summary.contactsCount} contacts · ${summary.groupsCount} groups · ${summary.devicesCount} devices`
              : "—"}
          </p>
        </div>
        {(pendingTotal > 0 || suggestionCount > 0) && (
          <span className="shrink-0 flex items-center gap-1.5">
            {pendingTotal > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                {pendingTotal} pending
              </span>
            )}
            {suggestionCount > 0 && (
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400"
                title="Bot merge suggestions"
              >
                {suggestionCount} suggestions
              </span>
            )}
          </span>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-zinc-500 shrink-0" />
    </button>
  );
}
