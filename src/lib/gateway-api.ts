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
    // Fast path: lightweight presence check (much smaller payload than `status`)
    await gatewayCall("system-presence", {});
    return { connected: true };
  } catch {
    // Fallback for older/newer gateway variants where system-presence may differ
    try {
      const status = await gatewayCall<{ uptime?: number }>("status", {});
      return { connected: true, uptime: status.uptime };
    } catch {
      return { connected: false };
    }
  }
}

// ─── Cron CRUD ───────────────────────────────────────────────

export interface CronCreateParams {
  name: string;
  schedule: CronJob["schedule"];
  payload: CronJob["payload"];
  sessionTarget?: "main" | "isolated";
  wakeMode?: "now" | "next-heartbeat";
  enabled?: boolean;
}

export async function createCronJob(params: CronCreateParams): Promise<CronJob> {
  return gatewayCall<CronJob>("cron.create", params);
}

export async function deleteCronJob(jobId: string): Promise<void> {
  await gatewayCall("cron.delete", { id: jobId });
}

// ─── Skills management ──────────────────────────────────────

export async function enableSkill(skillKey: string): Promise<void> {
  await gatewayCall("skills.enable", { key: skillKey });
}

export async function disableSkill(skillKey: string): Promise<void> {
  await gatewayCall("skills.disable", { key: skillKey });
}

export async function uninstallSkill(skillKey: string): Promise<void> {
  await gatewayCall("skills.uninstall", { key: skillKey });
}

export async function installSkill(skillKey: string): Promise<void> {
  await gatewayCall("skills.install", { key: skillKey });
}

// ─── Device management ───────────────────────────────────────

export interface DevicePairingPendingRequest {
  requestId: string;
  deviceId: string;
  publicKey?: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  ts?: number;
}

export interface PairedDevice {
  deviceId: string;
  publicKey?: string;
  displayName?: string;
  platform?: string;
  clientId?: string;
  clientMode?: string;
  role?: string;
  createdAtMs?: number;
  approvedAtMs?: number;
  tokens?: Record<string, { role: string; scopes: string[]; createdAtMs: number }>;
}

export interface DeviceListResponse {
  pending: DevicePairingPendingRequest[];
  paired: PairedDevice[];
}

export async function listDevices(): Promise<DeviceListResponse> {
  return gatewayCall<DeviceListResponse>("device.pair.list", {});
}

export async function approveDevice(requestId: string): Promise<void> {
  await gatewayCall("device.pair.approve", { requestId });
}

export async function rejectDevice(requestId: string): Promise<void> {
  await gatewayCall("device.pair.reject", { requestId });
}

export async function revokeDeviceToken(deviceId: string, role = "operator"): Promise<void> {
  await gatewayCall("device.token.revoke", { deviceId, role });
}

// ─── Session management ──────────────────────────────────────

export interface SessionListEntry {
  key: string;
  type: string;
  model?: string;
  tokenCount?: number;
  turnCount?: number;
  updatedAt?: number;
  createdAt?: number;
  active?: boolean;
}

export interface SessionStatus {
  key: string;
  active: boolean;
  model?: string;
  tokenCount?: number;
  turnCount?: number;
  updatedAt?: number;
}

export interface SessionHistoryEntry {
  role: string;
  content?: string;
  ts?: number;
  tokenCount?: number;
}

export async function listSessions(): Promise<SessionListEntry[]> {
  try {
    return await gatewayCall<SessionListEntry[]>("sessions_list", {});
  } catch {
    // Gateway method may not be available, fall back to API route
    const res = await fetch("/api/sessions");
    const data = await res.json();
    return data.sessions || [];
  }
}

export async function getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
  try {
    return await gatewayCall<SessionStatus>("session_status", { sessionId });
  } catch {
    return null;
  }
}

export async function getSessionHistory(
  sessionId: string,
  limit = 20
): Promise<SessionHistoryEntry[]> {
  try {
    return await gatewayCall<SessionHistoryEntry[]>("sessions_history", {
      sessionId,
      limit,
    });
  } catch {
    // Fall back to API route
    const res = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}&limit=${limit}`);
    const data = await res.json();
    return data.history || [];
  }
}
