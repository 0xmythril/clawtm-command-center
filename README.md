# ClawdTM Command Center

A mobile-first, dark-mode control center for your OpenClaw AI agent.

## Features

- **Dashboard** - Real-time status, soul overview, cron timeline, quick actions
- **Cron Jobs** - View, run, enable/disable scheduled jobs
- **Scripts** - Execute workspace scripts with one tap
- **Memory** - Browse daily notes and intelligence reports

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   
   Edit `.env.local` to match your setup:
   ```
   NEXT_PUBLIC_GATEWAY_URL=ws://your-gateway-host:18789
   WORKSPACE_PATH=/home/clawdbot/.openclaw/workspace
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```
   
   Open [http://localhost:3000](http://localhost:3000)

4. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Gateway Connection

The Command Center connects to the OpenClaw gateway via WebSocket. Make sure:

- The gateway is running (`openclaw run`)
- The WebSocket URL in `.env.local` is accessible
- If using authentication, set `NEXT_PUBLIC_GATEWAY_TOKEN`

## Mobile Access

For mobile access via Tailscale:
1. Run the app on your VPS
2. Access via Tailscale hostname (e.g., `http://your-machine:3000`)
3. Add to home screen for app-like experience

## Architecture

```
┌─────────────────────────────────────┐
│         Next.js App                 │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ React Pages │  │  API Routes  │  │
│  └─────┬───────┘  └──────┬───────┘  │
│        │                 │          │
│  ┌─────┴───────┐         │          │
│  │  Gateway    │         │          │
│  │  WebSocket  │         │          │
│  │  Client     │         │          │
│  └─────┬───────┘         │          │
└────────┼─────────────────┼──────────┘
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────┐
│ OpenClaw        │  │ Workspace       │
│ Gateway :18789  │  │ Files (fs)      │
└─────────────────┘  └─────────────────┘
```

## Tech Stack

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui components
- WebSocket for real-time gateway communication

## Customization

### Colors

The orange accent (#f97316) can be changed in `src/app/globals.css`:
```css
.dark {
  --primary: #your-color;
  --accent: #your-color;
  --ring: #your-color;
}
```

### Quick Actions

Edit `src/app/page.tsx` to customize the quick action buttons.

### Allowed Scripts

Edit `src/app/api/exec/route.ts` to add/remove allowed scripts:
```typescript
const ALLOWED_SCRIPTS = [
  "your_script.sh",
  // ...
];
```
