import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const OPENCLAW_CONFIG =
  process.env.OPENCLAW_CONFIG || "/home/clawdbot/.openclaw/openclaw.json";
const OPENCLAW_CREDENTIALS =
  process.env.OPENCLAW_CREDENTIALS || "/home/clawdbot/.openclaw/credentials";
const OPENCLAW_ROOT = process.env.OPENCLAW_ROOT || "/home/clawdbot/.openclaw";
const ADDRESS_BOOK_PATH = path.join(OPENCLAW_ROOT, "address-book.json");
const GROUP_NICKNAMES_PATH = path.join(OPENCLAW_ROOT, "group-nicknames.json");

interface AllowFromStore {
  version: number;
  allowFrom: string[];
}

// ─── Address book types ───────────────────────────────────────────────────
export interface AddressBookIdentity {
  channel: string;
  id: string;
  handle?: string;
  platformName?: string;
}

export interface AddressBookContact {
  displayName: string;
  notes?: string;
  identities: AddressBookIdentity[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AddressBookSuggestion {
  id: string;
  type: "merge";
  reason: string;
  identityA: { channel: string; id: string };
  identityB: { channel: string; id: string };
  confidence?: number;
  createdAt: number;
}

export interface AddressBookData {
  version: number;
  contacts: Record<string, AddressBookContact>;
  suggestions: AddressBookSuggestion[];
}

const EMPTY_ADDRESS_BOOK: AddressBookData = {
  version: 1,
  contacts: {},
  suggestions: [],
};

async function readAddressBook(): Promise<AddressBookData> {
  try {
    const raw = await fs.readFile(ADDRESS_BOOK_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AddressBookData;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_ADDRESS_BOOK };
    return {
      version: parsed.version ?? 1,
      contacts: typeof parsed.contacts === "object" ? parsed.contacts : {},
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch {
    return { ...EMPTY_ADDRESS_BOOK };
  }
}

async function writeAddressBook(data: AddressBookData): Promise<void> {
  const dir = path.dirname(ADDRESS_BOOK_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${ADDRESS_BOOK_PATH}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, ADDRESS_BOOK_PATH);
}

// ─── Group nicknames ──────────────────────────────────────────────────────
type GroupNicknames = Record<string, string>; // key: "channel:groupId" -> displayName

async function readGroupNicknames(): Promise<GroupNicknames> {
  try {
    const raw = await fs.readFile(GROUP_NICKNAMES_PATH, "utf-8");
    return JSON.parse(raw) as GroupNicknames;
  } catch {
    return {};
  }
}

async function writeGroupNicknames(data: GroupNicknames): Promise<void> {
  const dir = path.dirname(GROUP_NICKNAMES_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${GROUP_NICKNAMES_PATH}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, GROUP_NICKNAMES_PATH);
}

function contactId(): string {
  return "c_" + randomBytes(8).toString("hex");
}

function suggestionId(): string {
  return "s_" + randomBytes(8).toString("hex");
}

interface PairingStore {
  version: number;
  requests: Array<{
    id: string;
    code: string;
    createdAt: string;
    lastSeenAt?: string;
    meta?: Record<string, string>;
  }>;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function readOpenClawConfigRaw(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function writeOpenClawConfigRaw(config: Record<string, unknown>): Promise<void> {
  const tmpPath = `${OPENCLAW_CONFIG}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmpPath, OPENCLAW_CONFIG);
}

function getChannelConfig(
  config: Record<string, unknown>,
  channel: string
): Record<string, unknown> | null {
  const channels = config.channels;
  if (!channels || typeof channels !== "object") return null;
  const entry = (channels as Record<string, unknown>)[channel];
  if (!entry || typeof entry !== "object") return null;
  return entry as Record<string, unknown>;
}

function getAllowFromFromConfigChannel(channelConfig: Record<string, unknown>): string[] {
  const ids = new Set<string>();

  const direct = channelConfig.allowFrom;
  if (Array.isArray(direct)) {
    for (const id of direct) ids.add(String(id));
  }

  const accounts = channelConfig.accounts;
  if (accounts && typeof accounts === "object") {
    for (const account of Object.values(accounts as Record<string, unknown>)) {
      if (!account || typeof account !== "object") continue;
      const allow = (account as Record<string, unknown>).allowFrom;
      if (!Array.isArray(allow)) continue;
      for (const id of allow) ids.add(String(id));
    }
  }

  return [...ids];
}

function removeAllowFromFromConfigChannel(
  channelConfig: Record<string, unknown>,
  targetId: string
): boolean {
  let changed = false;
  const normalizedTarget = String(targetId).trim();

  const direct = channelConfig.allowFrom;
  if (Array.isArray(direct)) {
    const next = direct.filter((id) => String(id).trim() !== normalizedTarget);
    if (next.length !== direct.length) {
      channelConfig.allowFrom = next;
      changed = true;
    }
  }

  const accounts = channelConfig.accounts;
  if (accounts && typeof accounts === "object") {
    for (const [key, account] of Object.entries(accounts as Record<string, unknown>)) {
      if (!account || typeof account !== "object") continue;
      const rec = account as Record<string, unknown>;
      const allow = rec.allowFrom;
      if (!Array.isArray(allow)) continue;
      const next = allow.filter((id) => String(id).trim() !== normalizedTarget);
      if (next.length !== allow.length) {
        rec.allowFrom = next;
        (accounts as Record<string, unknown>)[key] = rec;
        changed = true;
      }
    }
  }

  return changed;
}

type GroupContainerRef = {
  channelId: string;
  accountId?: string;
  channelConfig: Record<string, unknown>;
  groups: Record<string, unknown>;
};

function collectGroupContainers(
  channelId: string,
  channelConfig: Record<string, unknown>
): GroupContainerRef[] {
  const out: GroupContainerRef[] = [];

  if (channelConfig.groups && typeof channelConfig.groups === "object") {
    out.push({
      channelId,
      channelConfig,
      groups: channelConfig.groups as Record<string, unknown>,
    });
  }

  const accounts = channelConfig.accounts;
  if (accounts && typeof accounts === "object") {
    for (const [accountId, account] of Object.entries(accounts as Record<string, unknown>)) {
      if (!account || typeof account !== "object") continue;
      const accountRec = account as Record<string, unknown>;
      if (accountRec.groups && typeof accountRec.groups === "object") {
        out.push({
          channelId,
          accountId,
          channelConfig,
          groups: accountRec.groups as Record<string, unknown>,
        });
      }
    }
  }

  return out;
}

async function getPeople(channel: string) {
  const allowPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-allowFrom.json`);
  const pairingPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-pairing.json`);

  const [allowData, pairingData] = await Promise.all([
    readJsonFile<AllowFromStore>(allowPath, { version: 1, allowFrom: [] }),
    readJsonFile<PairingStore>(pairingPath, { version: 1, requests: [] }),
  ]);

  const fileAllowFrom = Array.isArray(allowData.allowFrom) ? allowData.allowFrom : [];
  const requests = Array.isArray(pairingData.requests) ? pairingData.requests : [];
  const mergedAllowFrom = new Set<string>(fileAllowFrom.map((id) => String(id)));

  try {
    const config = await readOpenClawConfigRaw();
    const channelConfig = getChannelConfig(config, channel);
    if (channelConfig) {
      for (const id of getAllowFromFromConfigChannel(channelConfig)) {
        mergedAllowFrom.add(String(id));
      }
    }
  } catch {
    // best-effort merge from config; ignore if config cannot be read
  }

  return { allowFrom: [...mergedAllowFrom], pairingRequests: requests };
}

/** Get people from all channels that have *-allowFrom.json in credentials */
async function getAllChannelsPeople(): Promise<
  Record<string, { allowFrom: string[]; pairingRequests: PairingStore["requests"] }>
> {
  const channelIds = new Set<string>();
  try {
    const files = await fs.readdir(OPENCLAW_CREDENTIALS, { withFileTypes: true });
    for (const file of files) {
      if (file.isFile() && file.name.endsWith("-allowFrom.json")) {
        channelIds.add(file.name.replace(/-allowFrom\.json$/, ""));
      }
    }
  } catch {
    // ignore; we'll still try to derive channels from config
  }

  try {
    const config = await readOpenClawConfigRaw();
    const channels = config.channels;
    if (channels && typeof channels === "object") {
      for (const [channelId, channelConfig] of Object.entries(channels as Record<string, unknown>)) {
        if (!channelConfig || typeof channelConfig !== "object") continue;
        const allowFrom = getAllowFromFromConfigChannel(channelConfig as Record<string, unknown>);
        if (allowFrom.length > 0) {
          channelIds.add(channelId);
        }
      }
    }
  } catch {
    // ignore config errors here and keep file-based channels
  }

  const out: Record<string, { allowFrom: string[]; pairingRequests: PairingStore["requests"] }> = {};
  for (const channel of channelIds) {
    const p = await getPeople(channel);
    out[channel] = { allowFrom: p.allowFrom, pairingRequests: p.pairingRequests };
  }
  if (Object.keys(out).length === 0) {
    out.telegram = (await getPeople("telegram")) as { allowFrom: string[]; pairingRequests: PairingStore["requests"] };
  }
  return out;
}

function identityKey(channel: string, id: string): string {
  return `${channel}:${String(id).trim()}`;
}

interface MergedContactEntry {
  contactId: string | null;
  displayName: string;
  identities: AddressBookIdentity[];
  fromAddressBook: boolean;
  notes?: string;
}

function buildMergedContactList(
  channelsPeople: Record<string, { allowFrom: string[]; pairingRequests: PairingStore["requests"] }>,
  addressBook: AddressBookData
): MergedContactEntry[] {
  const byIdentity = new Map<string, { contactId: string; displayName: string; notes?: string }>();
  const contactIdsSeen = new Set<string>();

  for (const [contactId, contact] of Object.entries(addressBook.contacts)) {
    for (const ident of contact.identities) {
      byIdentity.set(identityKey(ident.channel, ident.id), {
        contactId,
        displayName: contact.displayName,
        notes: contact.notes,
      });
    }
  }

  const merged: MergedContactEntry[] = [];
  for (const [contactId, contact] of Object.entries(addressBook.contacts)) {
    if (contactIdsSeen.has(contactId)) continue;
    contactIdsSeen.add(contactId);
    merged.push({
      contactId,
      displayName: contact.displayName,
      identities: contact.identities,
      fromAddressBook: true,
      notes: contact.notes,
    });
  }

  const fromConfigOnly = new Set<string>();
  for (const [channel, data] of Object.entries(channelsPeople)) {
    for (const id of data.allowFrom) {
      const key = identityKey(channel, id);
      if (!byIdentity.has(key)) fromConfigOnly.add(key);
    }
  }

  for (const key of fromConfigOnly) {
    const colonIdx = key.indexOf(":");
    if (colonIdx <= 0) continue;
    const ch = key.slice(0, colonIdx);
    const id = key.slice(colonIdx + 1);
    merged.push({
      contactId: null,
      displayName: id,
      identities: [{ channel: ch, id }],
      fromAddressBook: false,
    });
  }

  return merged;
}

async function getGroups() {
  const config = await readOpenClawConfigRaw();
  const channels = config.channels || {};
  const result: { channel: string; groupId: string; settings: Record<string, unknown> }[] = [];
  for (const [channelId, channelConfig] of Object.entries(channels)) {
    if (!channelConfig || typeof channelConfig !== "object") continue;
    for (const container of collectGroupContainers(channelId, channelConfig as Record<string, unknown>)) {
      for (const [groupId, settings] of Object.entries(container.groups)) {
        result.push({
          channel: channelId,
          groupId,
          settings: (settings as Record<string, unknown>) || {},
        });
      }
    }
  }
  return result;
}

// Direct server-side gateway call -- avoids self-referential HTTP round-trip
async function getDevicesViaGateway(): Promise<{
  pending: unknown[];
  paired: unknown[];
}> {
  try {
    const { gatewayRequest } = await import("../gateway/route");
    const data = (await gatewayRequest("device.pair.list", {})) as {
      pending?: unknown[];
      paired?: unknown[];
    };
    return {
      pending: Array.isArray(data?.pending) ? data.pending : [],
      paired: Array.isArray(data?.paired) ? data.paired : [],
    };
  } catch {
    return { pending: [], paired: [] };
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const summary = searchParams.get("summary") === "true";
  const section = searchParams.get("section");

  try {
    if (summary) {
      const [channelsPeople, groups, devices, addressBook] = await Promise.all([
        getAllChannelsPeople(),
        getGroups(),
        getDevicesViaGateway(),
        readAddressBook(),
      ]);
      const contactsCount = Object.values(channelsPeople).reduce((n, p) => n + p.allowFrom.length, 0);
      const pairingPending = Object.values(channelsPeople).reduce((n, p) => n + p.pairingRequests.length, 0);
      const devicePending = devices.pending.length;
      return NextResponse.json({
        contactsCount,
        groupsCount: groups.length,
        devicesCount: devices.paired.length,
        pendingPairingCount: pairingPending,
        pendingDevicesCount: devicePending,
        suggestionCount: addressBook.suggestions?.length ?? 0,
      });
    }

    if (section === "people") {
      const [channelsPeople, addressBook] = await Promise.all([
        getAllChannelsPeople(),
        readAddressBook(),
      ]);
      const merged = buildMergedContactList(channelsPeople, addressBook);
      return NextResponse.json({
        channelsPeople,
        addressBook: { contacts: addressBook.contacts, suggestions: addressBook.suggestions },
        mergedContacts: merged,
      });
    }

    if (searchParams.get("addressBook") === "true") {
      const addressBook = await readAddressBook();
      return NextResponse.json(addressBook);
    }

    if (section === "groups") {
      const [groups, nicknames] = await Promise.all([getGroups(), readGroupNicknames()]);
      const config = await readOpenClawConfigRaw();
      const channelEntries =
        config.channels && typeof config.channels === "object"
          ? (config.channels as Record<string, unknown>)
          : {};
      const groupPolicies: Record<string, string> = {};
      for (const [channelId, channelConfig] of Object.entries(channelEntries)) {
        if (!channelConfig || typeof channelConfig !== "object") continue;
        const policy = (channelConfig as Record<string, unknown>).groupPolicy;
        if (typeof policy === "string") {
          groupPolicies[channelId] = policy;
        }
      }
      const groupPolicy = groupPolicies.telegram ?? Object.values(groupPolicies)[0] ?? "allowlist";
      return NextResponse.json({ groups, groupPolicy, groupPolicies, nicknames });
    }

    if (section === "devices") {
      const devices = await getDevicesViaGateway();
      return NextResponse.json(devices);
    }

    const [people, groups, devices] = await Promise.all([
      getPeople("telegram"),
      getGroups(),
      getDevicesViaGateway(),
    ]);
    const channels = await readOpenClawChannels();
    return NextResponse.json({
      people,
      groups: { list: groups, groupPolicy: channels.telegram?.groupPolicy },
      devices,
    });
  } catch (error) {
    console.error("Contacts API error:", error);
    return NextResponse.json(
      { error: "Failed to load contacts" },
      { status: 500 }
    );
  }
}

async function readOpenClawChannels(): Promise<Record<string, { groupPolicy?: string }>> {
  const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
  const config = JSON.parse(raw);
  return config.channels || {};
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, channel = "telegram", userId, code } = body as {
      action: string;
      channel?: string;
      userId?: string;
      code?: string;
    };

    if (action === "block-user" && userId) {
      const allowPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-allowFrom.json`);
      const data = await readJsonFile<AllowFromStore>(allowPath, {
        version: 1,
        allowFrom: [],
      });
      const allowFrom = Array.isArray(data.allowFrom) ? data.allowFrom : [];
      const next = allowFrom.filter((id) => String(id).trim() !== String(userId).trim());
      await writeJsonFile(allowPath, { version: 1, allowFrom: next });

      try {
        const config = await readOpenClawConfigRaw();
        const channelConfig = getChannelConfig(config, channel);
        if (channelConfig) {
          const changed = removeAllowFromFromConfigChannel(channelConfig, String(userId));
          if (changed) {
            await writeOpenClawConfigRaw(config);
          }
        }
      } catch {
        // Keep block-user resilient even if config write fails.
      }

      const updated = await getPeople(channel);
      return NextResponse.json({ ok: true, allowFrom: updated.allowFrom });
    }

    if (action === "reject-pairing" && code) {
      const pairingPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-pairing.json`);
      const data = await readJsonFile<PairingStore>(pairingPath, {
        version: 1,
        requests: [],
      });
      const requests = Array.isArray(data.requests) ? data.requests : [];
      const next = requests.filter(
        (r) => String(r.code || "").toUpperCase() !== String(code).trim().toUpperCase()
      );
      await writeJsonFile(pairingPath, { version: 1, requests: next });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve-pairing" && code) {
      const pairingPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-pairing.json`);
      const allowPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-allowFrom.json`);
      const pairingData = await readJsonFile<PairingStore>(pairingPath, {
        version: 1,
        requests: [],
      });
      const requests = Array.isArray(pairingData.requests) ? pairingData.requests : [];
      const codeUpper = String(code).trim().toUpperCase();
      const idx = requests.findIndex((r) => String(r.code ?? "").toUpperCase() === codeUpper);
      if (idx < 0) {
        return NextResponse.json({ ok: false, error: "Pairing request not found" }, { status: 404 });
      }
      const entry = requests[idx];
      const id = entry.id;
      const nextRequests = requests.filter((_, i) => i !== idx);
      await writeJsonFile(pairingPath, { version: 1, requests: nextRequests });

      const allowData = await readJsonFile<AllowFromStore>(allowPath, {
        version: 1,
        allowFrom: [],
      });
      const allowFrom = Array.isArray(allowData.allowFrom) ? allowData.allowFrom : [];
      if (!allowFrom.includes(id)) {
        await writeJsonFile(allowPath, { version: 1, allowFrom: [...allowFrom, id] });
      }
      return NextResponse.json({ ok: true, id, allowFrom: allowFrom.includes(id) ? allowFrom : [...allowFrom, id] });
    }

    // ─── Address book actions ─────────────────────────────────────────────
    if (action === "rename-contact") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { contactId: cid, displayName: name, channel: ch, id: platformId } = body as {
        contactId?: string;
        displayName?: string;
        channel?: string;
        id?: string;
      };
      const displayName = typeof name === "string" ? name.trim() : "";
      if (!displayName) {
        return NextResponse.json({ error: "displayName required" }, { status: 400 });
      }
      if (cid && ab.contacts[cid]) {
        ab.contacts[cid].displayName = displayName;
        ab.contacts[cid].updatedAt = now;
        await writeAddressBook(ab);
        return NextResponse.json({ ok: true, contactId: cid, contact: ab.contacts[cid] });
      }
      if (ch && platformId) {
        const newId = contactId();
        ab.contacts[newId] = {
          displayName,
          identities: [{ channel: ch, id: String(platformId) }],
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        await writeAddressBook(ab);
        return NextResponse.json({ ok: true, contactId: newId, contact: ab.contacts[newId] });
      }
      return NextResponse.json({ error: "contactId or (channel + id) required" }, { status: 400 });
    }

    if (action === "create-contact") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { channel: ch, id: platformId, displayName: name } = body as {
        channel?: string;
        id?: string;
        displayName?: string;
      };
      if (!ch || platformId == null) {
        return NextResponse.json({ error: "channel and id required" }, { status: 400 });
      }
      const key = identityKey(ch, String(platformId));
      for (const c of Object.values(ab.contacts)) {
        if (c.identities.some((i) => identityKey(i.channel, i.id) === key)) {
          return NextResponse.json({ error: "Identity already in address book" }, { status: 409 });
        }
      }
      const newId = contactId();
      const displayName = typeof name === "string" ? name.trim() : String(platformId);
      ab.contacts[newId] = {
        displayName,
        identities: [{ channel: ch, id: String(platformId) }],
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true, contactId: newId, contact: ab.contacts[newId] });
    }

    if (action === "link-identity") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { contactId: cid, channel: ch, id: platformId } = body as {
        contactId?: string;
        channel?: string;
        id?: string;
      };
      if (!cid || !ch || platformId == null) {
        return NextResponse.json({ error: "contactId, channel, and id required" }, { status: 400 });
      }
      const contact = ab.contacts[cid];
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      const key = identityKey(ch, String(platformId));
      for (const c of Object.values(ab.contacts)) {
        if (c.identities.some((i) => identityKey(i.channel, i.id) === key)) {
          return NextResponse.json({ error: "Identity already linked to another contact" }, { status: 409 });
        }
      }
      contact.identities.push({ channel: ch, id: String(platformId) });
      contact.updatedAt = now;
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true, contact });
    }

    if (action === "unlink-identity") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { contactId: cid, channel: ch, id: platformId } = body as {
        contactId?: string;
        channel?: string;
        id?: string;
      };
      if (!cid || !ch || platformId == null) {
        return NextResponse.json({ error: "contactId, channel, and id required" }, { status: 400 });
      }
      const contact = ab.contacts[cid];
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      const key = identityKey(ch, String(platformId));
      contact.identities = contact.identities.filter((i) => identityKey(i.channel, i.id) !== key);
      if (contact.identities.length === 0) {
        delete ab.contacts[cid];
      } else {
        contact.updatedAt = now;
      }
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true, contact: contact.identities.length ? contact : null });
    }

    if (action === "update-contact") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { contactId: cid, displayName: name, notes: notesVal } = body as {
        contactId?: string;
        displayName?: string;
        notes?: string;
      };
      if (!cid || !ab.contacts[cid]) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      const c = ab.contacts[cid];
      if (typeof name === "string") c.displayName = name.trim();
      if (typeof notesVal === "string") c.notes = notesVal.trim() || undefined;
      c.updatedAt = now;
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true, contact: c });
    }

    if (action === "delete-contact") {
      const ab = await readAddressBook();
      const { contactId: cid } = body as { contactId?: string };
      if (!cid) {
        return NextResponse.json({ error: "contactId required" }, { status: 400 });
      }
      if (!ab.contacts[cid]) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      delete ab.contacts[cid];
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true });
    }

    if (action === "accept-suggestion") {
      const ab = await readAddressBook();
      const now = Date.now();
      const { suggestionId: sid } = body as { suggestionId?: string };
      if (!sid) {
        return NextResponse.json({ error: "suggestionId required" }, { status: 400 });
      }
      const idx = ab.suggestions.findIndex((s) => s.id === sid);
      if (idx < 0) {
        return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
      }
      const sug = ab.suggestions[idx];
      const aKey = identityKey(sug.identityA.channel, sug.identityA.id);
      const bKey = identityKey(sug.identityB.channel, sug.identityB.id);
      let contact = Object.values(ab.contacts).find((c) =>
        c.identities.some((i) => identityKey(i.channel, i.id) === aKey || identityKey(i.channel, i.id) === bKey)
      );
      if (contact) {
        const toAdd = [sug.identityA, sug.identityB].filter(
          (ident) => !contact!.identities.some((i) => identityKey(i.channel, i.id) === identityKey(ident.channel, ident.id))
        );
        contact.identities.push(...toAdd);
        contact.updatedAt = now;
      } else {
        const newId = contactId();
        contact = {
          displayName: sug.identityA.id,
          identities: [sug.identityA, sug.identityB],
          tags: [],
          createdAt: now,
          updatedAt: now,
        };
        ab.contacts[newId] = contact;
      }
      ab.suggestions.splice(idx, 1);
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true, contact });
    }

    if (action === "dismiss-suggestion") {
      const ab = await readAddressBook();
      const { suggestionId: sid } = body as { suggestionId?: string };
      if (!sid) {
        return NextResponse.json({ error: "suggestionId required" }, { status: 400 });
      }
      const idx = ab.suggestions.findIndex((s) => s.id === sid);
      if (idx < 0) {
        return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
      }
      ab.suggestions.splice(idx, 1);
      await writeAddressBook(ab);
      return NextResponse.json({ ok: true });
    }

    // ─── Group settings actions ─────────────────────────────────────────
    if (action === "update-group-settings") {
      const { channel: ch, groupId: gid, settings: newSettings } = body as {
        channel?: string;
        groupId?: string;
        settings?: Record<string, unknown>;
      };
      if (!ch || !gid || !newSettings || typeof newSettings !== "object") {
        return NextResponse.json(
          { error: "channel, groupId, and settings required" },
          { status: 400 }
        );
      }
      const config = await readOpenClawConfigRaw();
      const channelConfig = getChannelConfig(config, ch);
      if (!channelConfig) {
        return NextResponse.json({ error: `Channel '${ch}' not found in config` }, { status: 404 });
      }
      const containers = collectGroupContainers(ch, channelConfig);
      const target = containers.find((c) => Object.prototype.hasOwnProperty.call(c.groups, gid));
      if (!target) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      // Merge new settings into existing
      const existing = target.groups[gid] as Record<string, unknown>;
      target.groups[gid] = { ...existing, ...newSettings };
      await writeOpenClawConfigRaw(config);
      return NextResponse.json({ ok: true, settings: target.groups[gid] });
    }

    if (action === "add-group") {
      const { channel: ch, groupId: gid, settings: newSettings } = body as {
        channel?: string;
        groupId?: string;
        settings?: Record<string, unknown>;
      };
      if (!ch || !gid) {
        return NextResponse.json(
          { error: "channel and groupId required" },
          { status: 400 }
        );
      }
      const config = await readOpenClawConfigRaw();
      const channelConfig = getChannelConfig(config, ch);
      if (!channelConfig) {
        return NextResponse.json(
          { error: `Channel '${ch}' not found in config` },
          { status: 404 }
        );
      }

      const containers = collectGroupContainers(ch, channelConfig);
      if (containers.some((c) => Object.prototype.hasOwnProperty.call(c.groups, gid))) {
        return NextResponse.json(
          { error: "Group already exists" },
          { status: 409 }
        );
      }

      let targetGroups: Record<string, unknown> | null = null;
      if (channelConfig.groups && typeof channelConfig.groups === "object") {
        targetGroups = channelConfig.groups as Record<string, unknown>;
      } else if (
        channelConfig.accounts &&
        typeof channelConfig.accounts === "object" &&
        (channelConfig.accounts as Record<string, unknown>).default &&
        typeof (channelConfig.accounts as Record<string, unknown>).default === "object"
      ) {
        const defaultAccount = (channelConfig.accounts as Record<string, unknown>).default as Record<string, unknown>;
        if (!defaultAccount.groups || typeof defaultAccount.groups !== "object") {
          defaultAccount.groups = {};
        }
        targetGroups = defaultAccount.groups as Record<string, unknown>;
      } else {
        channelConfig.groups = {};
        targetGroups = channelConfig.groups as Record<string, unknown>;
      }

      targetGroups[gid] = newSettings || { requireMention: true };
      await writeOpenClawConfigRaw(config);
      return NextResponse.json({ ok: true });
    }

    if (action === "remove-group") {
      const { channel: ch, groupId: gid } = body as {
        channel?: string;
        groupId?: string;
      };
      if (!ch || !gid) {
        return NextResponse.json(
          { error: "channel and groupId required" },
          { status: 400 }
        );
      }
      const config = await readOpenClawConfigRaw();
      const channelConfig = getChannelConfig(config, ch);
      if (!channelConfig) {
        return NextResponse.json({ error: `Channel '${ch}' not found in config` }, { status: 404 });
      }
      const containers = collectGroupContainers(ch, channelConfig);
      const target = containers.find((c) => Object.prototype.hasOwnProperty.call(c.groups, gid));
      if (!target) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      delete target.groups[gid];
      await writeOpenClawConfigRaw(config);
      // Also remove nickname if exists
      const nicknames = await readGroupNicknames();
      const key = `${ch}:${gid}`;
      if (nicknames[key]) {
        delete nicknames[key];
        await writeGroupNicknames(nicknames);
      }
      return NextResponse.json({ ok: true });
    }

    // ─── Group nickname actions ──────────────────────────────────────────
    if (action === "rename-group") {
      const { channel: ch, groupId: gid, displayName: name } = body as {
        channel?: string;
        groupId?: string;
        displayName?: string;
      };
      if (!ch || !gid) {
        return NextResponse.json({ error: "channel and groupId required" }, { status: 400 });
      }
      const nicknames = await readGroupNicknames();
      const key = `${ch}:${gid}`;
      const displayName = typeof name === "string" ? name.trim() : "";
      if (displayName) {
        nicknames[key] = displayName;
      } else {
        delete nicknames[key];
      }
      await writeGroupNicknames(nicknames);
      return NextResponse.json({ ok: true, nicknames });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Contacts POST error:", error);
    return NextResponse.json(
      { error: "Failed to update contacts" },
      { status: 500 }
    );
  }
}
