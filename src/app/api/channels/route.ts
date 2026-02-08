import { NextResponse } from "next/server";
import fs from "node:fs/promises";

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG || "/home/clawdbot/.openclaw/openclaw.json";

interface ChannelInfo {
  id: string;
  name: string;
  enabled: boolean;
  deepLink?: string;
  username?: string;
  icon: string;
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
      });
    }

    // Discord
    if (channelsConfig.discord?.enabled) {
      channels.push({
        id: "discord",
        name: "Discord",
        enabled: true,
        deepLink: channelsConfig.discord.inviteUrl || undefined,
        icon: "discord",
      });
    }

    // Slack
    if (channelsConfig.slack?.enabled) {
      channels.push({
        id: "slack",
        name: "Slack",
        enabled: true,
        deepLink: channelsConfig.slack.appUrl || undefined,
        icon: "slack",
      });
    }

    // WhatsApp
    if (channelsConfig.whatsapp?.enabled) {
      const phone = channelsConfig.whatsapp.phone;
      channels.push({
        id: "whatsapp",
        name: "WhatsApp",
        enabled: true,
        deepLink: phone ? `https://wa.me/${phone}` : undefined,
        icon: "whatsapp",
      });
    }

    // Signal
    if (channelsConfig.signal?.enabled) {
      channels.push({
        id: "signal",
        name: "Signal",
        enabled: true,
        icon: "signal",
      });
    }

    // iMessage
    if (channelsConfig.imessage?.enabled) {
      channels.push({
        id: "imessage",
        name: "iMessage",
        enabled: true,
        icon: "imessage",
      });
    }

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Failed to read channel config:", error);
    return NextResponse.json({ channels: [] });
  }
}
