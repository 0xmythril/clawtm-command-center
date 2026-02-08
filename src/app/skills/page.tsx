"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw, Puzzle, ChevronDown, ChevronUp, Info, Search, Shield,
  ShieldCheck, ShieldAlert, Download, Trash2, ToggleLeft, ToggleRight,
  Loader2, Star, ExternalLink, X, CheckCircle, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSkillsStatus,
  enableSkill,
  disableSkill,
  uninstallSkill,
  installSkill,
  type SkillStatusEntry,
} from "@/lib/gateway-api";

// ─────────────────────────────────────────────────────────────
// Store skill type (from ClawdTM API)
// ─────────────────────────────────────────────────────────────

interface StoreSkill {
  slug: string;
  name: string;
  description?: string;
  emoji?: string;
  author?: string;
  verified?: boolean;
  featured?: boolean;
  riskLevel?: "low" | "medium" | "high" | "unknown";
  upvotes?: number;
  downvotes?: number;
  reviewCount?: number;
  tags?: string[];
  npmPackage?: string;
  repository?: string;
  createdAt?: string;
}

interface StoreReview {
  id: string;
  author: string;
  authorType: "human" | "bot";
  rating: number;
  content: string;
  createdAt: string;
}

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

  // ── Browse tab state ──
  const [storeSkills, setStoreSkills] = useState<StoreSkill[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeSearched, setStoreSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStoreSkill, setExpandedStoreSkill] = useState<string | null>(null);
  const [storeReviews, setStoreReviews] = useState<Record<string, StoreReview[]>>({});
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

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

  const searchStore = useCallback(async (query?: string) => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const params = new URLSearchParams({ action: "list" });
      if (query) params.set("q", query);
      const res = await fetch(`/api/store?${params}`);
      const data = await res.json();
      if (data.error) {
        setStoreError(data.error);
        setStoreSkills([]);
      } else {
        // Handle both array response and object with skills property
        const skills = Array.isArray(data) ? data : (data.skills || []);
        setStoreSkills(skills);
      }
      setStoreSearched(true);
    } catch (err) {
      console.error("Store search failed:", err);
      setStoreError("Failed to connect to skill store");
      setStoreSkills([]);
    } finally {
      setStoreLoading(false);
    }
  }, []);

  const fetchReviews = async (slug: string) => {
    if (storeReviews[slug]) return; // already loaded
    try {
      const res = await fetch(`/api/store?action=reviews&slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      const reviews = Array.isArray(data) ? data : (data.reviews || []);
      setStoreReviews((prev) => ({ ...prev, [slug]: reviews }));
    } catch {
      setStoreReviews((prev) => ({ ...prev, [slug]: [] }));
    }
  };

  const handleInstallSkill = async (slug: string) => {
    setInstallingSkill(slug);
    try {
      await installSkill(slug);
      await refreshInstalled();
    } catch (err) {
      console.error("Failed to install skill:", err);
    } finally {
      setInstallingSkill(null);
    }
  };

  // Check if a store skill is already installed
  const installedKeys = new Set(skills.map((s) => s.skillKey));

  const eligibleCount = skills.filter((s) => s.eligible && !s.disabled).length;
  const disabledCount = skills.filter((s) => s.disabled).length;

  // Group installed skills
  const activeSkills = skills.filter((s) => s.eligible && !s.disabled);
  const disabledSkills = skills.filter((s) => s.disabled);
  const unavailableSkills = skills.filter((s) => !s.eligible && !s.disabled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Puzzle className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Skills</h1>
            <p className="text-sm text-zinc-400">
              {eligibleCount} active · {disabledCount} disabled
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
          <TabsTrigger value="installed" className="data-[state=active]:bg-zinc-800">
            <Puzzle className="w-4 h-4 mr-2" />
            Installed ({skills.length})
          </TabsTrigger>
          <TabsTrigger
            value="browse"
            className="data-[state=active]:bg-zinc-800"
            onClick={() => {
              if (!storeSearched) searchStore();
            }}
          >
            <Search className="w-4 h-4 mr-2" />
            Browse
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* INSTALLED TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="installed" className="space-y-4">
          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Skills are agent capabilities. Toggle them on/off or uninstall managed skills.
              <strong> Builtin</strong> skills cannot be removed.
            </span>
          </div>

          {/* Summary Card */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <Puzzle className="w-5 h-5 text-orange-500" />
              <div>
                <span className="font-medium">{skills.length} Skills Total</span>
                <div className="text-sm text-zinc-400">
                  {eligibleCount} active · {unavailableSkills.length} missing deps · {disabledCount} disabled
                </div>
              </div>
            </div>
          </div>

          {/* Skills List */}
          <section className="space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-16 skeleton-shimmer rounded-xl" />
              </>
            ) : skills.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Puzzle className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No skills found</p>
              </div>
            ) : (
              <>
                {/* Active Skills */}
                {activeSkills.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">
                      Active ({activeSkills.length})
                    </h3>
                    {activeSkills.map((skill) => (
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
                  </div>
                )}

                {/* Disabled Skills */}
                {disabledSkills.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">
                      Disabled ({disabledSkills.length})
                    </h3>
                    {disabledSkills.map((skill) => (
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
                  </div>
                )}

                {/* Unavailable Skills */}
                {unavailableSkills.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-1">
                      Missing Dependencies ({unavailableSkills.length})
                    </h3>
                    {unavailableSkills.map((skill) => (
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
                  </div>
                )}
              </>
            )}
          </section>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* BROWSE TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="browse" className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchStore(searchQuery || undefined);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
              />
            </div>
            <Button
              onClick={() => searchStore(searchQuery || undefined)}
              disabled={storeLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4"
            >
              {storeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Skills from{" "}
              <a
                href="https://clawdtm.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300"
              >
                clawdtm.com
              </a>
              . Look for the <ShieldCheck className="w-3 h-3 inline text-green-400" /> verified badge
              and check reviews before installing.
            </span>
          </div>

          {/* Store Error */}
          {storeError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-300">{storeError}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Make sure ClawdTM credentials are configured.
                </p>
              </div>
            </div>
          )}

          {/* Store Results */}
          <section className="space-y-3">
            {storeLoading ? (
              <>
                <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
              </>
            ) : storeSkills.length === 0 && storeSearched ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Search className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No skills found</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Try a different search or check back later
                </p>
              </div>
            ) : (
              storeSkills.map((skill) => {
                const isExpanded = expandedStoreSkill === skill.slug;
                const isInstalled = installedKeys.has(skill.slug);
                const reviews = storeReviews[skill.slug];

                return (
                  <div
                    key={skill.slug}
                    className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 transition-all"
                  >
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => {
                        const newExpanded = isExpanded ? null : skill.slug;
                        setExpandedStoreSkill(newExpanded);
                        if (newExpanded) fetchReviews(skill.slug);
                      }}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-xl">{skill.emoji || "🧩"}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{skill.name}</h3>
                            {skill.verified && (
                              <ShieldCheck className="w-4 h-4 text-green-400" aria-label="Verified" />
                            )}
                            {skill.featured && (
                              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" aria-label="Featured" />
                            )}
                            {isInstalled && (
                              <Badge className="text-xs bg-green-500/20 text-green-400 border-0">
                                Installed
                              </Badge>
                            )}
                            <RiskBadge level={skill.riskLevel} />
                          </div>
                          <p className={cn("text-sm text-zinc-400 mt-1", !isExpanded && "line-clamp-2")}>
                            {skill.description || "No description"}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                            {skill.author && <span>by {skill.author}</span>}
                            {(skill.upvotes !== undefined || skill.downvotes !== undefined) && (
                              <span>
                                👍 {skill.upvotes || 0} · 👎 {skill.downvotes || 0}
                              </span>
                            )}
                            {skill.reviewCount !== undefined && (
                              <span>{skill.reviewCount} reviews</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isInstalled ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInstallSkill(skill.slug);
                            }}
                            disabled={installingSkill === skill.slug}
                            className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white"
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

                        {/* Metadata */}
                        <div className="flex gap-4 flex-wrap text-xs">
                          {skill.npmPackage && (
                            <div>
                              <span className="text-zinc-500">Package: </span>
                              <code className="text-zinc-400 bg-zinc-800 px-1 rounded">
                                {skill.npmPackage}
                              </code>
                            </div>
                          )}
                          {skill.repository && (
                            <a
                              href={skill.repository}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-400 hover:text-orange-300 flex items-center gap-1"
                            >
                              Source <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {skill.tags && skill.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {skill.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Reviews */}
                        <div>
                          <div className="text-xs text-zinc-500 mb-2">Reviews</div>
                          {!reviews ? (
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading reviews...
                            </div>
                          ) : reviews.length === 0 ? (
                            <p className="text-xs text-zinc-500">No reviews yet</p>
                          ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {reviews.slice(0, 5).map((review) => (
                                <div
                                  key={review.id}
                                  className="bg-zinc-800/50 rounded-lg p-3 text-xs"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-zinc-300">
                                      {review.author}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0"
                                    >
                                      {review.authorType === "bot" ? "🤖 Bot" : "👤 Human"}
                                    </Badge>
                                    <span className="text-zinc-600">
                                      {"⭐".repeat(review.rating)}
                                    </span>
                                  </div>
                                  <p className="text-zinc-400">{review.content}</p>
                                </div>
                              ))}
                            </div>
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

      {/* Confirm Uninstall Modal */}
      {confirmUninstall && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-sm p-6">
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

  const isManaged = skill.source === "managed" || skill.source === "npm" || skill.source === "installed";
  const isBuiltin = skill.source === "builtin" || skill.source === "core";

  return (
    <div
      className={cn(
        "bg-zinc-900 rounded-xl border p-4 transition-all",
        skill.disabled ? "border-zinc-800/50 opacity-60" : "border-zinc-800"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex items-start gap-3 min-w-0 flex-1 cursor-pointer"
          onClick={onToggleExpand}
        >
          <span className="text-xl">{skill.emoji || "🔧"}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium">{skill.name}</h3>
              {skill.eligible && !skill.disabled ? (
                <Badge className="text-xs bg-green-500/20 text-green-400 border-0">Active</Badge>
              ) : skill.disabled ? (
                <Badge variant="destructive" className="text-xs">Disabled</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Unavailable</Badge>
              )}
              {skill.always && (
                <Badge variant="outline" className="text-xs">Always</Badge>
              )}
              {isBuiltin && (
                <Badge variant="outline" className="text-xs text-zinc-500">Builtin</Badge>
              )}
            </div>
            <p className={cn("text-sm text-zinc-400 mt-1", !expanded && "line-clamp-1")}>
              {skill.description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            disabled={busy}
            className={cn(
              "p-2 rounded-lg transition-colors",
              skill.disabled
                ? "text-zinc-500 hover:text-green-400 hover:bg-green-500/10"
                : "text-green-400 hover:text-zinc-500 hover:bg-zinc-800"
            )}
            title={skill.disabled ? "Enable skill" : "Disable skill"}
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : skill.disabled ? (
              <ToggleLeft className="w-5 h-5" />
            ) : (
              <ToggleRight className="w-5 h-5" />
            )}
          </button>

          {expanded ? (
            <ChevronUp className="w-5 h-5 text-zinc-500 cursor-pointer" onClick={onToggleExpand} />
          ) : (
            <ChevronDown className="w-5 h-5 text-zinc-500 cursor-pointer" onClick={onToggleExpand} />
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

          {/* Requirements */}
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

          {/* Missing requirements */}
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

          {/* Uninstall button for managed skills */}
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
// Risk Badge Component
// ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level?: string }) {
  if (!level || level === "unknown") return null;

  const config = {
    low: { icon: ShieldCheck, text: "Low Risk", className: "bg-green-500/20 text-green-400" },
    medium: { icon: Shield, text: "Medium Risk", className: "bg-yellow-500/20 text-yellow-400" },
    high: { icon: ShieldAlert, text: "High Risk", className: "bg-red-500/20 text-red-400" },
  }[level];

  if (!config) return null;

  return (
    <Badge className={cn("text-xs border-0 gap-1", config.className)}>
      <config.icon className="w-3 h-3" />
      {config.text}
    </Badge>
  );
}
