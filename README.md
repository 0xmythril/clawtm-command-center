# ClawdTM Command Center

A mobile-first, dark-mode control center for your [OpenClaw](https://github.com/nicholasgriffintn/openclaw) AI agent. Built with Next.js, designed as a PWA for quick home-screen access on any device.

## Features

### Dashboard (`/`)
- Real-time gateway connection status, uptime, and heartbeat
- **System health panel** — memory, CPU load, disk usage, active sessions (expandable in StatusCard)
- Bot avatar, agent level badge, and model info
- Cron timeline, channel summary, contacts overview
- PROPOSALS.md banner when the agent has ideas

### Actions (`/actions`)
- **Cron** — view, create, run, enable/disable scheduled jobs
- **Scripts** — execute workspace shell scripts, pin favorites, schedule as cron
- **Sessions** — live session manager showing active/recent agent sessions with token counts
- **Activity** — server-side aggregated log viewer (cron runs + session activity) with search and auto-refresh

### Contacts (`/contacts`)
- **Overview** — at-a-glance summary of channels, people, groups, and devices
- **Channels** — gateway status, per-channel policies (DM, group, stream mode), settings panel
- **People** — address book with merge suggestions, pairing request approval/rejection, contact linking
- **Groups** — add/remove groups, toggle `requireMention`, rename with nicknames
- **Devices** — approve/reject/revoke paired devices

### Memory (`/memory`)
- **Daily** — browse daily memory note files by date
- **Skills** — manage installed skills, browse/install from the ClawdTM skill store
- **Core** — MEMORY.md and USER.md viewer
- **Soul** — SOUL.md viewer
- **Config** — visual editor + raw JSON mode for `openclaw.json` (masked secrets, validation, atomic backup-and-write)

## Prerequisites

- **Node.js** >= 18
- **OpenClaw** installed and running (`openclaw run`)
- Gateway accessible (default `ws://127.0.0.1:18789`)

## Installation

```bash
# Clone / copy into your server
cd /path/to/command-center

# Install dependencies
npm install

# Create environment config
cp .env.example .env.local
# Edit .env.local with your gateway URL, token, and paths
```

## Configuration

Create `.env.local` (or copy from `.env.example`):

```env
# Gateway connection (server-side, used by API proxy routes)
GATEWAY_WS_URL=ws://127.0.0.1:18789
GATEWAY_TOKEN=your-gateway-auth-token

# Workspace paths (defaults work if OPENCLAW_ROOT is ~/.openclaw)
WORKSPACE_PATH=/home/your-user/.openclaw/workspace
SCRIPTS_PATH=/home/your-user/.openclaw/workspace/scripts
MEMORY_PATH=/home/your-user/.openclaw/workspace/memory
INTELLIGENCE_PATH=/home/your-user/.openclaw/workspace/intelligence
```

The gateway token is found in your `openclaw.json` under `gateway.auth.token`.

Optional overrides (usually not needed):
```env
OPENCLAW_ROOT=/home/your-user/.openclaw
OPENCLAW_CONFIG=/home/your-user/.openclaw/openclaw.json
```

## Running

### Development
```bash
npm run dev
# Open http://localhost:3000
```

### Production
```bash
npm run build
npm start
# Serves on http://localhost:3000
```

### With PM2 (recommended for always-on)
```bash
npm run build
pm2 start npm --name "command-center" -- start
pm2 save
```

## Mobile / Remote Access

### Via Tailscale (recommended)
1. Run the app on your VPS/server
2. Both server and phone on the same Tailnet
3. Access via Tailscale IP or MagicDNS hostname: `http://your-machine:3000`
4. Add to home screen (PWA) for native app-like experience

### Via reverse proxy
Put behind nginx/caddy with HTTPS if exposing to the internet. The gateway `controlUi.allowedOrigins` in `openclaw.json` must include your domain.

## Architecture

```
┌──────────────────────────────────────┐
│          Next.js App (:3000)         │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ React Pages  │  │  API Routes  │  │
│  │ (Client)     │  │  (Server)    │  │
│  └──────┬───────┘  └──────┬───────┘  │
│         │                 │          │
│         │     ┌───────────┤          │
│         │     │ /api/gateway (proxy) │
│         │     │ /api/contacts        │
│         │     │ /api/config          │
│         │     │ /api/system-health   │
│         │     │ /api/sessions        │
│         │     │ /api/logs            │
│         │     │ /api/scripts, etc.   │
│         │     └───────────┤          │
└─────────┼─────────────────┼──────────┘
          │                 │
          ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ OpenClaw        │  │ ~/.openclaw/    │
│ Gateway :18789  │  │ (config, data,  │
│ (WebSocket RPC) │  │  sessions, etc) │
└─────────────────┘  └─────────────────┘
```

All gateway communication goes through a server-side API proxy (`/api/gateway`) — no WebSocket connections from the browser. File-based APIs read/write directly to `~/.openclaw/`.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** with TypeScript
- **Tailwind CSS v4**
- **shadcn/ui** components (Radix primitives)
- **lucide-react** icons
- **WebSocket** (server-side only, via `ws` package)

## File Structure

```
src/
├── app/
│   ├── page.tsx              # Dashboard
│   ├── actions/page.tsx      # Cron, Scripts, Sessions, Activity
│   ├── contacts/page.tsx     # Channels, People, Groups, Devices
│   ├── memory/page.tsx       # Daily, Skills, Core, Soul, Config
│   └── api/
│       ├── gateway/          # WebSocket RPC proxy
│       ├── contacts/         # Address book, groups, pairing
│       ├── config/           # openclaw.json CRUD
│       ├── system-health/    # Memory, disk, load, sessions
│       ├── sessions/         # Session list/detail
│       ├── logs/             # Aggregated activity logs
│       ├── scripts/          # Script listing and deletion
│       ├── exec/             # Script execution
│       └── ...
├── components/
│   ├── bottom-nav.tsx        # 4-tab bottom navigation
│   ├── status-ring.tsx       # StatusCard + system health
│   ├── cron-timeline.tsx     # Upcoming jobs timeline
│   └── ...
└── lib/
    ├── gateway-api.ts        # Gateway RPC client functions
    └── utils.ts              # cn() and helpers
```

## License

Private — part of the OpenClaw ecosystem.
