"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  GatewayClient,
  type GatewayHelloOk,
  type CronJob,
  type CronStatus,
  type CronListResponse,
  type SkillStatusReport,
  type HeartbeatEvent,
} from "./gateway-client";

interface GatewayState {
  connected: boolean;
  hello: GatewayHelloOk | null;
  cronJobs: CronJob[];
  cronStatus: CronStatus | null;
  skills: SkillStatusReport | null;
  lastHeartbeat: HeartbeatEvent | null;
  error: string | null;
}

interface GatewayContextValue extends GatewayState {
  refresh: () => Promise<void>;
  runCronJob: (jobId: string) => Promise<void>;
  toggleCronJob: (jobId: string, enabled: boolean) => Promise<void>;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function useGateway() {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error("useGateway must be used within a GatewayProvider");
  }
  return context;
}

interface GatewayProviderProps {
  children: React.ReactNode;
  gatewayUrl?: string;
  gatewayToken?: string;
}

export function GatewayProvider({
  children,
  gatewayUrl,
  gatewayToken,
}: GatewayProviderProps) {
  const [state, setState] = useState<GatewayState>({
    connected: false,
    hello: null,
    cronJobs: [],
    cronStatus: null,
    skills: null,
    lastHeartbeat: null,
    error: null,
  });

  const clientRef = useRef<GatewayClient | null>(null);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client?.connected) return;

    try {
      const [cronList, cronStatus, skills, heartbeat] = await Promise.all([
        client.request<CronListResponse>("cron.list", { includeDisabled: true }),
        client.request<CronStatus>("cron.status", {}),
        client.request<SkillStatusReport>("skills.status", {}),
        client.request<HeartbeatEvent>("last-heartbeat", {}),
      ]);

      setState((prev) => ({
        ...prev,
        cronJobs: cronList.jobs || [],
        cronStatus,
        skills,
        lastHeartbeat: heartbeat,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: String(err),
      }));
    }
  }, []);

  const runCronJob = useCallback(async (jobId: string) => {
    const client = clientRef.current;
    if (!client?.connected) return;

    await client.request("cron.run", { id: jobId, mode: "force" });
    await refresh();
  }, [refresh]);

  const toggleCronJob = useCallback(async (jobId: string, enabled: boolean) => {
    const client = clientRef.current;
    if (!client?.connected) return;

    await client.request("cron.update", { id: jobId, patch: { enabled } });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!gatewayUrl) return;

    const client = new GatewayClient({
      url: gatewayUrl,
      token: gatewayToken,
      onHello: (hello) => {
        setState((prev) => ({ ...prev, hello }));
      },
      onConnect: () => {
        setState((prev) => ({ ...prev, connected: true, error: null }));
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, connected: false }));
      },
      onClose: ({ reason }) => {
        if (reason) {
          setState((prev) => ({ ...prev, error: reason }));
        }
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [gatewayUrl, gatewayToken]);

  // Auto-refresh when connected
  useEffect(() => {
    if (state.connected) {
      refresh();
      const interval = setInterval(refresh, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [state.connected, refresh]);

  return (
    <GatewayContext.Provider
      value={{
        ...state,
        refresh,
        runCronJob,
        toggleCronJob,
      }}
    >
      {children}
    </GatewayContext.Provider>
  );
}
