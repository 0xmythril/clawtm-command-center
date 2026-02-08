"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play, Pause, RefreshCw, Clock, Loader2, Info, CheckCircle, XCircle,
  AlertCircle, FileCode, Star, Zap, ChevronDown, ChevronUp, X, Plus,
  Trash2, CalendarClock, ScrollText, Eraser, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/lib/use-local-storage";
import {
  getCronJobs,
  getCronStatus,
  runCronJob,
  toggleCronJob,
  createCronJob,
  deleteCronJob,
  type CronJob,
  type CronStatus,
  type CronCreateParams,
} from "@/lib/gateway-api";

// ─────────────────────────────────────────────────────────────
// Cron helpers
// ─────────────────────────────────────────────────────────────

function humanizeCron(expr: string): string {
  const parts = expr.split(" ");
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  if (min.startsWith("*/") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${min.slice(2)} minutes`;
  }
  if (!min.includes("*") && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Hourly at :${min.padStart(2, "0")}`;
  }
  if (!min.includes("*") && !hour.includes("*") && dom === "*" && mon === "*" && dow === "*") {
    return `Daily at ${hour.padStart(2, "0")}:${min.padStart(2, "0")}`;
  }
  return expr;
}

function formatSchedule(job: CronJob): { short: string; human: string } {
  const { schedule } = job;
  if (schedule.kind === "cron" && schedule.expr) {
    return { short: schedule.expr, human: humanizeCron(schedule.expr) };
  }
  if (schedule.kind === "every" && schedule.everyMs) {
    const minutes = Math.floor(schedule.everyMs / 60000);
    if (minutes < 60) return { short: `${minutes}m`, human: `Every ${minutes} minutes` };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { short: `${hours}h`, human: `Every ${hours} hours` };
    const days = Math.floor(hours / 24);
    return { short: `${days}d`, human: `Every ${days} days` };
  }
  return { short: schedule.kind, human: schedule.kind };
}

function formatNextRun(ms?: number): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff < 0) return "now";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatLastRun(ms?: number): string {
  if (!ms) return "Never";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getPayloadDescription(job: CronJob): string {
  const { payload } = job;
  if (payload.kind === "systemEvent") return payload.text || payload.message || "System event";
  if (payload.kind === "agentTurn") return payload.message || payload.text || "Agent turn";
  return payload.kind;
}

function getStatusIcon(status?: string) {
  if (!status) return null;
  if (status === "ok" || status === "success") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (status === "error" || status === "failed") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  return <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />;
}

// ─────────────────────────────────────────────────────────────
// Script types
// ─────────────────────────────────────────────────────────────

interface Script {
  name: string;
  description: string;
  lineCount?: number;
  sizeKb?: number;
  modifiedAt?: string;
  source?: "workspace" | "openclaw";
}

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Action log types
// ─────────────────────────────────────────────────────────────

interface ActionLogEntry {
  id: string;
  type: "script" | "cron";
  name: string;
  timestamp: number;
  success: boolean;
  durationMs?: number;
  error?: string;
  output?: string;
}

const MAX_LOG_ENTRIES = 50;

function formatLogTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const date = new Date(ts);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (days === 0) {
    if (minutes < 1) return `Just now`;
    if (minutes < 60) return `${minutes}m ago · ${time}`;
    return `${hours}h ago · ${time}`;
  }
  if (days === 1) return `Yesterday · ${time}`;
  if (days < 7) return `${days}d ago · ${time}`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` · ${time}`;
}

// ─────────────────────────────────────────────────────────────
// System crontab entry type
// ─────────────────────────────────────────────────────────────

interface SystemCronEntry {
  id: string;
  expr: string;
  command: string;
  comment?: string;
  raw: string;
}

function formatModifiedDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────
// Schedule presets for the schedule modal
// ─────────────────────────────────────────────────────────────

const SCHEDULE_PRESETS = [
  { label: "Every 15 min", kind: "every" as const, everyMs: 15 * 60000 },
  { label: "Every 30 min", kind: "every" as const, everyMs: 30 * 60000 },
  { label: "Every hour", kind: "every" as const, everyMs: 60 * 60000 },
  { label: "Every 6 hours", kind: "every" as const, everyMs: 6 * 60 * 60000 },
  { label: "Daily (midnight)", kind: "cron" as const, expr: "0 0 * * *" },
  { label: "Daily (9 AM)", kind: "cron" as const, expr: "0 9 * * *" },
  { label: "Daily (6 PM)", kind: "cron" as const, expr: "0 18 * * *" },
] as const;

