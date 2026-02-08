"use client";

import { useEffect, useState, useCallback } from "react";
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
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listDevices,
  approveDevice,
  rejectDevice,
  revokeDeviceToken,
  type PairedDevice,
  type DevicePairingPendingRequest,
} from "@/lib/gateway-api";

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

function channelLabel(channel: string): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export default function ContactsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [peopleSection, setPeopleSection] = useState<PeopleSectionResponse | null>(null);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [groupPolicy, setGroupPolicy] = useState<string>("");
  const [devices, setDevices] = useState<DevicesData>({ pending: [], paired: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [linkModalFor, setLinkModalFor] = useState<MergedContactEntry | null>(null);
  const [editingName, setEditingName] = useState<{ contactId: string; value: string } | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ contactId: string; value: string } | null>(null);
  const [nameModalFor, setNameModalFor] = useState<{ channel: string; id: string } | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [peopleRes, groupsRes, devicesRes] = await Promise.all([
        fetch("/api/contacts?section=people"),
        fetch("/api/contacts?section=groups"),
        listDevices().catch(() => ({ pending: [], paired: [] })),
      ]);
      const peopleData = await peopleRes.json();
      const groupsData = await groupsRes.json();
      setPeopleSection(
        peopleData.mergedContacts && peopleData.addressBook ? peopleData : null
      );
      setGroups(groupsData.groups || []);
      setGroupPolicy(groupsData.groupPolicy || "allowlist");
      setDevices(devicesRes);
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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Contacts & Access</h1>
            <p className="text-sm text-zinc-400">
              People, groups, and devices that can reach your bot
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

      <Tabs defaultValue="people" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 bg-zinc-900">
          <TabsTrigger value="people" className="data-[state=active]:bg-zinc-800">
            <Users className="w-4 h-4 mr-2" />
            People ({peopleSection?.mergedContacts?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="groups" className="data-[state=active]:bg-zinc-800">
            <MessageSquare className="w-4 h-4 mr-2" />
            Groups ({groups.length})
          </TabsTrigger>
          <TabsTrigger value="devices" className="data-[state=active]:bg-zinc-800">
            <Smartphone className="w-4 h-4 mr-2" />
            Devices ({devices.paired.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              {peopleSection?.channelsPeople &&
                Object.entries(peopleSection.channelsPeople).map(([ch, data]) =>
                  (data.pairingRequests?.length ?? 0) > 0 ? (
                    <section key={ch}>
                      <h3 className="text-sm font-medium text-orange-400 mb-2 flex items-center gap-2">
                        Pending pairing requests ({channelLabel(ch)})
                        <Badge variant="secondary" className="text-xs">
                          {data.pairingRequests.length}
                        </Badge>
                      </h3>
                      <div className="space-y-2">
                        {data.pairingRequests.map((req) => (
                          <div
                            key={`${ch}-${req.code}`}
                            className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex items-center justify-between gap-4"
                          >
                            <div>
                              <div className="font-mono text-sm">{req.id}</div>
                              <div className="text-xs text-zinc-500">
                                Code: {req.code} · {formatDate(req.createdAt)}
                              </div>
                            </div>
                            <div className="flex gap-2">
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
                  <h3 className="text-sm font-medium text-orange-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Bot suggestions
                  </h3>
                  <div className="space-y-2">
                    {peopleSection.addressBook.suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className="bg-orange-500/10 rounded-xl border border-orange-500/30 p-4 flex items-center justify-between gap-4 flex-wrap"
                      >
                        <p className="text-sm text-zinc-300">
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
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center text-zinc-400 text-sm">
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
                            className="p-4 flex items-center justify-between gap-4 cursor-pointer"
                            onClick={() =>
                              setExpandedContactId(isExpanded ? null : expandKey)
                            }
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="text-xl shrink-0">👤</span>
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
                                      className="text-xs"
                                    >
                                      {channelLabel(ident.channel)} · {ident.id}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              {entry.contactId && editingName?.contactId !== entry.contactId && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingName({
                                      contactId: entry.contactId!,
                                      value: entry.displayName,
                                    });
                                  }}
                                  disabled={busy !== null}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!entry.fromAddressBook && entry.identities.length === 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNameModalFor({
                                      channel: entry.identities[0].channel,
                                      id: entry.identities[0].id,
                                    });
                                  }}
                                  disabled={busy !== null}
                                >
                                  <Pencil className="w-4 h-4 mr-1" />
                                  Name
                                </Button>
                              )}
                              {entry.fromAddressBook && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLinkModalFor(entry);
                                  }}
                                  disabled={busy !== null}
                                >
                                  <Link2 className="w-4 h-4 mr-1" />
                                  Link
                                </Button>
                              )}
                              {entry.identities[0] && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBlockUser(entry.identities[0].id, entry.identities[0].channel);
                                  }}
                                  disabled={busy !== null}
                                >
                                  <Ban className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-zinc-500 shrink-0" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-zinc-500 shrink-0" />
                            )}
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

        <TabsContent value="groups" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Group policy: <strong className="text-zinc-400">{groupPolicy}</strong>. Groups are configured in openclaw.json.
                </span>
              </div>
              {groups.length === 0 ? (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center text-zinc-400 text-sm">
                  No groups configured
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div
                      key={`${g.channel}-${g.groupId}`}
                      className="bg-zinc-900 rounded-xl border border-zinc-800 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">💬</span>
                        <div>
                          <div className="font-mono text-sm">{g.groupId}</div>
                          <div className="text-xs text-zinc-500">
                            {g.channel}
                            {g.settings?.requireMention !== undefined && (
                              <> · Require mention: {String(g.settings.requireMention)}</>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="devices" className="space-y-4">
          {loading ? (
            <Skeleton className="h-24 skeleton-shimmer rounded-xl" />
          ) : (
            <>
              {devices.pending.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-orange-400 mb-2 flex items-center gap-2">
                    Pending devices
                    <Badge variant="secondary" className="text-xs">
                      {devices.pending.length}
                    </Badge>
                  </h3>
                  <div className="space-y-2">
                    {devices.pending.map((p) => (
                      <div
                        key={p.requestId}
                        className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex items-center justify-between gap-4"
                      >
                        <div>
                          <div className="font-mono text-sm truncate max-w-[200px]">{p.deviceId}</div>
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
                  <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 text-center text-zinc-400 text-sm">
                    No paired devices
                  </div>
                ) : (
                  <div className="space-y-2">
                    {devices.paired.map((d) => (
                      <div
                        key={d.deviceId}
                        className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <Smartphone className="w-5 h-5 text-zinc-500" />
                          <div>
                            <div className="font-medium text-sm">
                              {d.displayName || d.clientId || d.deviceId.slice(0, 12)}
                            </div>
                            <div className="text-xs text-zinc-500">
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
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg max-h-[85vh] flex flex-col">
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 mb-3"
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
