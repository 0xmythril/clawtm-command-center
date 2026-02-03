"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Play, Pause, RefreshCw, Clock, Loader2, Info, CheckCircle, XCircle, 
  AlertCircle, Settings, Zap, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCronJobs,
  getCronStatus,
  getSkillsStatus,
  runCronJob,
  toggleCronJob,
  type CronJob,
  type CronStatus,
  type SkillStatusEntry,
} from "@/lib/gateway-api";

// Human-readable cron expression
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

export default function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobs, status, skillsReport] = await Promise.all([
        getCronJobs(),
        getCronStatus(),
        getSkillsStatus(),
      ]);
      setCronJobs(jobs);
      setCronStatus(status);
      setSkills(skillsReport?.skills || []);
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

  const handleRun = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await runCronJob(jobId);
      await refresh();
    } catch (err) {
      console.error("Failed to run job:", err);
    } finally {
      setBusyJobId(null);
    }
  };

  const handleToggle = async (jobId: string, enabled: boolean) => {
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

  const enabledCronCount = cronJobs.filter((j) => j.enabled).length;
  const eligibleSkillsCount = skills.filter((s) => s.eligible && !s.disabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Config</h1>
            <p className="text-sm text-zinc-400">Cron jobs & skills</p>
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
      <Tabs defaultValue="cron" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900">
          <TabsTrigger value="cron" className="data-[state=active]:bg-zinc-800">
            <Clock className="w-4 h-4 mr-2" />
            Cron ({enabledCronCount})
          </TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-zinc-800">
            <Zap className="w-4 h-4 mr-2" />
            Skills ({eligibleSkillsCount})
          </TabsTrigger>
        </TabsList>

        {/* Cron Tab */}
        <TabsContent value="cron" className="space-y-4">
          {/* Next Wake Card */}
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
              <Badge variant={cronStatus?.enabled ? "default" : "secondary"}>
                {cronStatus?.enabled ? "Active" : "Paused"}
              </Badge>
            </div>
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
                <p className="text-zinc-400">No cron jobs configured</p>
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
                    <div className="flex items-start justify-between gap-4">
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{job.name}</h3>
                          <Badge variant={job.enabled ? "default" : "secondary"} className="text-xs">
                            {job.enabled ? "On" : "Off"}
                          </Badge>
                          {job.state?.lastStatus && getStatusIcon(job.state.lastStatus)}
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
                          onClick={() => handleToggle(job.id, !job.enabled)}
                          disabled={busyJobId === job.id}
                          className="h-8 w-8 p-0"
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
                          onClick={() => handleRun(job.id)}
                          disabled={busyJobId === job.id}
                          className="h-8 px-3 bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          {busyJobId === job.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run"}
                        </Button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Action</div>
                          <div className="text-sm text-zinc-300 break-words">{payloadDesc}</div>
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
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills" className="space-y-4">
          {/* Skills Summary */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-orange-500" />
              <div>
                <span className="font-medium">{skills.length} Skills Available</span>
                <div className="text-sm text-zinc-400">
                  {eligibleSkillsCount} eligible · {skills.filter(s => s.disabled).length} disabled
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
                <p className="text-zinc-400">No skills found</p>
              </div>
            ) : (
              skills.map((skill) => {
                const isExpanded = expandedSkill === skill.skillKey;
                const hasMissing = skill.missing && (
                  (skill.missing.bins?.length || 0) > 0 ||
                  (skill.missing.env?.length || 0) > 0 ||
                  (skill.missing.os?.length || 0) > 0
                );
                
                return (
                  <div
                    key={skill.skillKey}
                    className={cn(
                      "bg-zinc-900 rounded-xl border p-4 transition-all",
                      skill.disabled ? "border-zinc-800/50 opacity-50" : "border-zinc-800"
                    )}
                  >
                    <div
                      className="flex items-start justify-between gap-3 cursor-pointer"
                      onClick={() => setExpandedSkill(isExpanded ? null : skill.skillKey)}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-xl">{skill.emoji || "🔧"}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{skill.name}</h3>
                            {skill.eligible && !skill.disabled ? (
                              <Badge className="text-xs bg-green-500/20 text-green-400 border-0">
                                Eligible
                              </Badge>
                            ) : skill.disabled ? (
                              <Badge variant="destructive" className="text-xs">
                                Disabled
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not Available
                              </Badge>
                            )}
                            {skill.always && (
                              <Badge variant="outline" className="text-xs">
                                Always
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{skill.description}</p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-zinc-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3 text-sm">
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
                        
                        {hasMissing && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <div className="text-xs font-medium text-red-400 mb-1">Missing Requirements</div>
                            <div className="text-xs text-zinc-400 space-y-1">
                              {skill.missing?.bins?.length ? (
                                <div>Binaries: {skill.missing.bins.join(", ")}</div>
                              ) : null}
                              {skill.missing?.env?.length ? (
                                <div>Env vars: {skill.missing.env.join(", ")}</div>
                              ) : null}
                              {skill.missing?.os?.length ? (
                                <div>OS: {skill.missing.os.join(", ")}</div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
