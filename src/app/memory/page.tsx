"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, Calendar, Puzzle, FileText, Info, User, Flame, Search,
  Shield, ShieldCheck, ShieldAlert, ShieldOff, Download, Trash2,
  ToggleLeft, ToggleRight, Loader2, Star, ExternalLink, X, CheckCircle,
  AlertTriangle, ArrowDownAZ, Filter, ChevronDown, ChevronUp, Settings,
  Eye, EyeOff, Save, RotateCcw, Code, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/markdown-content";
import {
  getSkillsStatus,
  enableSkill,
  disableSkill,
  uninstallSkill,
  type SkillStatusEntry,
} from "@/lib/gateway-api";

// ─── Types ──────────────────────────────────────────────────────────────

interface MemoryFile {
  name: string;
  date: string;
}

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

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Downloads" },
  { value: "stars", label: "Stars" },
  { value: "rating", label: "Rating" },
  { value: "recent", label: "Recent" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

// ─── Main Page ──────────────────────────────────────────────────────────

export default function MemoryPage() {
  return (
    <Suspense>
      <MemoryPageInner />
    </Suspense>
  );
}

function MemoryPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "daily";

  const [activeTab, setActiveTab] = useState(initialTab);

  // ── Memory state ──
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [longTermMemory, setLongTermMemory] = useState<string>("");
  const [userMd, setUserMd] = useState<string>("");
  const [soulMd, setSoulMd] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"memory">("memory");
  const [coreSection, setCoreSection] = useState<"memory" | "user">("memory");
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);

  // ── Skills state ──
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [refreshingSkills, setRefreshingSkills] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [busySkill, setBusySkill] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<"all" | "active" | "unavailable" | "disabled">("all");
  const [skillSearch, setSkillSearch] = useState("");

  // ── Browse store state ──
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
  const [installConfirm, setInstallConfirm] = useState<{ skill: StoreSkill; acknowledged: boolean } | null>(null);

  // ─── Memory data fetching ────────────────────────────────────────────

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const [memoryRes, longTermRes, userRes, soulRes] = await Promise.all([
        fetch("/api/memory?type=memory"),
        fetch("/api/workspace?file=MEMORY.md"),
        fetch("/api/workspace?file=USER.md"),
        fetch("/api/workspace?file=SOUL.md"),
      ]);

      const memoryData = await memoryRes.json();
      const longTermData = await longTermRes.json();
      const userData = await userRes.json();
      const soulData = await soulRes.json();

      const parseFiles = (files: string[]): MemoryFile[] =>
        files
          .map((f) => ({ name: f, date: f.replace(".md", "") }))
          .sort((a, b) => b.date.localeCompare(a.date));

      setMemoryFiles(parseFiles(memoryData.files || []));
      setLongTermMemory(longTermData.content || "");
      setUserMd(userData.content || "");
      setSoulMd(soulData.content || "");

      const today = new Date().toISOString().split("T")[0];
      const todayFile = `${today}.md`;
      if (memoryData.files?.includes(todayFile)) {
        setSelectedFile(todayFile);
        setSelectedType("memory");
      } else if (memoryData.files?.length > 0) {
        const sorted = [...memoryData.files].sort().reverse();
        setSelectedFile(sorted[0]);
        setSelectedType("memory");
      }
    } catch {
      setMemoryFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileContent = async (file: string, type: "memory") => {
    setContentLoading(true);
    try {
      const res = await fetch(`/api/memory?file=${file}&type=${type}`);
      const data = await res.json();
      setFileContent(data.content || "");
    } catch {
      setFileContent("");
    } finally {
      setContentLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (selectedFile) {
      fetchFileContent(selectedFile, selectedType);
    }
  }, [selectedFile, selectedType]);

  // ─── Skills data fetching ────────────────────────────────────────────

  const refreshInstalled = useCallback(async () => {
    setRefreshingSkills(true);
    try {
      const report = await getSkillsStatus();
      setSkills(report?.skills || []);
    } catch (err) {
      console.error("Failed to refresh skills:", err);
    } finally {
      setSkillsLoading(false);
      setRefreshingSkills(false);
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

  const handleInstallClick = (skill: StoreSkill) => {
    const risk = skill.security?.risk;
    const score = skill.security?.score;
    if (risk === "low" && score !== null && score >= 70) {
      doInstall(skill.slug, false);
      return;
    }
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
        await refreshInstalled();
      }
    } catch (err) {
      console.error("Failed to install skill:", err);
      setStoreError("Install failed");
    } finally {
      setInstallingSkill(null);
    }
  };

  // ─── Computed values ────────────────────────────────────────────────

  const installedKeys = new Set(skills.map((s) => s.skillKey));
  const eligibleCount = skills.filter((s) => s.eligible && !s.disabled).length;
  const disabledCount = skills.filter((s) => s.disabled).length;
  const unavailableCount = skills.filter((s) => !s.eligible && !s.disabled).length;

  const filteredSkills = skills
    .filter((skill) => {
      if (skillFilter === "active" && !(skill.eligible && !skill.disabled)) return false;
      if (skillFilter === "disabled" && !skill.disabled) return false;
      if (skillFilter === "unavailable" && !(!skill.eligible && !skill.disabled)) return false;
      if (skillSearch) {
        const q = skillSearch.toLowerCase();
        return (
          skill.name.toLowerCase().includes(q) ||
          skill.skillKey.toLowerCase().includes(q) ||
          skill.description.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Custom/workspace skills first, then managed, then bundled
      const sourceOrder = (s: string) =>
        s === "openclaw-workspace" ? 0 :
        s === "managed" || s === "npm" || s === "installed" ? 1 :
        2; // openclaw-bundled and others
      const oa = sourceOrder(a.source);
      const ob = sourceOrder(b.source);
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });

  // ─── Helpers ────────────────────────────────────────────────────────

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (dateStr === today.toISOString().split("T")[0]) return "Today";
      if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday";
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchFiles(), refreshInstalled()]);
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Memory</h1>
          <p className="text-sm text-zinc-400">
            Daily notes, skills & configuration
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || refreshingSkills}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw
            className={`w-5 h-5 ${loading || refreshingSkills ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 bg-zinc-900">
          <TabsTrigger value="daily" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <Calendar className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Daily</span>
          </TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <Puzzle className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Skills</span>
          </TabsTrigger>
          <TabsTrigger value="longterm" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <FileText className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Core</span>
          </TabsTrigger>
          <TabsTrigger value="soul" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <Flame className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Soul</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <Settings className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Config</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* DAILY MEMORY */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-4">
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong className="text-zinc-400">Daily Notes</strong> — One file per day containing observations,
              thoughts, and activities. Newest dates shown first.
            </span>
          </div>

          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <div className="flex gap-2">
              {loading ? (
                <>
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                  <Skeleton className="h-10 w-24 skeleton-shimmer rounded-lg" />
                </>
              ) : memoryFiles.length === 0 ? (
                <p className="text-sm text-zinc-400">No daily notes yet</p>
              ) : (
                memoryFiles.map((file) => (
                  <button
                    key={file.name}
                    onClick={() => {
                      setSelectedFile(file.name);
                      setSelectedType("memory");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm transition-colors shrink-0",
                      selectedFile === file.name && selectedType === "memory"
                        ? "bg-emerald-500 text-white"
                        : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                    )}
                  >
                    {formatDate(file.date)}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 overflow-hidden">
            {contentLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
                <Skeleton className="h-4 w-5/6 skeleton-shimmer" />
              </div>
            ) : fileContent && selectedType === "memory" ? (
              <MarkdownContent
                content={fileContent}
                fileName={selectedFile || undefined}
              />
            ) : (
              <p className="text-zinc-400 text-sm">Select a date to view notes</p>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SKILLS (moved from /skills) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="skills" className="space-y-4">
          {/* Sub-tabs: Installed / Browse */}
          <SkillsSection
            skills={skills}
            filteredSkills={filteredSkills}
            skillsLoading={skillsLoading}
            refreshingSkills={refreshingSkills}
            expandedSkill={expandedSkill}
            setExpandedSkill={setExpandedSkill}
            busySkill={busySkill}
            skillFilter={skillFilter}
            setSkillFilter={setSkillFilter}
            skillSearch={skillSearch}
            setSkillSearch={setSkillSearch}
            eligibleCount={eligibleCount}
            unavailableCount={unavailableCount}
            disabledCount={disabledCount}
            onToggleSkill={handleToggleSkill}
            onUninstall={(key) => setConfirmUninstall(key)}
            // Browse
            storeSkills={storeSkills}
            storeLoading={storeLoading}
            storeSearched={storeSearched}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortBy={sortBy}
            setSortBy={setSortBy}
            safeOnly={safeOnly}
            setSafeOnly={setSafeOnly}
            resultCount={resultCount}
            expandedStoreSkill={expandedStoreSkill}
            setExpandedStoreSkill={setExpandedStoreSkill}
            installingSkill={installingSkill}
            storeError={storeError}
            setStoreError={setStoreError}
            installedKeys={installedKeys}
            onSearchStore={searchStore}
            onInstallClick={handleInstallClick}
          />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CORE (long-term memory) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="longterm" className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setCoreSection("memory")}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                coreSection === "memory"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
              )}
            >
              <FileText className="w-4 h-4" />
              MEMORY.md
            </button>
            <button
              onClick={() => setCoreSection("user")}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                coreSection === "user"
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
              )}
            >
              <User className="w-4 h-4" />
              USER.md
            </button>
          </div>

          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 overflow-hidden">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
                <Skeleton className="h-4 w-5/6 skeleton-shimmer" />
              </div>
            ) : coreSection === "memory" ? (
              longTermMemory ? (
                <MarkdownContent content={longTermMemory} fileName="MEMORY.md" />
              ) : (
                <p className="text-zinc-400 text-sm">No long-term memory configured</p>
              )
            ) : (
              userMd ? (
                <MarkdownContent content={userMd} fileName="USER.md" />
              ) : (
                <p className="text-zinc-400 text-sm">No user profile configured</p>
              )
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SOUL */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="soul" className="space-y-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 overflow-hidden">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
                <Skeleton className="h-4 w-5/6 skeleton-shimmer" />
              </div>
            ) : soulMd ? (
              <MarkdownContent content={soulMd} fileName="SOUL.md" />
            ) : (
              <p className="text-zinc-400 text-sm">No soul file configured</p>
            )}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CONFIG */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="config" className="space-y-4">
          <ConfigEditor />
        </TabsContent>
      </Tabs>

      {/* ─── Modals ───────────────────────────────────────────────────── */}

      {installConfirm && (
        <InstallConfirmModal
          skill={installConfirm.skill}
          onClose={() => setInstallConfirm(null)}
          onConfirm={(acknowledgeRisk) => doInstall(installConfirm.skill.slug, acknowledgeRisk)}
          installing={installingSkill === installConfirm.skill.slug}
        />
      )}

      {confirmUninstall && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-sm p-4 sm:p-5">
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="font-semibold text-lg mb-2">Uninstall Skill</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Are you sure you want to uninstall{" "}
              <strong className="text-zinc-200">{confirmUninstall}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmUninstall(null)}>
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

// ─── Skills Section Component ─────────────────────────────────────────

function SkillsSection({
  skills, filteredSkills, skillsLoading, expandedSkill, setExpandedSkill,
  busySkill, skillFilter, setSkillFilter, skillSearch, setSkillSearch,
  eligibleCount, unavailableCount, disabledCount, onToggleSkill, onUninstall,
  storeSkills, storeLoading, storeSearched, searchQuery, setSearchQuery,
  sortBy, setSortBy, safeOnly, setSafeOnly, resultCount,
  expandedStoreSkill, setExpandedStoreSkill, installingSkill, storeError, setStoreError,
  installedKeys, onSearchStore, onInstallClick,
}: {
  skills: SkillStatusEntry[];
  filteredSkills: SkillStatusEntry[];
  skillsLoading: boolean;
  refreshingSkills: boolean;
  expandedSkill: string | null;
  setExpandedSkill: (v: string | null) => void;
  busySkill: string | null;
  skillFilter: "all" | "active" | "unavailable" | "disabled";
  setSkillFilter: (v: "all" | "active" | "unavailable" | "disabled") => void;
  skillSearch: string;
  setSkillSearch: (v: string) => void;
  eligibleCount: number;
  unavailableCount: number;
  disabledCount: number;
  onToggleSkill: (key: string, disabled: boolean) => void;
  onUninstall: (key: string) => void;
  storeSkills: StoreSkill[];
  storeLoading: boolean;
  storeSearched: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  safeOnly: boolean;
  setSafeOnly: (v: boolean) => void;
  resultCount: number;
  expandedStoreSkill: string | null;
  setExpandedStoreSkill: (v: string | null) => void;
  installingSkill: string | null;
  storeError: string | null;
  setStoreError: (v: string | null) => void;
  installedKeys: Set<string>;
  onSearchStore: (q?: string, sort?: SortOption, safe?: boolean) => void;
  onInstallClick: (skill: StoreSkill) => void;
}) {
  const [skillsTab, setSkillsTab] = useState<"installed" | "browse">("installed");

  return (
    <div className="space-y-4">
      {/* Skills sub-nav */}
      <div className="flex gap-2">
        <button
          onClick={() => setSkillsTab("installed")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            skillsTab === "installed"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
          )}
        >
          <Puzzle className="w-4 h-4" />
          Installed ({skills.length})
        </button>
        <button
          onClick={() => setSkillsTab("browse")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
            skillsTab === "browse"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
          )}
        >
          <Search className="w-4 h-4" />
          Browse
        </button>
      </div>

      {/* Summary line */}
      <p className="text-xs text-zinc-500">
        {skills.length} total · {eligibleCount} active · {unavailableCount} need deps
      </p>

      {skillsTab === "installed" ? (
        <>
          {/* Search */}
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
            {skillsLoading ? (
              <>
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
              </>
            ) : filteredSkills.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Puzzle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400 font-medium">
                  {skillSearch ? `No skills matching "${skillSearch}"` : "No skills in this category"}
                </p>
                {skillSearch && (
                  <button onClick={() => setSkillSearch("")} className="text-xs text-emerald-400 hover:text-emerald-300 mt-2">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <>
                {(() => {
                  const customSkills = filteredSkills.filter(s => s.source === "openclaw-workspace" || s.source === "managed" || s.source === "npm" || s.source === "installed");
                  const builtinSkills = filteredSkills.filter(s => s.source === "openclaw-bundled" || s.source === "builtin" || s.source === "core");
                  const otherSkills = filteredSkills.filter(s => !customSkills.includes(s) && !builtinSkills.includes(s));

                  const renderCards = (list: typeof filteredSkills) =>
                    list.map((skill) => (
                      <InstalledSkillCard
                        key={skill.skillKey}
                        skill={skill}
                        expanded={expandedSkill === skill.skillKey}
                        onToggleExpand={() => setExpandedSkill(expandedSkill === skill.skillKey ? null : skill.skillKey)}
                        busy={busySkill === skill.skillKey}
                        onToggle={() => onToggleSkill(skill.skillKey, skill.disabled)}
                        onUninstall={() => onUninstall(skill.skillKey)}
                      />
                    ));

                  return (
                    <>
                      {customSkills.length > 0 && (
                        <>
                          <p className="text-xs text-zinc-400 px-1 font-medium">
                            Custom Skills ({customSkills.length})
                          </p>
                          {renderCards(customSkills)}
                        </>
                      )}
                      {builtinSkills.length > 0 && (
                        <>
                          <p className="text-xs text-zinc-500 px-1 font-medium mt-3">
                            Built-in ({builtinSkills.length})
                            {skillSearch && <span className="font-normal"> matching &ldquo;{skillSearch}&rdquo;</span>}
                          </p>
                          {renderCards(builtinSkills)}
                        </>
                      )}
                      {otherSkills.length > 0 && renderCards(otherSkills)}
                    </>
                  );
                })()}
              </>
            )}
          </section>
        </>
      ) : (
        <>
          {/* Browse store */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearchStore(searchQuery || undefined, sortBy, safeOnly);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              />
            </div>
            <Button
              onClick={() => onSearchStore(searchQuery || undefined, sortBy, safeOnly)}
              disabled={storeLoading}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4"
            >
              {storeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {storeSearched && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ArrowDownAZ className="w-4 h-4 text-zinc-500" />
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const newSort = e.target.value as SortOption;
                    setSortBy(newSort);
                    onSearchStore(searchQuery || undefined, newSort, safeOnly);
                  }}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  const newSafe = !safeOnly;
                  setSafeOnly(newSafe);
                  onSearchStore(searchQuery || undefined, sortBy, newSafe);
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
              {!storeLoading && (
                <span className="text-xs text-zinc-500 ml-auto">
                  {resultCount} result{resultCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {storeError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 break-words flex-1">{storeError}</p>
              <button onClick={() => setStoreError(null)} className="p-1 rounded hover:bg-zinc-800 transition-colors shrink-0">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          )}

          <section className="space-y-3">
            {storeLoading ? (
              <>
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
              </>
            ) : !storeSearched ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 text-center">
                <Puzzle className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
                <h3 className="font-semibold text-lg mb-1">Discover Skills</h3>
                <p className="text-sm text-zinc-400 max-w-md mx-auto">
                  Search the ClawdTM skill store to find new capabilities.
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {["memory", "messaging", "automation", "web", "notes", "email"].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setSearchQuery(q);
                        setSortBy("relevance");
                        onSearchStore(q, "relevance", safeOnly);
                      }}
                      className="px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors capitalize"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : storeSkills.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Search className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">No skills found</p>
              </div>
            ) : (
              storeSkills.map((skill) => {
                const isExpanded = expandedStoreSkill === skill.slug;
                const isInstalled = installedKeys.has(skill.slug);
                return (
                  <StoreSkillCard
                    key={skill.slug}
                    skill={skill}
                    expanded={isExpanded}
                    isInstalled={isInstalled}
                    installing={installingSkill === skill.slug}
                    onToggleExpand={() => setExpandedStoreSkill(isExpanded ? null : skill.slug)}
                    onInstall={() => onInstallClick(skill)}
                  />
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── Installed Skill Card ─────────────────────────────────────────────

function InstalledSkillCard({
  skill, expanded, onToggleExpand, busy, onToggle, onUninstall,
}: {
  skill: SkillStatusEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  busy: boolean;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const hasMissing = skill.missing && ((skill.missing.bins?.length || 0) > 0 || (skill.missing.env?.length || 0) > 0 || (skill.missing.os?.length || 0) > 0);
  const isManaged = skill.source === "managed" || skill.source === "npm" || skill.source === "installed" || skill.source === "openclaw-workspace";
  const isBuiltin = skill.source === "builtin" || skill.source === "core" || skill.source === "openclaw-bundled";

  return (
    <div className={cn("bg-zinc-900 rounded-xl border transition-all", expanded ? "p-4" : "px-3 py-2.5", skill.disabled ? "border-zinc-800/50 opacity-60" : "border-zinc-800")}>
      <div className="flex items-center justify-between gap-2 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-base shrink-0">{skill.emoji || "🔧"}</span>
          <span className="font-medium text-sm truncate">{skill.name}</span>
          {hasMissing && <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title="Missing dependencies" />}
          {!hasMissing && skill.eligible && !skill.disabled && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
          {skill.disabled && <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />}
          {skill.source === "openclaw-workspace" && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">custom</span>}
          {isBuiltin && <span className="text-[10px] text-zinc-600">builtin</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={busy}
            className={cn("p-1.5 rounded-lg transition-colors", skill.disabled ? "text-zinc-500 hover:text-green-400 hover:bg-green-500/10" : "text-green-400 hover:text-zinc-500 hover:bg-zinc-800")}
            title={skill.disabled ? "Enable skill" : "Disable skill"}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : skill.disabled ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3 text-sm">
          <div>
            <div className="text-xs text-zinc-500 mb-1">What it does</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{skill.description}</p>
          </div>
          <div className="flex gap-4 flex-wrap text-xs">
            <div><span className="text-zinc-500">Source: </span><span className="text-zinc-400">{skill.source}</span></div>
            <div><span className="text-zinc-500">Key: </span><code className="text-zinc-400 bg-zinc-800 px-1 rounded">{skill.skillKey}</code></div>
          </div>
          {skill.requirements && (skill.requirements.bins?.length || skill.requirements.env?.length) && (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="text-xs font-medium text-zinc-300 mb-1">Requirements</div>
              <div className="text-xs text-zinc-400 space-y-1">
                {skill.requirements.bins?.length ? <div>Binaries: <code className="text-zinc-300">{skill.requirements.bins.join(", ")}</code></div> : null}
                {skill.requirements.env?.length ? <div>Env vars: <code className="text-zinc-300">{skill.requirements.env.join(", ")}</code></div> : null}
                {skill.requirements.os?.length ? <div>OS: <code className="text-zinc-300">{skill.requirements.os.join(", ")}</code></div> : null}
              </div>
            </div>
          )}
          {hasMissing && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-xs font-medium text-red-400 mb-1">Missing Requirements</div>
              <div className="text-xs text-zinc-400 space-y-1">
                {skill.missing?.bins?.length ? <div>Binaries: <code className="text-red-300">{skill.missing.bins.join(", ")}</code></div> : null}
                {skill.missing?.env?.length ? <div>Env vars: <code className="text-red-300">{skill.missing.env.join(", ")}</code></div> : null}
                {skill.missing?.os?.length ? <div>OS: <code className="text-red-300">{skill.missing.os.join(", ")}</code></div> : null}
              </div>
            </div>
          )}
          {isManaged && (
            <div className="pt-2">
              <Button variant="outline" size="sm" className="text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={onUninstall} disabled={busy}>
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

// ─── Store Skill Card ─────────────────────────────────────────────────

function StoreSkillCard({
  skill, expanded, isInstalled, installing, onToggleExpand, onInstall,
}: {
  skill: StoreSkill;
  expanded: boolean;
  isInstalled: boolean;
  installing: boolean;
  onToggleExpand: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 transition-all">
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{skill.name}</h3>
            {skill.community?.is_verified && <ShieldCheck className="w-4 h-4 text-green-400" />}
            {skill.community?.is_featured && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
            {isInstalled && <Badge className="text-xs bg-green-500/20 text-green-400 border-0">Installed</Badge>}
            <SecurityScoreBadge security={skill.security} />
          </div>
          <p className={cn("text-sm text-zinc-400 mt-1", !expanded && "line-clamp-2")}>{skill.description || "No description"}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
            {skill.author && <span>by {skill.author}</span>}
            {skill.community?.avg_rating != null && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                {skill.community.avg_rating.toFixed(1)}
              </span>
            )}
            {skill.downloads != null && (
              <span className="flex items-center gap-1"><Download className="w-3 h-3" />{skill.downloads.toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isInstalled ? (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onInstall(); }} disabled={installing} className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white">
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-1" />Install</>}
            </Button>
          ) : (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          {expanded ? <ChevronUp className="w-5 h-5 text-zinc-500" /> : <ChevronDown className="w-5 h-5 text-zinc-500" />}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
          <div>
            <div className="text-xs text-zinc-500 mb-1">Description</div>
            <p className="text-sm text-zinc-300 leading-relaxed">{skill.description || "No description available"}</p>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-300">Security</div>
              <SecurityScoreBadge security={skill.security} showScore />
            </div>
            {skill.security?.flags?.length ? (
              <div className="space-y-1">
                {skill.security.flags.map((flag) => (
                  <div key={flag} className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-zinc-300 font-mono">{flag}</span>
                      {FLAG_DESCRIPTIONS[flag] && <span className="text-zinc-500"> — {FLAG_DESCRIPTIONS[flag]}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No security flags</p>
            )}
          </div>
          {skill.clawdtm_url && (
            <a href={skill.clawdtm_url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
              View on ClawdTM <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Security Score Badge ─────────────────────────────────────────────

function SecurityScoreBadge({ security, showScore }: { security?: StoreSkill["security"]; showScore?: boolean }) {
  if (!security) return null;
  const { score, risk } = security;
  if (score === null) {
    return <Badge className="text-xs border-0 gap-1 bg-zinc-500/20 text-zinc-400"><ShieldOff className="w-3 h-3" />Unscanned</Badge>;
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

// ─── Install Confirmation Modal ─────────────────────────────────────────

function InstallConfirmModal({
  skill, onClose, onConfirm, installing,
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
            {isHighRisk ? <ShieldAlert className="w-5 h-5 text-red-400" /> : isUnscanned ? <ShieldOff className="w-5 h-5 text-yellow-400" /> : <Shield className="w-5 h-5 text-yellow-400" />}
            <h3 className="font-semibold">{isHighRisk ? "Security Warning" : isUnscanned ? "Unscanned Skill" : "Confirm Install"}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{skill.name}</span>
              <SecurityScoreBadge security={skill.security} showScore />
            </div>
            {skill.author && <p className="text-xs text-zinc-500">by {skill.author}</p>}
            <p className="text-sm text-zinc-400 mt-2">{skill.description}</p>
          </div>
          {isHighRisk && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-300 font-medium mb-2">This skill has a {risk} security risk (score: {score ?? "N/A"}/100)</p>
              <p className="text-xs text-zinc-400">Installing this skill is strongly discouraged.</p>
            </div>
          )}
          {isUnscanned && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-300 font-medium mb-1">Not yet scanned</p>
              <p className="text-xs text-zinc-400">This skill has not been security scanned yet.</p>
            </div>
          )}
          {!isHighRisk && !isUnscanned && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-300 font-medium mb-1">Medium risk (score: {score}/100)</p>
              <p className="text-xs text-zinc-400">Review security flags below before installing.</p>
            </div>
          )}
          {flags.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-zinc-400">Security Flags</div>
              {flags.map((flag) => (
                <div key={flag} className="flex items-start gap-2 text-xs bg-zinc-800/50 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-zinc-300 font-mono">{flag}</span>
                    {FLAG_DESCRIPTIONS[flag] && <p className="text-zinc-500 mt-0.5">{FLAG_DESCRIPTIONS[flag]}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {needsAcknowledge && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50" />
              <span className="text-xs text-zinc-400">I understand the risks and want to install this skill anyway</span>
            </label>
          )}
        </div>
        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className={cn("flex-1 text-white", isHighRisk ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600")}
            onClick={() => onConfirm(needsAcknowledge)}
            disabled={installing || (needsAcknowledge && !accepted)}
          >
            {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 mr-1" />{isHighRisk ? "Install Anyway" : "Install"}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Config Editor Component ─────────────────────────────────────────────

const SENSITIVE_KEYS = new Set(["botToken", "apiKey", "token", "secret", "password", "api_key"]);
const READ_ONLY_SECTIONS = new Set(["meta", "wizard"]);

// Sections to show in visual editor (in order)
const VISUAL_SECTIONS = [
  { key: "channels", label: "Channels", icon: "📡" },
  { key: "gateway", label: "Gateway", icon: "🌐" },
  { key: "models", label: "Models", icon: "🧠" },
  { key: "agents", label: "Agents", icon: "🤖" },
  { key: "messages", label: "Messages", icon: "💬" },
  { key: "tools", label: "Tools", icon: "🔧" },
  { key: "commands", label: "Commands", icon: "⌘" },
  { key: "hooks", label: "Hooks", icon: "🪝" },
  { key: "skills", label: "Skills", icon: "🧩" },
  { key: "plugins", label: "Plugins", icon: "🔌" },
  { key: "browser", label: "Browser", icon: "🌍" },
  { key: "auth", label: "Auth", icon: "🔑" },
  { key: "update", label: "Update", icon: "📦" },
  { key: "meta", label: "Meta", icon: "📋" },
  { key: "wizard", label: "Wizard", icon: "🧙" },
];

function ConfigEditor() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [jsonValid, setJsonValid] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setConfig(data.config);
        const json = JSON.stringify(data.config, null, 2);
        setOriginalJson(json);
        setRawJson(json);
      }
    } catch (err) {
      setError("Failed to load config");
      console.error("Config fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const hasChanges = rawJson !== originalJson;

  const changeCount = (() => {
    if (!hasChanges) return 0;
    try {
      const orig = JSON.parse(originalJson);
      const curr = JSON.parse(rawJson);
      return countDiffs(orig, curr);
    } catch {
      return 0;
    }
  })();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let configToSave: Record<string, unknown>;
      if (mode === "json") {
        try {
          configToSave = JSON.parse(rawJson);
        } catch {
          setError("Invalid JSON syntax");
          setSaving(false);
          return;
        }
      } else {
        configToSave = JSON.parse(rawJson);
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: configToSave }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess("Config saved successfully");
        setOriginalJson(rawJson);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || "Save failed");
        if (data.errors) {
          setError(data.errors.join("; "));
        }
      }
    } catch (err) {
      setError("Failed to save config");
      console.error("Config save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setRawJson(originalJson);
    if (originalJson) {
      try {
        setConfig(JSON.parse(originalJson));
      } catch {
        // ignore
      }
    }
    setError(null);
    setSuccess(null);
  };

  const handleRawJsonChange = (value: string) => {
    setRawJson(value);
    try {
      JSON.parse(value);
      setJsonValid(true);
      setConfig(JSON.parse(value));
    } catch {
      setJsonValid(false);
    }
  };

  const updateConfigValue = (path: string[], value: unknown) => {
    if (!config) return;
    const newConfig = JSON.parse(JSON.stringify(config));
    let current = newConfig;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) current[path[i]] = {};
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    setConfig(newConfig);
    const json = JSON.stringify(newConfig, null, 2);
    setRawJson(json);
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleReveal = (path: string) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 skeleton-shimmer rounded-xl" />
        <Skeleton className="h-32 skeleton-shimmer rounded-xl" />
        <Skeleton className="h-32 skeleton-shimmer rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle + save */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={() => setMode("visual")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors",
              mode === "visual"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Visual
          </button>
          <button
            onClick={() => setMode("json")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors",
              mode === "json"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Code className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <span className="text-xs text-amber-400">
                {changeCount} unsaved change{changeCount !== 1 ? "s" : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                className="h-7 px-2 text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Discard
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !hasChanges || (mode === "json" && !jsonValid)}
            className="h-7 px-3 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <>
                <Save className="w-3 h-3 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error/success messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="p-0.5 rounded hover:bg-zinc-800">
            <X className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300">{success}</p>
        </div>
      )}

      {mode === "visual" ? (
        /* ── Visual Editor ── */
        <div className="space-y-2">
          {config && VISUAL_SECTIONS.filter((s) => s.key in config).map((section) => {
            const isExpanded = expandedSections.has(section.key);
            const isReadOnly = READ_ONLY_SECTIONS.has(section.key);
            const data = config[section.key];

            return (
              <div
                key={section.key}
                className={cn(
                  "bg-zinc-900 rounded-xl border transition-all",
                  isReadOnly ? "border-zinc-800/50 opacity-70" : "border-zinc-800"
                )}
              >
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full flex items-center justify-between p-3 sm:p-4 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{section.icon}</span>
                    <span className="font-medium text-sm capitalize">{section.label}</span>
                    {isReadOnly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        read-only
                      </span>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-zinc-800">
                    <div className="pt-3 space-y-1.5">
                      <ConfigFields
                        data={data}
                        path={[section.key]}
                        readOnly={isReadOnly}
                        revealedSecrets={revealedSecrets}
                        onToggleReveal={toggleReveal}
                        onUpdate={updateConfigValue}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Raw JSON Editor ── */
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            {!jsonValid && (
              <span className="text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Invalid JSON
              </span>
            )}
            {jsonValid && (
              <span className="text-zinc-500">
                {rawJson.split("\n").length} lines
              </span>
            )}
          </div>
          <textarea
            value={rawJson}
            onChange={(e) => handleRawJsonChange(e.target.value)}
            spellCheck={false}
            className={cn(
              "w-full bg-zinc-950 border rounded-xl p-4 font-mono text-xs text-zinc-300 leading-relaxed resize-y focus:outline-none focus:ring-2 min-h-[400px] max-h-[70vh]",
              jsonValid
                ? "border-zinc-800 focus:ring-emerald-500/50"
                : "border-red-500/50 focus:ring-red-500/50"
            )}
          />
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Editing <code className="text-zinc-400">openclaw.json</code>. Sensitive values (API keys, tokens) are masked.
          A backup is created before each save.
          {" "}Meta and wizard sections are read-only.
        </span>
      </div>
    </div>
  );
}

// ─── Config Fields Renderer ──────────────────────────────────────────────

function ConfigFields({
  data,
  path,
  readOnly,
  revealedSecrets,
  onToggleReveal,
  onUpdate,
  depth = 0,
}: {
  data: unknown;
  path: string[];
  readOnly: boolean;
  revealedSecrets: Set<string>;
  onToggleReveal: (path: string) => void;
  onUpdate: (path: string[], value: unknown) => void;
  depth?: number;
}) {
  if (data === null || data === undefined) return null;

  if (typeof data !== "object") {
    return null;
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-1">
        {data.map((item, i) => {
          const itemPath = [...path, String(i)];
          if (typeof item === "object" && item !== null) {
            return (
              <div key={i} className="ml-3 pl-3 border-l border-zinc-800">
                <div className="text-[11px] text-zinc-600 mb-1">[{i}]</div>
                <ConfigFields
                  data={item}
                  path={itemPath}
                  readOnly={readOnly}
                  revealedSecrets={revealedSecrets}
                  onToggleReveal={onToggleReveal}
                  onUpdate={onUpdate}
                  depth={depth + 1}
                />
              </div>
            );
          }
          return (
            <div key={i} className="flex items-center gap-2 ml-3">
              <span className="text-[11px] text-zinc-600 w-6">[{i}]</span>
              <span className="text-xs text-zinc-300 font-mono">{String(item)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const entries = Object.entries(data as Record<string, unknown>);

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const fullPath = [...path, key];
        const pathStr = fullPath.join(".");
        const isSensitive = SENSITIVE_KEYS.has(key);
        const isRevealed = revealedSecrets.has(pathStr);

        // Nested object
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          return (
            <div key={key} className={cn("rounded-lg", depth < 2 ? "ml-1" : "ml-3 pl-3 border-l border-zinc-800/50")}>
              <div className="text-xs font-medium text-zinc-400 mb-1 mt-2">{key}</div>
              <ConfigFields
                data={value}
                path={fullPath}
                readOnly={readOnly}
                revealedSecrets={revealedSecrets}
                onToggleReveal={onToggleReveal}
                onUpdate={onUpdate}
                depth={depth + 1}
              />
            </div>
          );
        }

        // Array
        if (Array.isArray(value)) {
          return (
            <div key={key} className="ml-1">
              <div className="text-xs font-medium text-zinc-400 mb-1 mt-2">
                {key} <span className="text-zinc-600">({value.length})</span>
              </div>
              <ConfigFields
                data={value}
                path={fullPath}
                readOnly={readOnly}
                revealedSecrets={revealedSecrets}
                onToggleReveal={onToggleReveal}
                onUpdate={onUpdate}
                depth={depth + 1}
              />
            </div>
          );
        }

        // Boolean
        if (typeof value === "boolean") {
          return (
            <div key={key} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-zinc-400">{key}</span>
              <button
                onClick={() => !readOnly && onUpdate(fullPath, !value)}
                disabled={readOnly}
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors",
                  value ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500",
                  readOnly && "cursor-not-allowed opacity-60"
                )}
              >
                {value ? "true" : "false"}
              </button>
            </div>
          );
        }

        // Sensitive string
        if (isSensitive && typeof value === "string") {
          return (
            <div key={key} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-zinc-400">{key}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-zinc-500">
                  {isRevealed ? value : "••••••••" + (value.length > 4 ? value.slice(-4) : "")}
                </span>
                <button
                  onClick={() => onToggleReveal(pathStr)}
                  className="p-1 rounded hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
                  title={isRevealed ? "Hide" : "Reveal"}
                >
                  {isRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>
          );
        }

        // String value with select for known enums
        if (typeof value === "string") {
          const enumOptions = getEnumOptions(key);
          if (enumOptions && !readOnly) {
            return (
              <div key={key} className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-zinc-400">{key}</span>
                <select
                  value={value}
                  onChange={(e) => onUpdate(fullPath, e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                >
                  {enumOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          }

          return (
            <div key={key} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-zinc-400 shrink-0">{key}</span>
              {readOnly ? (
                <span className="text-xs font-mono text-zinc-300 truncate max-w-[200px]">{value}</span>
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => onUpdate(fullPath, e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 max-w-[200px] w-full text-right"
                />
              )}
            </div>
          );
        }

        // Number
        if (typeof value === "number") {
          return (
            <div key={key} className="flex items-center justify-between gap-2 py-1">
              <span className="text-xs text-zinc-400">{key}</span>
              {readOnly ? (
                <span className="text-xs font-mono text-zinc-300">{value}</span>
              ) : (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => onUpdate(fullPath, Number(e.target.value))}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 w-24 text-right"
                />
              )}
            </div>
          );
        }

        // Fallback
        return (
          <div key={key} className="flex items-center justify-between gap-2 py-1">
            <span className="text-xs text-zinc-400">{key}</span>
            <span className="text-xs font-mono text-zinc-500">{JSON.stringify(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function getEnumOptions(key: string): string[] | null {
  const enums: Record<string, string[]> = {
    dmPolicy: ["pairing", "open", "allowlist", "deny"],
    groupPolicy: ["allowlist", "open", "deny"],
    streamMode: ["partial", "full", "none"],
    bind: ["loopback", "all", "tailscale"],
    mode: ["local", "remote", "merge"],
    ackReactionScope: ["all", "group-mentions", "none"],
    channel: ["stable", "beta", "canary"],
    native: ["auto", "enabled", "disabled"],
    nativeSkills: ["auto", "enabled", "disabled"],
    nodeManager: ["pnpm", "npm", "yarn", "bun"],
  };
  return enums[key] || null;
}

function countDiffs(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a !== typeof b) return 1;
  if (typeof a !== "object" || a === null || b === null) return a !== b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return 1;
    return a.reduce((c, v, i) => c + countDiffs(v, b[i]), 0);
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  const allKeys = new Set([...keysA, ...keysB]);
  let count = 0;
  for (const key of allKeys) {
    count += countDiffs(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    );
  }
  return count;
}