// ─────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────

export default function ActionsPage() {
  // Shared state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Cron state
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showCreateCron, setShowCreateCron] = useState(false);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<string | null>(null);

  // System crontab state
  const [systemCronEntries, setSystemCronEntries] = useState<SystemCronEntry[]>([]);

  // Script state
  const [scripts, setScripts] = useState<Script[]>([]);
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [result, setResult] = useState<{ script: string; result: ExecResult } | null>(null);
  const [favorites, setFavorites] = useLocalStorage<string[]>("pinned-scripts", []);
  const [scheduleScript, setScheduleScript] = useState<string | null>(null);
  const [confirmDeleteScript, setConfirmDeleteScript] = useState<string | null>(null);
  const [deletingScript, setDeletingScript] = useState<string | null>(null);

  // Action log
  const [actionLog, setActionLog] = useLocalStorage<ActionLogEntry[]>("action-log", []);

  const addLogEntry = useCallback(
    (entry: Omit<ActionLogEntry, "id">) => {
      setActionLog((prev) => {
        const newEntry: ActionLogEntry = {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        return [newEntry, ...prev].slice(0, MAX_LOG_ENTRIES);
      });
    },
    [setActionLog]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobs, status, scriptsRes, crontabRes] = await Promise.all([
        getCronJobs().catch(() => []),
        getCronStatus().catch(() => null),
        fetch("/api/scripts").then((r) => r.json()).catch(() => ({ scripts: [] })),
        fetch("/api/crontab").then((r) => r.json()).catch(() => ({ entries: [] })),
      ]);
      setCronJobs(jobs);
      setCronStatus(status);
      setScripts(scriptsRes.scripts || []);
      setSystemCronEntries(crontabRes.entries || []);
    } catch (err) {
      console.error("Failed to refresh:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─────────────────────────────────────────────────────────────
  // Cron handlers
  // ─────────────────────────────────────────────────────────────

  const handleRunCron = async (jobId: string) => {
    setBusyJobId(jobId);
    const job = cronJobs.find((j) => j.id === jobId);
    const start = Date.now();
    try {
      await runCronJob(jobId);
      addLogEntry({
        type: "cron",
        name: job?.name || jobId,
        timestamp: Date.now(),
        success: true,
        durationMs: Date.now() - start,
      });
      await refresh();
    } catch (err) {
      addLogEntry({
        type: "cron",
        name: job?.name || jobId,
        timestamp: Date.now(),
        success: false,
        durationMs: Date.now() - start,
        error: String(err),
      });
      console.error("Failed to run job:", err);
    } finally {
      setBusyJobId(null);
    }
  };

  const handleToggleCron = async (jobId: string, enabled: boolean) => {
    setBusyJobId(jobId);
    try {
      await toggleCronJob(jobId, enabled);
      await refresh();
    } catch (err) {
      console.error("Failed to toggle job:", err);
    } finally {
      setBusyJobId(null);
    }
  };

  const handleDeleteCron = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await deleteCronJob(jobId);
      setConfirmDeleteJob(null);
      setExpandedJob(null);
      await refresh();
    } catch (err) {
      console.error("Failed to delete job:", err);
    } finally {
      setBusyJobId(null);
    }
  };

  const handleCreateCron = async (params: CronCreateParams) => {
    try {
      await createCronJob(params);
      setShowCreateCron(false);
      await refresh();
    } catch (err) {
      console.error("Failed to create job:", err);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Script handlers
  // ─────────────────────────────────────────────────────────────

  const runScript = async (scriptName: string) => {
    setRunningScript(scriptName);
    setResult(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: scriptName }),
      });
      const data: ExecResult = await res.json();
      setResult({ script: scriptName, result: data });
      addLogEntry({
        type: "script",
        name: scriptName,
        timestamp: Date.now(),
        success: data.success,
        durationMs: Date.now() - start,
        error: data.error,
        output: (data.stdout || data.stderr || "").slice(0, 200),
      });
    } catch (err) {
      setResult({
        script: scriptName,
        result: { success: false, stdout: "", stderr: "", error: String(err) },
      });
      addLogEntry({
        type: "script",
        name: scriptName,
        timestamp: Date.now(),
        success: false,
        durationMs: Date.now() - start,
        error: String(err),
      });
    } finally {
      setRunningScript(null);
    }
  };

  const toggleFavorite = (scriptName: string) => {
    setFavorites((prev) => {
      if (prev.includes(scriptName)) return prev.filter((s) => s !== scriptName);
      if (prev.length >= 4) return [...prev.slice(1), scriptName];
      return [...prev, scriptName];
    });
  };

  const handleScheduleScript = async (
    scriptName: string,
    schedule: CronCreateParams["schedule"]
  ) => {
    const displayName = scriptName.replace(".sh", "");
    await handleCreateCron({
      name: `Run ${displayName}`,
      schedule,
      payload: {
        kind: "systemEvent",
        text: `🔄 Scheduled Script Run\n\nRun: ~/.openclaw/workspace/scripts/${scriptName}\n\nExecute the script: ${scriptName}`,
      },
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      enabled: true,
    });
    setScheduleScript(null);
  };

  const handleDeleteScript = async (scriptName: string) => {
    setDeletingScript(scriptName);
    try {
      const res = await fetch("/api/scripts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: scriptName }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmDeleteScript(null);
        // Remove from favorites if pinned
        setFavorites((prev) => prev.filter((f) => f !== scriptName));
        await refresh();
      } else {
        console.error("Delete failed:", data.error);
      }
    } catch (err) {
      console.error("Failed to delete script:", err);
    } finally {
      setDeletingScript(null);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Counts
  // ─────────────────────────────────────────────────────────────

  const enabledCronCount = cronJobs.filter((j) => j.enabled).length;
  const totalScheduledCount = enabledCronCount + systemCronEntries.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Actions</h1>
            <p className="text-sm text-zinc-400">
              {totalScheduledCount} scheduled · {scripts.length} scripts
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.5} />
        </button>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="scheduled" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-900">
          <TabsTrigger value="scheduled" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <Clock className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Scheduled ({totalScheduledCount})</span>
          </TabsTrigger>
          <TabsTrigger value="manual" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <FileCode className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Scripts ({scripts.length})</span>
          </TabsTrigger>
          <TabsTrigger value="log" className="data-[state=active]:bg-zinc-800 text-xs sm:text-sm px-1 sm:px-3">
            <ScrollText className="w-4 h-4 mr-1 sm:mr-2 shrink-0" />
            <span className="truncate">Log ({actionLog.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SCHEDULED TAB (Cron Jobs) */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="scheduled" className="space-y-4">
          {/* Next Wake Card + Create Button */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Next Wake</span>
                    <div className="group relative">
                      <Info className="w-3.5 h-3.5 text-zinc-500 cursor-help" />
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-zinc-800 rounded-lg text-xs text-zinc-300 shadow-lg z-10">
                        When the scheduler next wakes to run any enabled job.
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-zinc-400">
                    {cronStatus?.nextWakeAtMs ? formatNextRun(cronStatus.nextWakeAtMs) : "No jobs scheduled"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={cronStatus?.enabled ? "default" : "secondary"}>
                  {cronStatus?.enabled ? "Active" : "Paused"}
                </Badge>
                <Button
                  size="sm"
                  onClick={() => setShowCreateCron(true)}
                  className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New
                </Button>
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Scheduled actions run automatically. Tap <strong>Run</strong> to trigger immediately as a one-off.
            </span>
          </div>

          {/* Jobs List */}
          <section className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-28 skeleton-shimmer rounded-xl" />
              </>
            ) : cronJobs.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No scheduled actions</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Tap <strong>New</strong> above to create one, or schedule a script from the Scripts tab.
                </p>
              </div>
            ) : (
              cronJobs.map((job) => {
                const schedule = formatSchedule(job);
                const isExpanded = expandedJob === job.id;
                const payloadDesc = getPayloadDescription(job);

                return (
                  <div
                    key={job.id}
                    className={cn(
                      "bg-zinc-900 rounded-xl border p-4 transition-all",
                      job.enabled ? "border-zinc-800" : "border-zinc-800/50 opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <h3 className="font-medium text-sm sm:text-base">{job.name}</h3>
                          <Badge variant={job.enabled ? "default" : "secondary"} className="text-xs">
                            {job.enabled ? "On" : "Off"}
                          </Badge>
                          {job.state?.lastStatus && getStatusIcon(job.state.lastStatus)}
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-500" />
                          )}
                        </div>
                        <div className="text-sm text-orange-400 mt-1">{schedule.human}</div>
                        <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                          <span>Next: <span className="text-zinc-400">{formatNextRun(job.state?.nextRunAtMs)}</span></span>
                          <span>Last: <span className="text-zinc-400">{formatLastRun(job.state?.lastRunAtMs)}</span></span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleCron(job.id, !job.enabled)}
                          disabled={busyJobId === job.id}
                          className="h-8 w-8 p-0"
                          title={job.enabled ? "Disable schedule" : "Enable schedule"}
                        >
                          {busyJobId === job.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : job.enabled ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleRunCron(job.id)}
                          disabled={busyJobId === job.id}
                          className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white"
                          title="Run now (one-off)"
                        >
                          {busyJobId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run"}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Action Payload</div>
                          <div className="text-sm text-zinc-300 break-words whitespace-pre-wrap">{payloadDesc}</div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <div>
                            <span className="text-zinc-500">Schedule: </span>
                            <code className="text-zinc-400 bg-zinc-800 px-1 rounded">{schedule.short}</code>
                          </div>
                          <div>
                            <span className="text-zinc-500">Target: </span>
                            <span className="text-zinc-400">{job.sessionTarget}</span>
                          </div>
                          {job.state?.runCount !== undefined && (
                            <div>
                              <span className="text-zinc-500">Run count: </span>
                              <span className="text-zinc-400">{job.state.runCount}</span>
                            </div>
                          )}
                          {job.state?.lastDurationMs !== undefined && (
                            <div>
                              <span className="text-zinc-500">Last duration: </span>
                              <span className="text-zinc-400">{job.state.lastDurationMs}ms</span>
                            </div>
                          )}
                        </div>
                        {/* Last error */}
                        {job.state?.lastError && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <div className="text-xs font-medium text-red-400 mb-1">Last Error</div>
                            <pre className="text-xs text-zinc-400 whitespace-pre-wrap break-all">
                              {job.state.lastError}
                            </pre>
                          </div>
                        )}
                        {/* Delete button */}
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => setConfirmDeleteJob(job.id)}
                            disabled={busyJobId === job.id}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Job
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {/* System Crontab Entries */}
          {systemCronEntries.length > 0 && (
            <section className="space-y-3 mt-6">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-500" />
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  System Crontab ({systemCronEntries.length})
                </h3>
              </div>
              <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  These jobs run via the OS cron scheduler, not OpenClaw. They are read-only here.
                </span>
              </div>
              {systemCronEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-zinc-900 rounded-xl border border-zinc-800/50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <Terminal className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm">
                          {entry.comment || "System Job"}
                        </h3>
                        <Badge variant="outline" className="text-xs text-zinc-500">
                          System
                        </Badge>
                      </div>
                      <div className="text-sm text-orange-400 mt-1">
                        {humanizeCron(entry.expr)}
                      </div>
                      <code className="block text-xs text-zinc-500 mt-2 font-mono break-all bg-zinc-800/50 rounded px-2 py-1">
                        {entry.command}
                      </code>
                      <div className="text-xs text-zinc-600 mt-1">
                        <code>{entry.expr}</code>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* SCRIPTS TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="manual" className="space-y-4">
          {/* Info Banner */}
          <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <Star className="w-3 h-3 inline text-orange-400" /> Pin to Dashboard ·{" "}
              <CalendarClock className="w-3 h-3 inline text-sky-400" /> Schedule as cron job
            </span>
          </div>

          {/* Scripts Grid */}
          <section className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
                <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
              </>
            ) : scripts.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <FileCode className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No scripts found</p>
                <p className="text-xs text-zinc-500 mt-1">Add .sh files to workspace/scripts/</p>
              </div>
            ) : (
              scripts.map((script) => {
                const isPinned = favorites.includes(script.name);

                return (
                  <div
                    key={script.name}
                    className={cn(
                      "bg-zinc-900 rounded-xl border p-3 sm:p-4 card-hover overflow-hidden",
                      isPinned ? "border-orange-500/30" : "border-zinc-800"
                    )}
                  >
                    {/* Top row: pin + info */}
                    <div className="flex items-start gap-2 sm:gap-3">
                      <button
                        onClick={() => toggleFavorite(script.name)}
                        className={cn(
                          "p-1.5 sm:p-2 rounded-lg transition-colors shrink-0",
                          isPinned
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-zinc-800 text-zinc-500 hover:text-orange-400"
                        )}
                      >
                        <Star className={cn("w-4 h-4", isPinned && "fill-current")} />
                      </button>

                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <FileCode className="w-4 h-4 text-orange-500 shrink-0" />
                          <h3 className="font-medium font-mono text-xs sm:text-sm truncate">{script.name}</h3>
                          {script.lineCount && (
                            <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">
                              {script.lineCount} lines
                            </Badge>
                          )}
                          {isPinned && (
                            <Badge className="text-xs bg-orange-500/20 text-orange-400 border-0 shrink-0">
                              Pinned
                            </Badge>
                          )}
                          {script.source === "openclaw" && (
                            <Badge variant="outline" className="text-xs shrink-0 hidden sm:inline-flex">
                              .openclaw
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 sm:mt-2 leading-relaxed break-words line-clamp-2 sm:line-clamp-3">
                          {script.description}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 sm:mt-2 text-xs text-zinc-500">
                          {script.modifiedAt && <span>Modified {formatModifiedDate(script.modifiedAt)}</span>}
                          <span className="text-zinc-600 truncate hidden sm:inline">
                            {script.source === "openclaw"
                              ? "~/.openclaw/scripts/"
                              : "~/.openclaw/workspace/scripts/"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom row: action buttons */}
                    <div className="flex items-center gap-2 mt-3 ml-8 sm:ml-11 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => runScript(script.name)}
                        disabled={runningScript === script.name}
                        className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                      >
                        {runningScript === script.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 mr-1" />
                            Run
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setScheduleScript(script.name)}
                        className="h-8 px-2 sm:px-3 text-xs text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
                        title="Schedule as cron job"
                      >
                        <CalendarClock className="w-3.5 h-3.5 mr-1" />
                        Schedule
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDeleteScript(script.name)}
                        className="h-8 w-8 p-0 text-zinc-500 border-zinc-700 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
                        title="Delete script"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* LOG TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="log" className="space-y-4">
          {/* Header row with clear button */}
          {actionLog.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                Last {actionLog.length} actions (kept locally)
              </p>
              <button
                onClick={() => setActionLog([])}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>
          )}

          <section className="space-y-2">
            {actionLog.length === 0 ? (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                <ScrollText className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No actions recorded yet</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Run a script or trigger a cron job to see it here.
                </p>
              </div>
            ) : (
              actionLog.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 flex items-start gap-3"
                >
                  {/* Status icon */}
                  <div className="mt-0.5 shrink-0">
                    {entry.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{entry.name}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          entry.type === "cron" ? "text-sky-400" : "text-orange-400"
                        )}
                      >
                        {entry.type === "cron" ? "Cron" : "Script"}
                      </Badge>
                      {entry.durationMs !== undefined && (
                        <span className="text-xs text-zinc-600">
                          {entry.durationMs < 1000
                            ? `${entry.durationMs}ms`
                            : `${(entry.durationMs / 1000).toFixed(1)}s`}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {formatLogTime(entry.timestamp)}
                    </div>
                    {entry.error && (
                      <p className="text-xs text-red-400 mt-1 truncate">{entry.error}</p>
                    )}
                    {entry.output && !entry.error && (
                      <p className="text-xs text-zinc-500 mt-1 truncate">{entry.output}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Create Cron Job Modal */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showCreateCron && (
        <CreateCronModal
          onClose={() => setShowCreateCron(false)}
          onCreate={handleCreateCron}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Schedule Script Modal */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {scheduleScript && (
        <ScheduleScriptModal
          scriptName={scheduleScript}
          onClose={() => setScheduleScript(null)}
          onSchedule={(schedule) => handleScheduleScript(scheduleScript, schedule)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Confirm Delete Modal */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {confirmDeleteJob && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-sm p-6">
            <h3 className="font-semibold text-lg mb-2">Delete Job</h3>
            <p className="text-sm text-zinc-400 mb-6">
              Are you sure you want to delete this cron job? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteJob(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDeleteCron(confirmDeleteJob)}
                disabled={busyJobId === confirmDeleteJob}
              >
                {busyJobId === confirmDeleteJob ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Confirm Delete Script Modal */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {confirmDeleteScript && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-sm p-6">
            <h3 className="font-semibold text-lg mb-2">Delete Script</h3>
            <p className="text-sm text-zinc-400 mb-2">
              Are you sure you want to delete{" "}
              <strong className="text-zinc-200 font-mono">{confirmDeleteScript}</strong>?
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              This will permanently remove the file from disk. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteScript(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDeleteScript(confirmDeleteScript)}
                disabled={deletingScript === confirmDeleteScript}
              >
                {deletingScript === confirmDeleteScript ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Script Result Modal */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {result && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-2 min-w-0">
                {result.result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <h3 className="font-medium font-mono text-sm truncate">{result.script}</h3>
                <Badge variant={result.result.success ? "default" : "destructive"} className="shrink-0">
                  {result.result.success ? "Success" : "Failed"}
                </Badge>
              </div>
              <button
                onClick={() => setResult(null)}
                className="p-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {result.result.error && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-red-400 mb-1">Error</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.error}
                  </pre>
                </div>
              )}
              {result.result.stdout && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-zinc-300 mb-1">Output</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.stdout}
                  </pre>
                </div>
              )}
              {result.result.stderr && (
                <div>
                  <h4 className="text-sm font-medium text-yellow-400 mb-1">Stderr</h4>
                  <pre className="text-xs text-zinc-400 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {result.result.stderr}
                  </pre>
                </div>
              )}
              {!result.result.stdout && !result.result.stderr && !result.result.error && (
                <p className="text-zinc-400 text-sm">No output</p>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-zinc-800">
              <Button onClick={() => setResult(null)} variant="outline" className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Create Cron Job Modal
// ─────────────────────────────────────────────────────────────

function CreateCronModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (params: CronCreateParams) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [scheduleKind, setScheduleKind] = useState<"cron" | "every">("cron");
  const [cronExpr, setCronExpr] = useState("0 0 * * *");
  const [everyMinutes, setEveryMinutes] = useState("30");
  const [payloadText, setPayloadText] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !payloadText.trim()) return;
    setCreating(true);
    try {
      const schedule: CronCreateParams["schedule"] =
        scheduleKind === "cron"
          ? { kind: "cron", expr: cronExpr }
          : { kind: "every", everyMs: parseInt(everyMinutes) * 60000 };

      await onCreate({
        name: name.trim(),
        schedule,
        payload: { kind: "systemEvent", text: payloadText.trim() },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        enabled: true,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-semibold text-lg">New Scheduled Job</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Job Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Report"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          {/* Schedule Kind */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-2 block">Schedule</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setScheduleKind("cron")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  scheduleKind === "cron"
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Cron Expression
              </button>
              <button
                onClick={() => setScheduleKind("every")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  scheduleKind === "every"
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                )}
              >
                Every N minutes
              </button>
            </div>

            {scheduleKind === "cron" ? (
              <div>
                <input
                  type="text"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 0 * * *"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  {humanizeCron(cronExpr)}
                </p>
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  value={everyMinutes}
                  onChange={(e) => setEveryMinutes(e.target.value)}
                  min="1"
                  placeholder="30"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Every {everyMinutes || "?"} minutes
                </p>
              </div>
            )}
          </div>

          {/* Payload */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">
              Message / Payload
            </label>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              placeholder="What should the agent do when this job runs?"
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={handleSubmit}
            disabled={!name.trim() || !payloadText.trim() || creating}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Job"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Schedule Script Modal
// ─────────────────────────────────────────────────────────────

function ScheduleScriptModal({
  scriptName,
  onClose,
  onSchedule,
}: {
  scriptName: string;
  onClose: () => void;
  onSchedule: (schedule: CronCreateParams["schedule"]) => Promise<void>;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [cronExpr, setCronExpr] = useState("0 0 * * *");

  const handlePreset = async (preset: (typeof SCHEDULE_PRESETS)[number]) => {
    setScheduling(true);
    try {
      const schedule: CronCreateParams["schedule"] =
        preset.kind === "cron"
          ? { kind: "cron", expr: preset.expr }
          : { kind: "every", everyMs: preset.everyMs };
      await onSchedule(schedule);
    } finally {
      setScheduling(false);
    }
  };

  const handleCustom = async () => {
    if (!cronExpr.trim()) return;
    setScheduling(true);
    try {
      await onSchedule({ kind: "cron", expr: cronExpr.trim() });
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="font-semibold">Schedule Script</h3>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{scriptName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {scheduling ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          ) : customMode ? (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Cron Expression</label>
                <input
                  type="text"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  placeholder="0 0 * * *"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <p className="text-xs text-zinc-500 mt-1">{humanizeCron(cronExpr)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCustomMode(false)}>
                  Back
                </Button>
                <Button
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleCustom}
                  disabled={!cronExpr.trim()}
                >
                  Schedule
                </Button>
              </div>
            </div>
          ) : (
            <>
              {SCHEDULE_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handlePreset(preset)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm"
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setCustomMode(true)}
                className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-zinc-700 hover:bg-zinc-800 transition-colors text-sm text-zinc-400"
              >
                Custom cron expression...
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
