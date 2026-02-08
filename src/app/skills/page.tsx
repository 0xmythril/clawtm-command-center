"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Puzzle, ChevronDown, ChevronUp, Info, Search, Shield,
  ShieldCheck, ShieldAlert, ShieldOff, Download, Trash2, ToggleLeft, ToggleRight,
  Loader2, Star, ExternalLink, X, CheckCircle, AlertTriangle,
  ArrowDownAZ, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSkillsStatus,
  enableSkill,
  disableSkill,
  uninstallSkill,
  type SkillStatusEntry,
} from "@/lib/gateway-api";

// ─────────────────────────────────────────────────────────────
// Store skill type (from ClawdTM Advisor API)
// ─────────────────────────────────────────────────────────────

interface StoreSkill {
  slug: string;
  name: string;
  description?: string;
  author?: string;
  downloads?: number;
  stars?: number;
  install_command?: string;
  clawdtm_url?: string;
  security: {
    score: number | null;
    risk: "low" | "medium" | "high" | "critical";
    flags: string[];
    last_scanned_at?: number;
  };
  community: {
    avg_rating?: number;
    review_count?: number;
    human_reviews?: number;
    bot_reviews?: number;
    clawdtm_upvotes?: number;
    clawdtm_downvotes?: number;
    is_verified?: boolean;
    is_featured?: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// Security flag descriptions
// ─────────────────────────────────────────────────────────────

const FLAG_DESCRIPTIONS: Record<string, string> = {
  remote_execution: "Downloads and runs external code",
  obfuscated_code: "Contains encoded/hidden code",
  sensitive_data_access: "Accesses credentials or sensitive files",
  shell_commands: "Executes shell commands",
  network_requests: "Makes external network requests",
  permission_escalation: "Requests elevated permissions",
  data_exfiltration: "May send local data externally",
  persistence: "Sets up persistent processes",
};

// ─────────────────────────────────────────────────────────────
// Sort options
// ─────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "stars", label: "Stars" },
  { value: "rating", label: "Rating" },
  { value: "recent", label: "Recent" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

// ─────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────

export default function SkillsPage() {
  // ── Installed tab state ──
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<"all" | "active" | "unavailable" | "disabled">("all");
  const [skillSearch, setSkillSearch] = useState("");

  // ── Browse tab state ──
  const [storeSkills, setStoreSkills] = useState<StoreSkill[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeSearched, setStoreSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [safeOnly, setSafeOnly] = useState(false);
  const [resultCount, setResultCount] = useState(0);
  const [expandedStoreSkill, setExpandedStoreSkill] = useState<string | null>(null);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

  // ── Risk-gated install modal ──
  const [installConfirm, setInstallConfirm] = useState<{
    skill: StoreSkill;
    acknowledged: boolean;
  } | null>(null);

  // ── Installed tab logic ──

  const refreshInstalled = useCallback(async () => {
    setRefreshing(true);
    try {
      const report = await getSkillsStatus();
      setSkills(report?.skills || []);
    } catch (err) {
      console.error("Failed to refresh:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  const handleToggleSkill = async (skillKey: string, currentlyDisabled: boolean) => {
    setBusySkill(skillKey);
    try {
      if (currentlyDisabled) {
        await enableSkill(skillKey);
      } else {
        await disableSkill(skillKey);
      }
      await refreshInstalled();
    } catch (err) {
      console.error("Failed to toggle skill:", err);
    } finally {
      setBusySkill(null);
    }
  };

  const handleUninstall = async (skillKey: string) => {
    setBusySkill(skillKey);
    try {
      await uninstallSkill(skillKey);
      setConfirmUninstall(null);
      await refreshInstalled();
    } catch (err) {
      console.error("Failed to uninstall skill:", err);
    } finally {
      setBusySkill(null);
    }
  };

  // ── Browse tab logic ──

  const searchStore = useCallback(async (query?: string, sort?: SortOption, safe?: boolean) => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const params = new URLSearchParams({ action: "search" });
      if (query) params.set("q", query);
      params.set("sort", sort || "relevance");
      if (safe) params.set("safe_only", "true");
      params.set("limit", "15");

      const res = await fetch(`/api/store?${params}`);
      const data = await res.json();
      if (data.error) {
        setStoreError(data.error);
        setStoreSkills([]);
        setResultCount(0);
      } else {
        setStoreSkills(data.results || []);
        setResultCount(data.result_count || 0);
      }
      setStoreSearched(true);
    } catch (err) {
      console.error("Store search failed:", err);
      setStoreError("Failed to connect to ClawdTM");
      setStoreSkills([]);
      setResultCount(0);
    } finally {
      setStoreLoading(false);
    }
  }, []);

  // ── Risk-gated install ──

  const handleInstallClick = (skill: StoreSkill) => {
    const risk = skill.security?.risk;
    const score = skill.security?.score;

    // Low risk (score >= 70): install directly
    if (risk === "low" && score !== null && score >= 70) {
      doInstall(skill.slug, false);
      return;
    }

    // Everything else: show confirmation modal
    setInstallConfirm({ skill, acknowledged: false });
  };

  const doInstall = async (slug: string, acknowledgeRisk: boolean) => {
    setInstallingSkill(slug);
    setInstallConfirm(null);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, acknowledge_risk: acknowledgeRisk }),
      });
      const data = await res.json();
      if (data.error) {
        setStoreError(`Install failed: ${data.error}`);
      } else if (data.fallback_command) {
        setStoreError(`No files available. Use CLI: ${data.fallback_command}`);
      } else {
        // Success - refresh installed skills
        await refreshInstalled();
      }
    } catch (err) {
      console.error("Failed to install skill:", err);
      setStoreError("Install failed");
    } finally {
      setInstallingSkill(null);
    }
  };

