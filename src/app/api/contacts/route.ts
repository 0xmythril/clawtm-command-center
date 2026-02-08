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

async function getPeople(channel: string) {
  const allowPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-allowFrom.json`);
  const pairingPath = path.join(OPENCLAW_CREDENTIALS, `${channel}-pairing.json`);

  const [allowData, pairingData] = await Promise.all([
    readJsonFile<AllowFromStore>(allowPath, { version: 1, allowFrom: [] }),
    readJsonFile<PairingStore>(pairingPath, { version: 1, requests: [] }),
  ]);

  const allowFrom = Array.isArray(allowData.allowFrom) ? allowData.allowFrom : [];
  const requests = Array.isArray(pairingData.requests) ? pairingData.requests : [];

  return { allowFrom, pairingRequests: requests };
}

/** Get people from all channels that have *-allowFrom.json in credentials */
async function getAllChannelsPeople(): Promise<
  Record<string, { allowFrom: string[]; pairingRequests: PairingStore["requests"] }>
> {
  let entries: [string, unknown][] = [];
  try {
    entries = await fs.readdir(OPENCLAW_CREDENTIALS, { withFileTypes: true }).then((files) =>
      files
        .filter((f) => f.isFile() && f.name.endsWith("-allowFrom.json"))
        .map((f) => [f.name.replace(/-allowFrom\.json$/, ""), null] as [string, unknown])
    );
  } catch {
    return { telegram: await getPeople("telegram") };
  }
  const out: Record<string, { allowFrom: string[]; pairingRequests: PairingStore["requests"] }> = {};
  for (const [channel] of entries) {
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
  const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
  const config = JSON.parse(raw);
  const channels = config.channels || {};
  const result: { channel: string; groupId: string; settings: Record<string, unknown> }[] = [];
  for (const [channelId, channelConfig] of Object.entries(channels)) {
    const ch = channelConfig as { groups?: Record<string, unknown>; groupPolicy?: string };
    if (ch.groups && typeof ch.groups === "object") {
      for (const [groupId, settings] of Object.entries(ch.groups)) {
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

async function getDevicesViaGateway(baseUrl: string): Promise<{
  pending: unknown[];
  paired: unknown[];
}> {
  try {
    const res = await fetch(`${baseUrl}/api/gateway`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "device.pair.list", params: {} }),
    });
    const data = await res.json();
    if (!data.ok || !data.data) {
      return { pending: [], paired: [] };
    }
    return {
      pending: Array.isArray(data.data.pending) ? data.data.pending : [],
      paired: Array.isArray(data.data.paired) ? data.data.paired : [],
    };
  } catch {
    return { pending: [], paired: [] };
  }
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const summary = searchParams.get("summary") === "true";
  const section = searchParams.get("section");

  const baseUrl = getBaseUrl(request);

  try {
    if (summary) {
      const [channelsPeople, groups, devices, addressBook] = await Promise.all([
        getAllChannelsPeople(),
        getGroups(),
        getDevicesViaGateway(baseUrl),
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
      const groups = await getGroups();
      const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
      const config = JSON.parse(raw);
      const telegramGroups = (config.channels?.telegram?.groups as Record<string, unknown>) || {};
      const groupPolicy = config.channels?.telegram?.groupPolicy ?? "allowlist";
      return NextResponse.json({ groups, groupPolicy, telegramGroups });
    }

    if (section === "devices") {
      const devices = await getDevicesViaGateway(baseUrl);
      return NextResponse.json(devices);
    }

    const [people, groups, devices] = await Promise.all([
      getPeople("telegram"),
      getGroups(),
      getDevicesViaGateway(baseUrl),
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
      return NextResponse.json({ ok: true, allowFrom: next });
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Contacts POST error:", error);
    return NextResponse.json(
      { error: "Failed to update contacts" },
      { status: 500 }
    );
  }
}
