import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || "/home/clawdbot/.openclaw/openclaw.json";
const OPENCLAW_CREDENTIALS = process.env.OPENCLAW_CREDENTIALS || "/home/clawdbot/.openclaw/credentials";

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

// Resolve Telegram bot username from token via Bot API
async function getTelegramUsername(botToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      next: { revalidate: 3600 }, // cache for 1 hour
    });
    const data = await res.json();
    if (data.ok && data.result?.username) {
      return data.result.username;
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const raw = await fs.readFile(OPENCLAW_CONFIG, "utf-8");
    const config = JSON.parse(raw);
    const channels: ChannelInfo[] = [];

    const channelsConfig = config.channels || {};

    // Helper to count contacts in allowFrom for a channel
    async function getContactCount(channelId: string): Promise<number> {
      try {
        const allowPath = path.join(OPENCLAW_CREDENTIALS, `${channelId}-allowFrom.json`);
        const raw = await fs.readFile(allowPath, "utf-8");
        const data = JSON.parse(raw);
        return Array.isArray(data.allowFrom) ? data.allowFrom.length : 0;
      } catch {
        return 0;
      }
    }

    function countGroups(ch: Record<string, unknown>): number {
      if (ch.groups && typeof ch.groups === "object") {
        return Object.keys(ch.groups as Record<string, unknown>).length;
      }
      // WhatsApp often stores groups under accounts.<name>.groups
      if (ch.accounts && typeof ch.accounts === "object") {
        let total = 0;
        for (const account of Object.values(ch.accounts as Record<string, unknown>)) {
          if (
            account &&
            typeof account === "object" &&
            "groups" in account &&
            (account as Record<string, unknown>).groups &&
            typeof (account as Record<string, unknown>).groups === "object"
          ) {
            total += Object.keys((account as Record<string, unknown>).groups as Record<string, unknown>).length;
          }
        }
        return total;
      }
      return 0;
    }

    // Telegram
    if (channelsConfig.telegram?.enabled) {
      const tg = channelsConfig.telegram;
      let deepLink: string | undefined;
      let username: string | undefined;

      if (tg.botToken) {
        const botUsername = await getTelegramUsername(tg.botToken);
        if (botUsername) {
          username = botUsername;
          deepLink = `https://t.me/${botUsername}`;
        }
      }

      channels.push({
        id: "telegram",
        name: "Telegram",
        enabled: true,
        deepLink,
        username,
        icon: "telegram",
        dmPolicy: tg.dmPolicy,
        groupPolicy: tg.groupPolicy,
        streamMode: tg.streamMode,
        groupCount: countGroups(tg),
        contactCount: await getContactCount("telegram"),
      });
    }

    // Discord
    if (channelsConfig.discord?.enabled) {
      const dc = channelsConfig.discord;
      channels.push({
        id: "discord",
        name: "Discord",
        enabled: true,
        deepLink: dc.inviteUrl || undefined,
        icon: "discord",
        dmPolicy: dc.dmPolicy,
        groupPolicy: dc.groupPolicy,
        groupCount: countGroups(dc),
        contactCount: await getContactCount("discord"),
      });
    }

    // Slack
    if (channelsConfig.slack?.enabled) {
      const sl = channelsConfig.slack;
      channels.push({
        id: "slack",
        name: "Slack",
        enabled: true,
        deepLink: sl.appUrl || undefined,
        icon: "slack",
        dmPolicy: sl.dmPolicy,
        groupPolicy: sl.groupPolicy,
        groupCount: countGroups(sl),
        contactCount: await getContactCount("slack"),
      });
    }

    // WhatsApp: treat as active when explicitly enabled OR configured with common WA keys.
    if (
      channelsConfig.whatsapp?.enabled ||
      channelsConfig.whatsapp?.accounts ||
      channelsConfig.whatsapp?.allowFrom ||
      channelsConfig.whatsapp?.dmPolicy ||
      channelsConfig.whatsapp?.groupPolicy
    ) {
      const wa = channelsConfig.whatsapp;
      const phone = wa.phone;
      channels.push({
        id: "whatsapp",
        name: "WhatsApp",
        enabled: true,
        deepLink: phone ? `https://wa.me/${phone}` : undefined,
        icon: "whatsapp",
        dmPolicy: wa.dmPolicy,
        groupPolicy: wa.groupPolicy,
        groupCount: countGroups(wa),
        contactCount: await getContactCount("whatsapp"),
      });
    }

    // Signal
    if (channelsConfig.signal?.enabled) {
      const sig = channelsConfig.signal;
      channels.push({
        id: "signal",
        name: "Signal",
        enabled: true,
        icon: "signal",
        dmPolicy: sig.dmPolicy,
        groupPolicy: sig.groupPolicy,
        groupCount: countGroups(sig),
        contactCount: await getContactCount("signal"),
      });
    }

    // iMessage
    if (channelsConfig.imessage?.enabled) {
      const im = channelsConfig.imessage;
      channels.push({
        id: "imessage",
        name: "iMessage",
        enabled: true,
        icon: "imessage",
        dmPolicy: im.dmPolicy,
        groupPolicy: im.groupPolicy,
        groupCount: countGroups(im),
        contactCount: await getContactCount("imessage"),
      });
    }

    // Gateway settings (for settings tab)
    const gateway = config.gateway || {};
    const messages = config.messages || {};

    return NextResponse.json({
      channels,
      gateway: {
        port: gateway.port,
        bind: gateway.bind,
        mode: gateway.mode,
        auth: gateway.auth?.mode,
        tailscale: gateway.tailscale,
        controlUi: gateway.controlUi,
      },
      messages: {
        ackReactionScope: messages.ackReactionScope,
      },
    });
  } catch (error) {
    console.error("Failed to read channel config:", error);
    return NextResponse.json({ channels: [], gateway: {}, messages: {} });
  }
}