  // Check if a store skill is already installed
  const installedKeys = new Set(skills.map((s) => s.skillKey));

  const eligibleCount = skills.filter((s) => s.eligible && !s.disabled).length;
  const disabledCount = skills.filter((s) => s.disabled).length;
  const unavailableCount = skills.filter((s) => !s.eligible && !s.disabled).length;

  // Filter installed skills by search + status filter
  const filteredSkills = skills.filter((skill) => {
    // Status filter
    if (skillFilter === "active" && !(skill.eligible && !skill.disabled)) return false;
    if (skillFilter === "disabled" && !skill.disabled) return false;
    if (skillFilter === "unavailable" && !(!skill.eligible && !skill.disabled)) return false;

    // Name search
    if (skillSearch) {
      const q = skillSearch.toLowerCase();
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.skillKey.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Puzzle className="w-6 h-6 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Skills</h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              {skills.length} total · {eligibleCount} active · {unavailableCount} need deps
            </p>
          </div>
        </div>
        <button
          onClick={refreshInstalled}
          disabled={refreshing}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="installed" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900">
          <TabsTrigger value="installed" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm">
            <Puzzle className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            Installed<span className="hidden sm:inline"> ({skills.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="browse"
            className="data-[state=active]:bg-zinc-800"
          >
            <Search className="w-4 h-4 mr-2" />
            Browse
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* INSTALLED TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="installed" className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter skills by name..."
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "all" as const, label: "All", count: skills.length },
              { key: "active" as const, label: "Active", count: eligibleCount },
              { key: "unavailable" as const, label: "Unavailable", count: unavailableCount },
              { key: "disabled" as const, label: "Disabled", count: disabledCount },
            ] as const).map((chip) => (
              <button
                key={chip.key}
                onClick={() => setSkillFilter(chip.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs transition-colors border",
                  skillFilter === chip.key
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                )}
              >
                {chip.label} ({chip.count})
              </button>
            ))}
          </div>

          {/* Skills List */}
          <section className="space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
              </>
            ) : filteredSkills.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Puzzle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-medium">
                  {skillSearch
                    ? `No skills matching "${skillSearch}"`
                    : "No skills in this category"}
                </p>
                {skillSearch && (
                  <button
                    onClick={() => setSkillSearch("")}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mt-2"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500 px-1">
                  {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""}
                  {skillSearch && <span> matching &ldquo;{skillSearch}&rdquo;</span>}
                </p>
                {filteredSkills.map((skill) => (
                  <InstalledSkillCard
                    key={skill.skillKey}
                    skill={skill}
                    expanded={expandedSkill === skill.skillKey}
                    onToggleExpand={() =>
                      setExpandedSkill(expandedSkill === skill.skillKey ? null : skill.skillKey)
                    }
                    busy={busySkill === skill.skillKey}
                    onToggle={() => handleToggleSkill(skill.skillKey, skill.disabled)}
                    onUninstall={() => setConfirmUninstall(skill.skillKey)}
                  />
                ))}
              </>
            )}
          </section>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* BROWSE TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="browse" className="space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchStore(searchQuery || undefined, sortBy, safeOnly);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              />
            </div>
            <Button
              onClick={() => searchStore(searchQuery || undefined, sortBy, safeOnly)}
              disabled={storeLoading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4"
            >
              {storeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {/* Sort & filter controls (only after first search) */}
          {storeSearched && (
            <div className="flex items-center gap-3 flex-wrap">
              {/* Sort */}
              <div className="flex items-center gap-2">
                <ArrowDownAZ className="w-4 h-4 text-zinc-500" />
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const newSort = e.target.value as SortOption;
                    setSortBy(newSort);
                    searchStore(searchQuery || undefined, newSort, safeOnly);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Safe only toggle */}
              <button
                onClick={() => {
                  const newSafe = !safeOnly;
                  setSafeOnly(newSafe);
                  searchStore(searchQuery || undefined, sortBy, newSafe);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border",
                  safeOnly
                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
                Safe only
              </button>

              {/* Result count */}
              {!storeLoading && (
                <span className="text-xs text-zinc-500 ml-auto">
                  {resultCount} result{resultCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Info Banner (only after first search) */}
          {storeSearched && (
            <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Skills from{" "}
                <a
                  href="https://clawdtm.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  clawdtm.com
                </a>
                . Security scores are checked automatically. Look for{" "}
                <ShieldCheck className="w-3 h-3 inline text-green-400" /> verified skills.
              </span>
            </div>
          )}

          {/* Store Error */}
          {storeError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-300 break-words">{storeError}</p>
              </div>
              <button
                onClick={() => setStoreError(null)}
                className="p-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          )}

          {/* Store Results */}
          <section className="space-y-3">
            {storeLoading ? (
              <>
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
              </>
            ) : !storeSearched ? (
              /* ── Getting started / discovery view ── */
              <div className="space-y-4">
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 text-center">
                  <Puzzle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
                  <h3 className="font-semibold text-lg mb-1">Discover Skills</h3>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto">
                    Search the ClawdTM skill store to find new capabilities for your agent.
                    Type a keyword above or try one of these:
                  </p>
                </div>

                {/* Quick search suggestions */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "memory",
                    "messaging",
                    "automation",
                    "web",
                    "notes",
                    "email",
                    "discord",
                    "image",
                  ].map((query) => (
                    <button
                      key={query}
                      onClick={() => {
                        setSearchQuery(query);
                        setSortBy("relevance");
                        searchStore(query, "relevance", safeOnly);
                      }}
                      className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors capitalize"
                    >
                      {query}
                    </button>
                  ))}
                </div>

                {/* How it works */}
                <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-3">
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">How it works</h4>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                      <div>
                        <span className="text-zinc-300 font-medium">Search</span>
                        <span className="text-zinc-500"> — find skills by keyword or browse popular ones</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                      <div>
                        <span className="text-zinc-300 font-medium">Review</span>
                        <span className="text-zinc-500"> — check the security score, flags, and community ratings</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                      <div>
                        <span className="text-zinc-300 font-medium">Install</span>
                        <span className="text-zinc-500"> — one click to add the skill to your agent</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : storeSkills.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-medium">No skills found</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Try a different search{safeOnly ? " or disable the safe-only filter" : ""}
                </p>
              </div>
            ) : (
              storeSkills.map((skill) => {
                const isExpanded = expandedStoreSkill === skill.slug;
                const isInstalled = installedKeys.has(skill.slug);

                return (
                  <div
                    key={skill.slug}
                    className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 transition-all"
                  >
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => {
                        setExpandedStoreSkill(isExpanded ? null : skill.slug);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{skill.name}</h3>
                          {skill.community?.is_verified && (
                            <ShieldCheck className="w-4 h-4 text-green-400" aria-label="Verified" />
                          )}
                          {skill.community?.is_featured && (
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" aria-label="Featured" />
                          )}
                          {isInstalled && (
                            <Badge className="text-xs bg-green-500/20 text-green-400 border-0">
                              Installed
                            </Badge>
                          )}
                          <SecurityScoreBadge security={skill.security} />
                        </div>
                        <p className={cn("text-sm text-zinc-400 mt-1", !isExpanded && "line-clamp-2")}>
                          {skill.description || "No description"}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
                          {skill.author && <span>by {skill.author}</span>}
                          {skill.community?.avg_rating != null && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                              {skill.community.avg_rating.toFixed(1)}
                              {skill.community.review_count != null && (
                                <span className="text-zinc-600">({skill.community.review_count})</span>
                              )}
                            </span>
                          )}
                          {skill.downloads != null && (
                            <span className="flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              {skill.downloads.toLocaleString()}
                            </span>
                          )}
                          {(skill.community?.clawdtm_upvotes != null || skill.community?.clawdtm_downvotes != null) && (
                            <span>
                              +{skill.community?.clawdtm_upvotes || 0} / -{skill.community?.clawdtm_downvotes || 0}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isInstalled ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInstallClick(skill);
                            }}
                            disabled={installingSkill === skill.slug}
                            className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white"
                          >
                            {installingSkill === skill.slug ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-1" />
                                Install
                              </>
                            )}
                          </Button>
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-zinc-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
                        {/* Full description */}
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Description</div>
                          <p className="text-sm text-zinc-300 leading-relaxed">
                            {skill.description || "No description available"}
                          </p>
                        </div>

                        {/* Security details */}
                        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-zinc-300">Security</div>
                            <SecurityScoreBadge security={skill.security} showScore />
                          </div>
                          {skill.security?.flags && skill.security.flags.length > 0 ? (
                            <div className="space-y-1">
                              {skill.security.flags.map((flag) => (
                                <div key={flag} className="flex items-start gap-2 text-xs">
                                  <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="text-zinc-300 font-mono">{flag}</span>
                                    {FLAG_DESCRIPTIONS[flag] && (
                                      <span className="text-zinc-500"> — {FLAG_DESCRIPTIONS[flag]}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">No security flags</p>
                          )}
                          {skill.security?.last_scanned_at && (
                            <p className="text-xs text-zinc-600">
                              Last scanned: {new Date(skill.security.last_scanned_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        {/* Community stats */}
                        <div className="flex gap-4 flex-wrap text-xs">
                          {skill.community?.avg_rating != null && (
                            <div>
                              <span className="text-zinc-500">Rating: </span>
                              <span className="text-zinc-300">
                                {skill.community.avg_rating.toFixed(1)} / 5
                              </span>
                              {skill.community.review_count != null && (
                                <span className="text-zinc-500">
                                  {" "}({skill.community.human_reviews || 0} human, {skill.community.bot_reviews || 0} bot)
                                </span>
                              )}
                            </div>
                          )}
                          {skill.downloads != null && (
                            <div>
                              <span className="text-zinc-500">Downloads: </span>
                              <span className="text-zinc-300">{skill.downloads.toLocaleString()}</span>
                            </div>
                          )}
                          {skill.stars != null && (
                            <div>
                              <span className="text-zinc-500">Stars: </span>
                              <span className="text-zinc-300">{skill.stars}</span>
                            </div>
                          )}
                        </div>

                        {/* Links */}
                        <div className="flex gap-3 text-xs">
                          {skill.clawdtm_url && (
                            <a
                              href={skill.clawdtm_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                            >
                              View on ClawdTM <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Install Confirmation Modal (risk-gated) */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {installConfirm && (
        <InstallConfirmModal
          skill={installConfirm.skill}
          onClose={() => setInstallConfirm(null)}
          onConfirm={(acknowledgeRisk) => doInstall(installConfirm.skill.slug, acknowledgeRisk)}
          installing={installingSkill === installConfirm.skill.slug}
        />
      )}

      {/* Confirm Uninstall Modal */}
      {confirmUninstall && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-sm p-4 sm:p-5">
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="font-semibold text-lg mb-2">Uninstall Skill</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Are you sure you want to uninstall{" "}
              <strong className="text-zinc-200">{confirmUninstall}</strong>? This action cannot be
              undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmUninstall(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleUninstall(confirmUninstall)}
                disabled={busySkill === confirmUninstall}
              >
                {busySkill === confirmUninstall ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Uninstall"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Install Confirmation Modal (risk-gated)
// ─────────────────────────────────────────────────────────────

function InstallConfirmModal({
  skill,
  onClose,
  onConfirm,
  installing,
}: {
  skill: StoreSkill;
  onClose: () => void;
  onConfirm: (acknowledgeRisk: boolean) => void;
  installing: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const risk = skill.security?.risk;
  const score = skill.security?.score;
  const flags = skill.security?.flags || [];
  const isHighRisk = risk === "high" || risk === "critical";
  const isUnscanned = score === null;
  const needsAcknowledge = isHighRisk || isUnscanned;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-2 sm:hidden" />
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {isHighRisk ? (
              <ShieldAlert className="w-5 h-5 text-red-400" />
            ) : isUnscanned ? (
              <ShieldOff className="w-5 h-5 text-yellow-400" />
            ) : (
              <Shield className="w-5 h-5 text-yellow-400" />
            )}
            <h3 className="font-semibold">
              {isHighRisk ? "Security Warning" : isUnscanned ? "Unscanned Skill" : "Confirm Install"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Skill info */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{skill.name}</span>
              <SecurityScoreBadge security={skill.security} showScore />
            </div>
            {skill.author && (
              <p className="text-xs text-zinc-500">by {skill.author}</p>
            )}
            <p className="text-sm text-zinc-400 mt-2">{skill.description}</p>
          </div>

          {/* Risk explanation */}
          {isHighRisk && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-300 font-medium mb-2">
                This skill has a {risk} security risk (score: {score ?? "N/A"}/100)
              </p>
              <p className="text-xs text-zinc-400">
                Installing this skill is strongly discouraged. Review the security flags below carefully before proceeding.
              </p>
            </div>
          )}

          {isUnscanned && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-300 font-medium mb-1">
                Not yet scanned
              </p>
              <p className="text-xs text-zinc-400">
                This skill has not been security scanned yet. Proceed with caution.
              </p>
            </div>
          )}

          {!isHighRisk && !isUnscanned && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-300 font-medium mb-1">
                Medium risk (score: {score}/100)
              </p>
              <p className="text-xs text-zinc-400">
                This skill has some security flags. Review them below before installing.
              </p>
            </div>
          )}

          {/* Security flags */}
          {flags.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-zinc-400">Security Flags</div>
              {flags.map((flag) => (
                <div key={flag} className="flex items-start gap-2 text-xs bg-zinc-800/50 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-zinc-300 font-mono">{flag}</span>
                    {FLAG_DESCRIPTIONS[flag] && (
                      <p className="text-zinc-500 mt-0.5">{FLAG_DESCRIPTIONS[flag]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Acknowledge checkbox for high risk / unscanned */}
          {needsAcknowledge && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-xs text-zinc-400">
                I understand the risks and want to install this skill anyway
              </span>
            </label>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className={cn(
              "flex-1 text-white",
              isHighRisk
                ? "bg-red-500 hover:bg-red-600"
                : "bg-emerald-500 hover:bg-emerald-600"
            )}
            onClick={() => onConfirm(needsAcknowledge)}
            disabled={installing || (needsAcknowledge && !accepted)}
          >
            {installing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4 mr-1" />
                {isHighRisk ? "Install Anyway" : "Install"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Installed Skill Card Component
// ─────────────────────────────────────────────────────────────

function InstalledSkillCard({
  skill,
  expanded,
  onToggleExpand,
  busy,
  onToggle,
  onUninstall,
}: {
  skill: SkillStatusEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  busy: boolean;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const hasMissing =
    skill.missing &&
    ((skill.missing.bins?.length || 0) > 0 ||
      (skill.missing.env?.length || 0) > 0 ||
      (skill.missing.os?.length || 0) > 0);

  const isManaged = skill.source === "managed" || skill.source === "npm" || skill.source === "installed" || skill.source === "openclaw-workspace";
  const isBuiltin = skill.source === "builtin" || skill.source === "core" || skill.source === "openclaw-bundled";

  return (
    <div
      className={cn(
        "bg-zinc-900 rounded-xl border transition-all",
        expanded ? "p-4" : "px-3 py-2.5",
        skill.disabled ? "border-zinc-800/50 opacity-60" : "border-zinc-800"
      )}
    >
      {/* Compact single-line row */}
      <div
        className="flex items-center justify-between gap-2 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-base shrink-0">{skill.emoji || "🔧"}</span>
          <span className="font-medium text-sm truncate">{skill.name}</span>
          {hasMissing && (
            <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title="Missing dependencies" />
          )}
          {!hasMissing && skill.eligible && !skill.disabled && (
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          )}
          {skill.disabled && (
            <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
          )}
          {isBuiltin && (
            <span className="text-[10px] text-zinc-600">builtin</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={busy}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              skill.disabled
                ? "text-zinc-500 hover:text-green-400 hover:bg-green-500/10"
                : "text-green-400 hover:text-zinc-500 hover:bg-zinc-800"
            )}
            title={skill.disabled ? "Enable skill" : "Disable skill"}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : skill.disabled ? (
              <ToggleLeft className="w-4 h-4" />
            ) : (
              <ToggleRight className="w-4 h-4" />
            )}
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3 text-sm">
          <div>
            <div className="text-xs text-zinc-500 mb-1">What it does</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{skill.description}</p>
          </div>

          <div className="flex gap-4 flex-wrap text-xs">
            <div>
              <span className="text-zinc-500">Source: </span>
              <span className="text-zinc-400">{skill.source}</span>
            </div>
            <div>
              <span className="text-zinc-500">Key: </span>
              <code className="text-zinc-400 bg-zinc-800 px-1 rounded">{skill.skillKey}</code>
            </div>
          </div>

          {skill.requirements &&
            (skill.requirements.bins?.length || skill.requirements.env?.length) && (
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <div className="text-xs font-medium text-zinc-300 mb-1">Requirements</div>
                <div className="text-xs text-zinc-400 space-y-1">
                  {skill.requirements.bins?.length ? (
                    <div>
                      Binaries: <code className="text-zinc-300">{skill.requirements.bins.join(", ")}</code>
                    </div>
                  ) : null}
                  {skill.requirements.env?.length ? (
                    <div>
                      Env vars: <code className="text-zinc-300">{skill.requirements.env.join(", ")}</code>
                    </div>
                  ) : null}
                  {skill.requirements.os?.length ? (
                    <div>
                      OS: <code className="text-zinc-300">{skill.requirements.os.join(", ")}</code>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

          {hasMissing && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-xs font-medium text-red-400 mb-1">Missing Requirements</div>
              <div className="text-xs text-zinc-400 space-y-1">
                {skill.missing?.bins?.length ? (
                  <div>
                    Binaries: <code className="text-red-300">{skill.missing.bins.join(", ")}</code>
                  </div>
                ) : null}
                {skill.missing?.env?.length ? (
                  <div>
                    Env vars: <code className="text-red-300">{skill.missing.env.join(", ")}</code>
                  </div>
                ) : null}
                {skill.missing?.os?.length ? (
                  <div>
                    OS: <code className="text-red-300">{skill.missing.os.join(", ")}</code>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {isManaged && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                onClick={onUninstall}
                disabled={busy}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Uninstall
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Security Score Badge Component
// ─────────────────────────────────────────────────────────────

function SecurityScoreBadge({
  security,
  showScore,
}: {
  security?: StoreSkill["security"];
  showScore?: boolean;
}) {
  if (!security) return null;

  const { score, risk } = security;

  if (score === null) {
    return (
      <Badge className="text-xs border-0 gap-1 bg-zinc-500/20 text-zinc-400">
        <ShieldOff className="w-3 h-3" />
        Unscanned
      </Badge>
    );
  }

  const config = {
    low: { icon: ShieldCheck, text: "Low Risk", className: "bg-green-500/20 text-green-400" },
    medium: { icon: Shield, text: "Medium", className: "bg-yellow-500/20 text-yellow-400" },
    high: { icon: ShieldAlert, text: "High Risk", className: "bg-red-500/20 text-red-400" },
    critical: { icon: ShieldAlert, text: "Critical", className: "bg-red-600/30 text-red-300" },
  }[risk];

  if (!config) return null;

  return (
    <Badge className={cn("text-xs border-0 gap-1", config.className)}>
      <config.icon className="w-3 h-3" />
      {showScore ? `${config.text} (${score})` : config.text}
    </Badge>
  );
}
