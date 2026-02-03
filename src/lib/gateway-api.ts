"use client";

// Gateway API client - calls server-side proxy instead of direct WebSocket

export interface CronJob {
  id: string;
  agentId?: string;
  name: string;
  enabled: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule: {
    kind: "cron" | "every" | "at";
    expr?: string;
    tz?: string;
    everyMs?: number;
    atMs?: number;
  };
  sessionTarget: "main" | "isolated";
  wakeMode: "now" | "next-heartbeat";
  payload: {
    kind: "systemEvent" | "agentTurn";
    text?: string;
    message?: string;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastDurationMs?: number;
    runCount?: number;
    lastError?: string;
  };
}

export interface CronStatus {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number;
}

export interface HeartbeatEvent {
  ts?: number;
  text?: string;
  source?: string;
}

export interface SkillStatusEntry {
  skillKey: string;
  name: string;
  description: string;
  emoji?: string;
  source: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist?: boolean;
  always?: boolean;
  requirements?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
    os?: string[];
  };
  missing?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
    os?: string[];
  };
}

export interface SkillStatusReport {
  workspaceDir?: string;
  managedSkillsDir?: string;
  skills: SkillStatusEntry[];
}

async function gatewayCall<T>(method: string, params: unknown = {}): Promise<T> {
  const res = await fetch("/api/gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  
  const data = await res.json();
  
  if (!data.ok) {
    throw new Error(data.error || "Gateway request failed");
  }
  
  return data.data as T;
}

export async function getCronJobs(): Promise<CronJob[]> {
  const result = await gatewayCall<{ jobs: CronJob[] }>("cron.list", { includeDisabled: true });
  return result.jobs || [];
}

export async function getCronStatus(): Promise<CronStatus> {
  return gatewayCall<CronStatus>("cron.status", {});
}

export async function runCronJob(jobId: string): Promise<void> {
  await gatewayCall("cron.run", { id: jobId, mode: "force" });
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<void> {
  await gatewayCall("cron.update", { id: jobId, patch: { enabled } });
}

export async function getLastHeartbeat(): Promise<HeartbeatEvent | null> {
  try {
    return await gatewayCall<HeartbeatEvent>("last-heartbeat", {});
  } catch {
    return null;
  }
}

export async function getSkillsStatus(): Promise<SkillStatusReport | null> {
  try {
    return await gatewayCall<SkillStatusReport>("skills.status", {});
  } catch {
    return null;
  }
}

export async function getGatewayHealth(): Promise<{ connected: boolean; uptime?: number }> {
  try {
    const status = await gatewayCall<{ uptime?: number }>("status", {});
    return { connected: true, uptime: status.uptime };
  } catch {
    return { connected: false };
  }
}
