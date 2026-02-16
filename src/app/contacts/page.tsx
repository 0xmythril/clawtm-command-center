"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  MessageSquare,
  Smartphone,
  RefreshCw,
  ArrowLeft,
  Ban,
  CheckCircle,
  XCircle,
  Loader2,
  Info,
  Pencil,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Sparkles,
  Radio,
  ExternalLink,
  LayoutDashboard,
  Settings,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listDevices,
  approveDevice,
  rejectDevice,
  revokeDeviceToken,
  getGatewayHealth,
  type PairedDevice,
  type DevicePairingPendingRequest,
} from "@/lib/gateway-api";

// ─── Types ──────────────────────────────────────────────────────────────

interface AddressBookIdentity {
  channel: string;
  id: string;
  handle?: string;
  platformName?: string;
}

interface MergedContactEntry {
  contactId: string | null;
  displayName: string;
  identities: AddressBookIdentity[];
  fromAddressBook: boolean;
  notes?: string;
}

interface AddressBookSuggestion {
  id: string;
  type: string;
  reason: string;
  identityA: { channel: string; id: string };
  identityB: { channel: string; id: string };
  confidence?: number;
  createdAt: number;
}

interface PeopleData {
  allowFrom: string[];
  pairingRequests: Array<{ id: string; code: string; createdAt: string; lastSeenAt?: string }>;
}

interface PeopleSectionResponse {
  channelsPeople: Record<string, { allowFrom: string[]; pairingRequests: PeopleData["pairingRequests"] }>;
  addressBook: { contacts: Record<string, { displayName: string; notes?: string; identities: AddressBookIdentity[] }>; suggestions: AddressBookSuggestion[] };
  mergedContacts: MergedContactEntry[];
}

interface GroupEntry {
  channel: string;
  groupId: string;
  settings: Record<string, unknown>;
}

interface DevicesData {
  pending: DevicePairingPendingRequest[];
  paired: PairedDevice[];
}

interface ChannelInfo {
  id: string;
  name: string;
  enabled: boolean;
  deepLink?: string;
  username?: string;
  icon: string;
  dmPolicy?: string;
  groupPolicy?: string;
  streamMode?: string;
  groupCount?: number;
  contactCount?: number;
}

interface GatewaySettings {
  port?: number;
  bind?: string;
  mode?: string;
  auth?: string;
  tailscale?: { mode?: string; resetOnExit?: boolean };
  controlUi?: { enabled?: boolean; allowedOrigins?: string[]; allowInsecureAuth?: boolean };
}

interface MessagesSettings {
  ackReactionScope?: string;
}

// ─── Channel visual metadata ────────────────────────────────────────────

const channelMeta: Record<string, { color: string; emoji: string }> = {
  telegram: { color: "from-sky-500/20 to-blue-500/20", emoji: "✈️" },
  discord: { color: "from-indigo-500/20 to-purple-500/20", emoji: "🎮" },
  slack: { color: "from-green-500/20 to-emerald-500/20", emoji: "💬" },
  whatsapp: { color: "from-green-500/20 to-lime-500/20", emoji: "📱" },
  signal: { color: "from-blue-500/20 to-sky-500/20", emoji: "🔒" },
  imessage: { color: "from-blue-500/20 to-cyan-500/20", emoji: "💬" },
};

function channelLabel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function ContactsPage() {
  return (
    <Suspense>
      <ContactsPageInner />
    </Suspense>
  );
}

function ContactsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // People state
  const [peopleSection, setPeopleSection] = useState<PeopleSectionResponse | null>(null);

  // Groups state
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [groupPolicy, setGroupPolicy] = useState<string>("");
  const [groupNicknames, setGroupNicknames] = useState<Record<string, string>>({});
  const [editingGroup, setEditingGroup] = useState<{ key: string; value: string } | null>(null);

  // Devices state
  const [devices, setDevices] = useState<DevicesData>({ pending: [], paired: [] });

  // Channels state
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [gatewaySettings, setGatewaySettings] = useState<GatewaySettings>({});
  const [messagesSettings, setMessagesSettings] = useState<MessagesSettings>({});
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [gatewayUptime, setGatewayUptime] = useState<number | undefined>();
  const [showGatewaySettings, setShowGatewaySettings] = useState(false);

  // Shared state
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [linkModalFor, setLinkModalFor] = useState<MergedContactEntry | null>(null);
  const [editingName, setEditingName] = useState<{ contactId: string; value: string } | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ contactId: string; value: string } | null>(null);
  const [nameModalFor, setNameModalFor] = useState<{ channel: string; id: string } | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [confirmRemoveGroup, setConfirmRemoveGroup] = useState<{ channel: string; groupId: string } | null>(null);

  // ─── Data fetching ──────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [peopleRes, groupsRes, devicesRes, channelsRes, health] = await Promise.all([
        fetch("/api/contacts?section=people"),
        fetch("/api/contacts?section=groups"),
        listDevices().catch(() => ({ pending: [], paired: [] })),
        fetch("/api/channels"),
        getGatewayHealth(),
      ]);
      const peopleData = await peopleRes.json();
      const groupsData = await groupsRes.json();
      const channelsData = await channelsRes.json();

      setPeopleSection(
        peopleData.mergedContacts && peopleData.addressBook ? peopleData : null
      );
      setGroups(groupsData.groups || []);
      setGroupPolicy(groupsData.groupPolicy || "allowlist");
      setGroupNicknames(groupsData.nicknames || {});
      setDevices(devicesRes);
      setChannels(channelsData.channels || []);
      setGatewaySettings(channelsData.gateway || {});
      setMessagesSettings(channelsData.messages || {});
      setGatewayConnected(health.connected);
      setGatewayUptime(health.uptime);
    } catch (err) {
      console.error("Failed to refresh contacts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─── Action handlers ────────────────────────────────────────────────

  const handleBlockUser = async (userId: string, ch = "telegram") => {
    setBusy(`block-${ch}-${userId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block-user", channel: ch, userId }),
      });
      await refresh();
    } catch (err) {
      console.error("Block failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleApprovePairing = async (code: string, ch = "telegram") => {
    setBusy(`approve-${code}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve-pairing", channel: ch, code }),
      });
      await refresh();
    } catch (err) {
      console.error("Approve pairing failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRejectPairing = async (code: string, ch = "telegram") => {
    setBusy(`reject-${code}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject-pairing", channel: ch, code }),
      });
      await refresh();
    } catch (err) {
      console.error("Reject pairing failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleApproveDevice = async (requestId: string) => {
    setBusy(`approve-dev-${requestId}`);
    try {
      await approveDevice(requestId);
      await refresh();
    } catch (err) {
      console.error("Approve device failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRejectDevice = async (requestId: string) => {
    setBusy(`reject-dev-${requestId}`);
    try {
      await rejectDevice(requestId);
      await refresh();
    } catch (err) {
      console.error("Reject device failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    setBusy(`revoke-${deviceId}`);
    try {
      await revokeDeviceToken(deviceId);
      await refresh();
    } catch (err) {
      console.error("Revoke device failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRenameContact = async (contactId: string, displayName: string) => {
    setBusy(`rename-${contactId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-contact", contactId, displayName }),
      });
      setEditingName(null);
      await refresh();
    } catch (err) {
      console.error("Rename failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRenameGroup = async (channel: string, groupId: string, displayName: string) => {
    const key = `${channel}:${groupId}`;
    setBusy(`rename-group-${key}`);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-group", channel, groupId, displayName }),
      });
      const data = await res.json();
      if (data.nicknames) setGroupNicknames(data.nicknames);
      setEditingGroup(null);
    } catch (err) {
      console.error("Rename group failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleUpdateGroupSettings = async (
    channel: string,
    groupId: string,
    settings: Record<string, unknown>
  ) => {
    const key = `${channel}:${groupId}`;
    setBusy(`group-settings-${key}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-group-settings", channel, groupId, settings }),
      });
      await refresh();
    } catch (err) {
      console.error("Update group settings failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleAddGroup = async (channel: string, groupId: string, settings: Record<string, unknown>) => {
    setBusy("add-group");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-group", channel, groupId, settings }),
      });
      const data = await res.json();
      if (data.error) {
        console.error("Add group failed:", data.error);
      } else {
        setShowAddGroup(false);
        await refresh();
      }
    } catch (err) {
      console.error("Add group failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveGroup = async (channel: string, groupId: string) => {
    const key = `${channel}:${groupId}`;
    setBusy(`remove-group-${key}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-group", channel, groupId }),
      });
      setConfirmRemoveGroup(null);
      setExpandedGroupKey(null);
      await refresh();
    } catch (err) {
      console.error("Remove group failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateContact = async (channel: string, id: string, displayName: string) => {
    setBusy(`create-${channel}-${id}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-contact", channel, id, displayName }),
      });
      await refresh();
    } catch (err) {
      console.error("Create contact failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleUpdateContactNotes = async (contactId: string, notes: string) => {
    setBusy(`notes-${contactId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-contact", contactId, notes }),
      });
      setEditingNotes(null);
      await refresh();
    } catch (err) {
      console.error("Update notes failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleUnlinkIdentity = async (contactId: string, channel: string, id: string) => {
    setBusy(`unlink-${contactId}-${channel}-${id}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink-identity", contactId, channel, id }),
      });
      setExpandedContactId(null);
      await refresh();
    } catch (err) {
      console.error("Unlink failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    setBusy(`delete-${contactId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-contact", contactId }),
      });
      setExpandedContactId(null);
      await refresh();
    } catch (err) {
      console.error("Delete contact failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string) => {
    setBusy(`accept-${suggestionId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept-suggestion", suggestionId }),
      });
      await refresh();
    } catch (err) {
      console.error("Accept suggestion failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    setBusy(`dismiss-${suggestionId}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss-suggestion", suggestionId }),
      });
      await refresh();
    } catch (err) {
      console.error("Dismiss suggestion failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const handleLinkIdentity = async (targetContactId: string, channel: string, id: string) => {
    setBusy(`link-${targetContactId}-${channel}-${id}`);
    try {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link-identity", contactId: targetContactId, channel, id }),
      });
      setLinkModalFor(null);
      await refresh();
    } catch (err) {
      console.error("Link identity failed:", err);
    } finally {
      setBusy(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  // ─── Computed values ────────────────────────────────────────────────

  const pendingPairingCount = peopleSection
    ? Object.values(peopleSection.channelsPeople).reduce((n, ch) => n + (ch.pairingRequests?.length ?? 0), 0)
    : 0;
  const suggestionCount = peopleSection?.addressBook?.suggestions?.length ?? 0;
  const contactCount = peopleSection?.mergedContacts?.length ?? 0;

  function formatUptime(seconds?: number): string {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  }

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            href="/"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">Contacts</h1>
            <p className="text-xs sm:text-sm text-zinc-400 truncate">
              Channels, people, groups & devices
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors btn-press disabled:opacity-50"
        >
          <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} strokeWidth={1.5} />
        </button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 bg-zinc-900">
          <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-800 text-xs px-1">
            <LayoutDashboard className="w-4 h-4 sm:mr-1 shrink-0" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="channels" className="data-[state=active]:bg-zinc-800 text-xs px-1">
            <Radio className="w-4 h-4 sm:mr-1 shrink-0" />
            <span className="hidden sm:inline">Channels</span>
          </TabsTrigger>
          <TabsTrigger value="people" className="data-[state=active]:bg-zinc-800 text-xs px-1">
            <Users className="w-4 h-4 sm:mr-1 shrink-0" />
            <span className="hidden sm:inline">People</span>
          </TabsTrigger>
          <TabsTrigger value="groups" className="data-[state=active]:bg-zinc-800 text-xs px-1">
            <MessageSquare className="w-4 h-4 sm:mr-1 shrink-0" />
            <span className="hidden sm:inline">Groups</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="data-[state=active]:bg-zinc-800 text-xs px-1">
            <Smartphone className="w-4 h-4 sm:mr-1 shrink-0" />
            <span className="hidden sm:inline">Devices</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-20 skeleton-shimmer rounded-xl" />
              <Skeleton className="h-20 skeleton-shimmer rounded-xl" />
              <Skeleton className="h-20 skeleton-shimmer rounded-xl" />
            </>
          ) : (
            <>
              {/* Channels summary */}
              <button
                type="button"
                onClick={() => setActiveTab("channels")}
                className="w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Radio className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Channels</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {channels.length} active
                        {gatewayConnected && (
                          <span className="text-emerald-400"> · Gateway connected</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex -space-x-1">
                      {channels.slice(0, 4).map((ch) => (
                        <span
                          key={ch.id}
                          className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs"
                          title={ch.name}
                        >
                          {channelMeta[ch.icon]?.emoji || "📡"}
                        </span>
                      ))}
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </div>
              </button>

              {/* People summary */}
              <button
                type="button"
                onClick={() => setActiveTab("people")}
                className="w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Users className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">People</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {contactCount} contact{contactCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pendingPairingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                        {pendingPairingCount} pending
                      </span>
                    )}
                    {suggestionCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
                        {suggestionCount} suggestion{suggestionCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </div>
              </button>

              {/* Groups summary */}
              <button
                type="button"
                onClick={() => setActiveTab("groups")}
                className="w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Groups</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {groups.length} group{groups.length !== 1 ? "s" : ""} · Policy: {groupPolicy}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                </div>
              </button>

              {/* Devices summary */}
              <button
                type="button"
                onClick={() => setActiveTab("devices")}
                className="w-full text-left bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Smartphone className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Devices</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {devices.paired.length} paired
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {devices.pending.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">
                        {devices.pending.length} pending
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </div>
              </button>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CHANNELS TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="channels" className="space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-32 skeleton-shimmer rounded-xl" />
              <Skeleton className="h-32 skeleton-shimmer rounded-xl" />
            </>
          ) : (
            <>
              {/* Gateway status bar */}
              <div className="flex items-center justify-between bg-zinc-900 rounded-xl border border-zinc-800 p-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    gatewayConnected ? "bg-emerald-500" : "bg-red-500"
                  )} />
                  <span className="text-sm font-medium">
                    Gateway {gatewayConnected ? "Connected" : "Disconnected"}
                  </span>
                  {gatewayUptime && (
                    <span className="text-xs text-zinc-500">
                      · Up {formatUptime(gatewayUptime)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowGatewaySettings(!showGatewaySettings)}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                  title="Gateway settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>

              {/* Gateway settings panel (collapsed by default) */}
              {showGatewaySettings && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Gateway Settings</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-zinc-500 text-xs">Port</span>
                      <div className="text-zinc-300 font-mono text-xs">{gatewaySettings.port ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Bind</span>
                      <div className="text-zinc-300 font-mono text-xs">{gatewaySettings.bind ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Auth</span>
                      <div className="text-zinc-300 font-mono text-xs">{gatewaySettings.auth ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Mode</span>
                      <div className="text-zinc-300 font-mono text-xs">{gatewaySettings.mode ?? "—"}</div>
                    </div>
                  </div>
                  {gatewaySettings.tailscale && (
                    <div>
                      <span className="text-zinc-500 text-xs">Tailscale</span>
                      <div className="text-zinc-300 font-mono text-xs">
                        {gatewaySettings.tailscale.mode ?? "—"} · Reset on exit: {String(gatewaySettings.tailscale.resetOnExit ?? false)}
                      </div>
                    </div>
                  )}
                  {messagesSettings.ackReactionScope && (
                    <div>
                      <span className="text-zinc-500 text-xs">Ack Reactions</span>
                      <div className="text-zinc-300 font-mono text-xs">{messagesSettings.ackReactionScope}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Channel cards */}
              {channels.length === 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
                  <Radio className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 font-medium">No channels configured</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Add channels in openclaw.json to get started
                  </p>
                </div>
              ) : (
                channels.map((channel) => {
                  const meta = channelMeta[channel.icon] || { color: "from-zinc-500/20 to-zinc-600/20", emoji: "📡" };
                  return (
                    <div
                      key={channel.id}
                      className={cn(
                        "bg-gradient-to-br rounded-xl border border-zinc-800 p-4 space-y-3",
                        meta.color
                      )}
                    >
                      {/* Channel header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{meta.emoji}</span>
                          <div>
                            <div className="font-medium">{channel.name}</div>
                            {channel.username && (
                              <div className="text-xs text-zinc-400">@{channel.username}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active" />
                          {channel.deepLink && (
                            <a
                              href={channel.deepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                              title="Open"
                            >
                              <ExternalLink className="w-4 h-4 text-zinc-400" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Channel stats */}
                      <div className="flex flex-wrap gap-2">
                        {channel.dmPolicy && (
                          <Badge variant="secondary" className="text-xs">
                            DM: {channel.dmPolicy}
                          </Badge>
                        )}
                        {channel.groupPolicy && (
                          <Badge variant="secondary" className="text-xs">
                            Groups: {channel.groupPolicy}
                          </Badge>
                        )}
                        {channel.streamMode && (
                          <Badge variant="secondary" className="text-xs">
                            Stream: {channel.streamMode}
                          </Badge>
                        )}
                      </div>

                      {/* Contact & group counts */}
                      <div className="flex gap-4 text-xs text-zinc-400">
                        <span>{channel.contactCount ?? 0} allowed contact{(channel.contactCount ?? 0) !== 1 ? "s" : ""}</span>
                        <span>{channel.groupCount ?? 0} group{(channel.groupCount ?? 0) !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PEOPLE TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="people" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              {peopleSection?.channelsPeople &&
                Object.entries(peopleSection.channelsPeople).map(([ch, data]) =>
                  (data.pairingRequests?.length ?? 0) > 0 ? (
                    <section key={ch}>
                      <h3 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                        Pending pairing requests ({channelLabel(ch)})
                        <Badge variant="secondary" className="text-xs">
                          {data.pairingRequests.length}
                        </Badge>
                      </h3>
                      <div className="space-y-2">
                        {data.pairingRequests.map((req) => (
                          <div
                            key={`${ch}-${req.code}`}
                            className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4"
                          >
                            <div className="min-w-0">
                              <div className="font-mono text-sm truncate">{req.id}</div>
                              <div className="text-xs text-zinc-500">
                                Code: {req.code} · {formatDate(req.createdAt)}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleApprovePairing(req.code, ch)}
                                disabled={busy !== null}
                              >
                                {busy === `approve-${req.code}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-400 border-red-500/30"
                                onClick={() => handleRejectPairing(req.code, ch)}
                                disabled={busy !== null}
                              >
                                {busy === `reject-${req.code}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Reject
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null
                )}

              {peopleSection?.addressBook?.suggestions?.length ? (
                <section>
                  <h3 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Bot suggestions
                  </h3>
                  <div className="space-y-2">
                    {peopleSection.addressBook.suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className="bg-emerald-500/10 rounded-xl border border-emerald-500/30 p-3 sm:p-4 space-y-2"
                      >
                        <p className="text-xs sm:text-sm text-zinc-300 break-words">
                          {sug.reason} — {channelLabel(sug.identityA.channel)} {sug.identityA.id} ↔ {channelLabel(sug.identityB.channel)} {sug.identityB.id}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleAcceptSuggestion(sug.id)}
                            disabled={busy !== null}
                          >
                            {busy === `accept-${sug.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Accept"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDismissSuggestion(sug.id)}
                            disabled={busy !== null}
                          >
                            {busy === `dismiss-${sug.id}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Dismiss"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Contacts</h3>
                {!peopleSection?.mergedContacts?.length ? (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 text-center text-zinc-400 text-sm">
                    No contacts yet. Approve a pairing request or add user IDs in config.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {peopleSection.mergedContacts.map((entry) => {
                      const isExpanded = expandedContactId === entry.contactId || (entry.contactId === null && expandedContactId === `unlinked-${entry.identities[0]?.channel}-${entry.identities[0]?.id}`);
                      const expandKey = entry.contactId ?? `unlinked-${entry.identities[0]?.channel}-${entry.identities[0]?.id}`;
                      return (
                        <div
                          key={expandKey}
                          className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden"
                        >
                          <div
                            className="p-3 sm:p-4 cursor-pointer"
                            onClick={() =>
                              setExpandedContactId(isExpanded ? null : expandKey)
                            }
                          >
                            <div className="flex items-start gap-2 sm:gap-3">
                              <span className="text-lg sm:text-xl shrink-0 mt-0.5">👤</span>
                              <div className="min-w-0 flex-1">
                                {entry.contactId && editingName?.contactId === entry.contactId ? (
                                  <input
                                    type="text"
                                    value={editingName.value}
                                    onChange={(e) =>
                                      setEditingName({ ...editingName, value: e.target.value })
                                    }
                                    onBlur={() => {
                                      if (editingName.value.trim())
                                        handleRenameContact(entry.contactId!, editingName.value.trim());
                                      setEditingName(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        if (editingName.value.trim())
                                          handleRenameContact(entry.contactId!, editingName.value.trim());
                                        setEditingName(null);
                                      }
                                      if (e.key === "Escape") setEditingName(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full max-w-[200px]"
                                  />
                                ) : (
                                  <div className="font-medium text-sm truncate">
                                    {entry.displayName}
                                    {entry.identities.length > 1 && (
                                      <span className="text-zinc-500 font-normal ml-1">
                                        ({entry.identities.length} linked)
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {entry.identities.map((ident) => (
                                    <Badge
                                      key={`${ident.channel}-${ident.id}`}
                                      variant="secondary"
                                      className="text-xs max-w-[180px] sm:max-w-none truncate"
                                    >
                                      {channelLabel(ident.channel)} · {ident.id}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="w-5 h-5 text-zinc-500" />
                                ) : (
                                  <ChevronDown className="w-5 h-5 text-zinc-500" />
                                )}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div
                              className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-900/50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {entry.contactId ? (
                                <>
                                  <div>
                                    <div className="text-xs font-medium text-zinc-500 mb-1">
                                      Linked identities
                                    </div>
                                    <ul className="space-y-2">
                                      {entry.identities.map((ident) => (
                                        <li
                                          key={`${ident.channel}-${ident.id}`}
                                          className="flex items-center justify-between gap-2 text-sm"
                                        >
                                          <span>
                                            <Badge variant="secondary" className="mr-2">
                                              {channelLabel(ident.channel)}
                                            </Badge>
                                            {ident.id}
                                            {ident.handle && ` (${ident.handle})`}
                                          </span>
                                          {entry.identities.length > 1 && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-red-400 hover:text-red-300"
                                              onClick={() =>
                                                handleUnlinkIdentity(entry.contactId!, ident.channel, ident.id)
                                              }
                                              disabled={busy !== null}
                                            >
                                              <Unlink className="w-4 h-4" />
                                            </Button>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="mt-2"
                                      onClick={() => setLinkModalFor(entry)}
                                      disabled={busy !== null}
                                    >
                                      <Link2 className="w-4 h-4 mr-1" />
                                      Link another identity
                                    </Button>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() =>
                                        setEditingName({
                                          contactId: entry.contactId!,
                                          value: entry.displayName,
                                        })
                                      }
                                      disabled={busy !== null}
                                    >
                                      <Pencil className="w-3.5 h-3.5 mr-1" />
                                      Rename
                                    </Button>
                                    {entry.identities[0] && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                                        onClick={() =>
                                          handleBlockUser(entry.identities[0].id, entry.identities[0].channel)
                                        }
                                        disabled={busy !== null}
                                      >
                                        <Ban className="w-3.5 h-3.5 mr-1" />
                                        Block
                                      </Button>
                                    )}
                                  </div>

                                  <div>
                                    <div className="text-xs font-medium text-zinc-500 mb-1">Notes</div>
                                    {editingNotes?.contactId === entry.contactId ? (
                                      <textarea
                                        value={editingNotes.value}
                                        onChange={(e) =>
                                          setEditingNotes({ ...editingNotes, value: e.target.value })
                                        }
                                        onBlur={() => {
                                          handleUpdateContactNotes(entry.contactId!, editingNotes.value);
                                          setEditingNotes(null);
                                        }}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm min-h-[60px]"
                                        placeholder="Optional notes"
                                      />
                                    ) : (
                                      <p
                                        className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-300"
                                        onClick={() =>
                                          setEditingNotes({
                                            contactId: entry.contactId!,
                                            value: entry.notes ?? "",
                                          })
                                        }
                                      >
                                        {entry.notes || "Add notes..."}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-400 border-red-500/30"
                                    onClick={() => handleDeleteContact(entry.contactId!)}
                                    disabled={busy !== null}
                                  >
                                    Remove from address book
                                  </Button>
                                </>
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-xs font-medium text-zinc-500">
                                    This contact is from channel config only. Name it to add to your address book.
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <Badge variant="secondary">
                                      {channelLabel(entry.identities[0]?.channel ?? "")}
                                    </Badge>
                                    <span className="font-mono">{entry.identities[0]?.id}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setNameModalFor({
                                        channel: entry.identities[0].channel,
                                        id: entry.identities[0].id,
                                      })
                                    }
                                    disabled={busy !== null}
                                  >
                                    <Pencil className="w-4 h-4 mr-1" />
                                    Add to address book
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* GROUPS TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="groups" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              {/* Header row with policy + add button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50 flex-1">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Group policy: <strong className="text-zinc-400">{groupPolicy}</strong> · {groups.length} group{groups.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddGroup(true)}
                  className="h-9 px-3 bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>

              {groups.length === 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 sm:p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 font-medium">No groups configured</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Add a group to allow the bot to participate in group chats.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((g) => {
                    const nickKey = `${g.channel}:${g.groupId}`;
                    const nickname = groupNicknames[nickKey];
                    const isEditing = editingGroup?.key === nickKey;
                    const isExpanded = expandedGroupKey === nickKey;
                    const requireMention = g.settings?.requireMention;
                    const meta = channelMeta[g.channel] || { color: "from-zinc-500/20 to-zinc-600/20", emoji: "📡" };

                    return (
                      <div
                        key={`${g.channel}-${g.groupId}`}
                        className={cn(
                          "bg-gradient-to-br rounded-xl border border-zinc-800 overflow-hidden",
                          meta.color
                        )}
                      >
                        {/* Group header row */}
                        <div
                          className="p-3 sm:p-4 cursor-pointer"
                          onClick={() => setExpandedGroupKey(isExpanded ? null : nickKey)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl shrink-0">{meta.emoji}</span>
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingGroup.value}
                                  onChange={(e) =>
                                    setEditingGroup({ ...editingGroup, value: e.target.value })
                                  }
                                  onBlur={() => {
                                    handleRenameGroup(g.channel, g.groupId, editingGroup.value);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleRenameGroup(g.channel, g.groupId, editingGroup.value);
                                    }
                                    if (e.key === "Escape") setEditingGroup(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm w-full max-w-[220px]"
                                />
                              ) : (
                                <div className="font-medium text-sm truncate">
                                  {nickname || g.groupId}
                                  {nickname && (
                                    <span className="text-zinc-600 font-mono text-xs ml-1.5">
                                      {g.groupId}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500">
                                <Badge variant="secondary" className="text-xs">
                                  {channelLabel(g.channel)}
                                </Badge>
                                {requireMention !== undefined && (
                                  <span className={cn(
                                    "flex items-center gap-1",
                                    requireMention ? "text-emerald-400" : "text-zinc-500"
                                  )}>
                                    {requireMention ? (
                                      <ToggleRight className="w-3 h-3" />
                                    ) : (
                                      <ToggleLeft className="w-3 h-3" />
                                    )}
                                    mention {requireMention ? "required" : "not required"}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGroup({ key: nickKey, value: nickname || "" });
                                }}
                                className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
                                title="Rename group"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-zinc-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-zinc-500" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded settings */}
                        {isExpanded && (
                          <div
                            className="border-t border-zinc-800 p-4 space-y-4 bg-zinc-900/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Require Mention toggle */}
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-zinc-300">Require Mention</div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  Bot only responds when @mentioned in this group
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  handleUpdateGroupSettings(g.channel, g.groupId, {
                                    requireMention: !requireMention,
                                  })
                                }
                                disabled={busy === `group-settings-${nickKey}`}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                  requireMention ? "bg-emerald-500" : "bg-zinc-700"
                                )}
                              >
                                {busy === `group-settings-${nickKey}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                                ) : (
                                  <span
                                    className={cn(
                                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                      requireMention ? "translate-x-6" : "translate-x-1"
                                    )}
                                  />
                                )}
                              </button>
                            </div>

                            {/* Other settings (read from config) */}
                            {Object.entries(g.settings).filter(([k]) => k !== "requireMention").length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-zinc-500 mb-2">Other Settings</div>
                                <div className="space-y-1.5">
                                  {Object.entries(g.settings)
                                    .filter(([k]) => k !== "requireMention")
                                    .map(([key, value]) => (
                                      <div key={key} className="flex items-center justify-between text-xs">
                                        <span className="text-zinc-400">{key}</span>
                                        <span className="text-zinc-300 font-mono">{JSON.stringify(value)}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Group ID info */}
                            <div className="pt-2 border-t border-zinc-800">
                              <div className="flex items-center justify-between text-xs mb-3">
                                <span className="text-zinc-500">Group ID</span>
                                <code className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">
                                  {g.groupId}
                                </code>
                              </div>
                              <div className="flex items-center justify-between text-xs mb-3">
                                <span className="text-zinc-500">Channel</span>
                                <span className="text-zinc-400">{channelLabel(g.channel)}</span>
                              </div>
                            </div>

                            {/* Remove group */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                              onClick={() =>
                                setConfirmRemoveGroup({ channel: g.channel, groupId: g.groupId })
                              }
                              disabled={busy !== null}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                              Remove Group
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* DEVICES TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="devices" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              {devices.pending.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                    Pending devices
                    <Badge variant="secondary" className="text-xs">
                      {devices.pending.length}
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    {devices.pending.map((p) => (
                      <div
                        key={p.requestId}
                        className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs sm:text-sm truncate">{p.deviceId}</div>
                          <div className="text-xs text-zinc-500">
                            {p.clientId ?? "—"} · {p.platform ?? "—"}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleApproveDevice(p.requestId)}
                            disabled={busy !== null}
                          >
                            {busy === `approve-dev-${p.requestId}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Approve"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-400 border-red-500/30"
                            onClick={() => handleRejectDevice(p.requestId)}
                            disabled={busy !== null}
                          >
                            {busy === `reject-dev-${p.requestId}` ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Reject"
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Paired devices</h3>
                {devices.paired.length === 0 ? (
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 sm:p-5 text-center text-zinc-400 text-sm">
                    No paired devices
                  </div>
                ) : (
                  <div className="space-y-2">
                    {devices.paired.map((d) => (
                      <div
                        key={d.deviceId}
                        className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Smartphone className="w-5 h-5 text-zinc-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                              {d.displayName || d.clientId || d.deviceId.slice(0, 12)}
                            </div>
                            <div className="text-xs text-zinc-500 truncate">
                              {d.platform ?? "—"} · {d.role ?? "—"} · {d.createdAtMs ? formatDate(new Date(d.createdAtMs).toISOString()) : ""}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => handleRevokeDevice(d.deviceId)}
                          disabled={busy !== null}
                        >
                          {busy === `revoke-${d.deviceId}` ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Revoke"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Modals ───────────────────────────────────────────────────── */}

      {linkModalFor?.contactId && peopleSection && (
        <LinkIdentityModal
          contact={linkModalFor}
          peopleSection={peopleSection}
          onClose={() => setLinkModalFor(null)}
          onLink={handleLinkIdentity}
          busy={busy}
          channelLabel={channelLabel}
        />
      )}

      {nameModalFor && (
        <NameContactModal
          identity={nameModalFor}
          onClose={() => setNameModalFor(null)}
          onSave={(displayName) =>
            handleCreateContact(nameModalFor.channel, nameModalFor.id, displayName)
          }
          busy={busy}
          channelLabel={channelLabel}
        />
      )}

      {showAddGroup && (
        <AddGroupModal
          channels={channels}
          onClose={() => setShowAddGroup(false)}
          onAdd={handleAddGroup}
          busy={busy}
          channelLabel={channelLabel}
        />
      )}

      {confirmRemoveGroup && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-sm p-4 sm:p-5">
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="font-semibold text-lg mb-2">Remove Group</h3>
            <p className="text-sm text-zinc-400 mb-2">
              Remove group{" "}
              <strong className="text-zinc-200 font-mono">{confirmRemoveGroup.groupId}</strong>{" "}
              from {channelLabel(confirmRemoveGroup.channel)}?
            </p>
            <p className="text-xs text-zinc-500 mb-6">
              The bot will no longer respond in this group. This modifies openclaw.json.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmRemoveGroup(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleRemoveGroup(confirmRemoveGroup.channel, confirmRemoveGroup.groupId)}
                disabled={busy === `remove-group-${confirmRemoveGroup.channel}:${confirmRemoveGroup.groupId}`}
              >
                {busy === `remove-group-${confirmRemoveGroup.channel}:${confirmRemoveGroup.groupId}` ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Remove
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Name / Add to Address Book Modal ─────────────────────────────────────
function NameContactModal({
  identity,
  onClose,
  onSave,
  busy,
  channelLabel,
}: {
  identity: { channel: string; id: string };
  onClose: () => void;
  onSave: (displayName: string) => Promise<void>;
  busy: string | null;
  channelLabel: (ch: string) => string;
}) {
  const [name, setName] = useState(identity.id);
  const isBusy = busy === `create-${identity.channel}-${identity.id}`;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSave(name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-sm">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-2 sm:hidden" />
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-semibold text-lg">Add to Address Book</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Badge variant="secondary">{channelLabel(identity.channel)}</Badge>
            <span className="font-mono truncate">{identity.id}</span>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") onClose();
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
        </div>
        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={handleSubmit}
            disabled={!name.trim() || isBusy}
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Link Identity Modal ───────────────────────────────────────────────────
function LinkIdentityModal({
  contact,
  peopleSection,
  onClose,
  onLink,
  busy,
  channelLabel,
}: {
  contact: MergedContactEntry;
  peopleSection: PeopleSectionResponse;
  onClose: () => void;
  onLink: (targetContactId: string, channel: string, id: string) => Promise<void>;
  busy: string | null;
  channelLabel: (ch: string) => string;
}) {
  const [query, setQuery] = useState("");
  const linkedSet = new Set<string>();
  for (const c of Object.values(peopleSection.addressBook.contacts)) {
    for (const i of c.identities) {
      linkedSet.add(`${i.channel}:${i.id}`);
    }
  }
  for (const i of contact.identities) {
    linkedSet.add(`${i.channel}:${i.id}`);
  }
  const candidates: { channel: string; id: string }[] = [];
  for (const [ch, data] of Object.entries(peopleSection.channelsPeople)) {
    for (const id of data.allowFrom ?? []) {
      const key = `${ch}:${id}`;
      if (!linkedSet.has(key)) candidates.push({ channel: ch, id });
    }
  }
  const filtered = query.trim()
    ? candidates.filter(
        (c) =>
          c.id.toLowerCase().includes(query.toLowerCase()) ||
          channelLabel(c.channel).toLowerCase().includes(query.toLowerCase())
      )
    : candidates;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-2 sm:hidden" />
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-semibold text-lg">Link identity to {contact.displayName}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by channel or ID..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-3"
          />
        </div>
        <ScrollArea className="flex-1 max-h-[50vh] px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">
              {candidates.length === 0
                ? "No other identities to link. All allowed contacts are already in the address book."
                : "No matches for your search."}
            </p>
          ) : (
            <ul className="space-y-2 pb-4">
              {filtered.map((c) => (
                <li key={`${c.channel}:${c.id}`}>
                  <button
                    type="button"
                    onClick={() => onLink(contact.contactId!, c.channel, c.id)}
                    disabled={busy !== null}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-750 transition-colors text-left"
                  >
                    <span className="font-mono text-sm">{c.id}</span>
                    <Badge variant="secondary">{channelLabel(c.channel)}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ─── Add Group Modal ───────────────────────────────────────────────────────
function AddGroupModal({
  channels,
  onClose,
  onAdd,
  busy,
  channelLabel,
}: {
  channels: ChannelInfo[];
  onClose: () => void;
  onAdd: (channel: string, groupId: string, settings: Record<string, unknown>) => Promise<void>;
  busy: string | null;
  channelLabel: (ch: string) => string;
}) {
  const [channel, setChannel] = useState(channels[0]?.id || "");
  const [groupId, setGroupId] = useState("");
  const [requireMention, setRequireMention] = useState(true);
  const isBusy = busy === "add-group";

  const handleSubmit = async () => {
    const trimmed = groupId.trim();
    if (!trimmed || !channel) return;
    await onAdd(channel, trimmed, { requireMention });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-zinc-900 rounded-t-2xl sm:rounded-xl border border-zinc-800 w-full max-w-sm">
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mt-2 sm:hidden" />
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-semibold text-lg">Add Group</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Channel selector */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {channelLabel(ch.id)}
                </option>
              ))}
            </select>
          </div>

          {/* Group ID */}
          <div>
            <label className="text-sm font-medium text-zinc-300 mb-1 block">Group ID</label>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="e.g. -5159692794"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") onClose();
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <p className="text-xs text-zinc-500 mt-1">
              The numeric group/chat ID from the platform
            </p>
          </div>

          {/* Require Mention toggle */}
          <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3">
            <div>
              <div className="text-sm font-medium text-zinc-300">Require Mention</div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Only respond when @mentioned
              </p>
            </div>
            <button
              onClick={() => setRequireMention(!requireMention)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                requireMention ? "bg-emerald-500" : "bg-zinc-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  requireMention ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={handleSubmit}
            disabled={!groupId.trim() || !channel || isBusy}
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Group"}
          </Button>
        </div>
      </div>
    </div>
  );
}
