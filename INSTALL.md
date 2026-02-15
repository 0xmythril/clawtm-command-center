# Quick Install — ClawdTM Command Center

## Requirements

- Node.js 18+
- OpenClaw running with gateway enabled

## Install

```bash
# Clone the repo
git clone https://github.com/0xmythril/clawtm-command-center.git ~/command-center
cd ~/command-center

# Install dependencies
npm install

# Create env config
cp .env.example .env.local

# Edit .env.local — set your gateway token (found in ~/.openclaw/openclaw.json under gateway.auth.token)
# GATEWAY_WS_URL=ws://127.0.0.1:18789
# GATEWAY_TOKEN=your-token-here

# Build and start
npm run build
npm start
```

Open **http://localhost:3000** in your browser.

## Run in Background (optional)

```bash
# With PM2
npm run build
pm2 start npm --name "command-center" -- start
pm2 save
```

## Access from Phone

1. Make sure your phone and server are on the same Tailscale network
2. Open `http://your-tailscale-hostname:3000`
3. Add to home screen for app-like experience

## Updating

```bash
cd ~/command-center
git pull
npm install
npm run build
# Restart: pm2 restart command-center (if using PM2)
```

## Troubleshooting

- **Can't connect to gateway** — make sure OpenClaw is running (`openclaw run`) and the token in `.env.local` matches `gateway.auth.token` in `~/.openclaw/openclaw.json`
- **Port conflict** — change the port with `PORT=3001 npm start`
- **Permission errors on files** — the app needs read access to `~/.openclaw/` (same user as OpenClaw)
