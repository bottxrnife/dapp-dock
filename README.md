# Forge

**An AI agent that builds human-only mini-apps, inside World App.**

Describe an everyday app — Forge's agent designs it as a schema-validated manifest, gives it an **ENS** name, stores it on **Walrus**, and only verified humans (**World ID**) can run or claim it.

A World App **Mini App** (Next.js + MiniKit), rebuilt from the original Expo "DappDock" superapp.

## The three sponsor layers (no overlap)

- **World** — the human layer + the surface. Sign-in via MiniKit `walletAuth` (SIWE), proof-of-human via IDKit (one-per-human, verified server-side), payments via the World wallet on World Chain.
- **ENS** — names the things the agent builds (`label.forge.eth`) and the agent itself (ENSIP-26), with the manifest pointer in text records.
- **Walrus** — decentralized storage for each app's manifest (and media) blobs.

## Architecture

```
app/                 Next.js App Router (UI + API routes)
  page.tsx           Home (World sign-in, the 3 layers)
  create/            The design agent chat → draft → preview
  publish/           Publish: write manifest to Walrus, record ENS name
  catalog/           Browse human-built apps
  app/[ens]/         Run an app (schema-driven runtime + World ID gate)
  api/
    nonce, complete-siwe     World sign-in (SIWE)
    rp-signature, verify-proof  World ID (RP sign + verify + nullifier store)
    agent                    Anthropic tool-calling design agent
    publish, catalog, app/[ens]  Walrus write + catalog index
src/lib/             config, types, manifest validator, agent, ens (viem), walrus, nullifiers, catalog
src/components/       ui, ManifestRunner, VerifyButton
```

## Setup

```bash
npm install
cp .env.example .env   # fill in (the app runs in a simulated mode without keys)
```

Key env (see `.env.example`):
- `NEXT_PUBLIC_WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_SIGNER_PRIVATE_KEY` (server only), `NEXT_PUBLIC_WORLD_ACTION` — World ID 4.0
- `ANTHROPIC_API_KEY` **or** `ANTHROPIC_PROXY_URL` (Claude Code) — the design agent
- `NEXT_PUBLIC_ENS_DOMAIN`, `ETH_RPC_URL` — ENS
- `WALRUS_PUBLISHER_URL`, `WALRUS_AGGREGATOR_URL` — Walrus (testnet by default)

## Run locally (browser)

```bash
npm run dev      # http://localhost:3000
```

In a desktop browser you get the full UI, the design agent, Walrus publishing, and the catalog/runtime. MiniKit features (sign-in, pay, native World ID) are inert outside World App, so those fall back to a clearly-labeled simulated mode.

## Preview inside World App (the real test)

World App loads a Mini App from a **public HTTPS URL**, so expose the dev server (or deploy) and point your app at it.

1. **Expose the dev server** with a tunnel (ngrok / zrok / tunnelmole):

   ```bash
   npm run dev
   ngrok http 3000          # copy the https URL
   ```

2. **Set that URL** as your app's URL in the [World Developer Portal](https://developer.world.org) (app `app_e642b84ff13c702c62e16c5997d27db5`, team "dApp Dock"). The app should be in **mini-app** mode.

3. **Open the testing page** at [docs.world.org/mini-apps/quick-start/testing](https://docs.world.org/mini-apps/quick-start/testing), enter your **App ID** (`app_e642…`), and **scan the QR** with your phone's camera. World App opens Forge in its webview.

Tips (from the World docs): use **Eruda** for mobile console logs, and the **L2 faucet** for testnet WLD.

### Or deploy (recommended for a stable demo)

```bash
npx vercel        # deploy → public HTTPS URL
```

Set the Vercel URL as the app URL in the Developer Portal, then test via the same testing page + App ID + QR.

## The design agent

The agent runs server-side (`/api/agent`). It uses `ANTHROPIC_API_KEY` if set, otherwise the Claude Code proxy at `ANTHROPIC_PROXY_URL` (run `~/Documents/GitHub/dappdock-claude-proxy` on your machine; use your LAN IP so a deployed app/phone can reach it). With neither, it falls back to a deterministic template generator.

## Status

Wired: World sign-in (SIWE), World ID proof-of-human (IDKit + backend verify + nullifier store), the design agent + schema-validated manifests, the runtime, Walrus publishing, and the catalog.

Next: real World-wallet payments (`MiniKit.pay` / `sendTransaction` on World Chain 480), on-chain ENS subname minting (currently the ENS name + Walrus pointer are recorded; resolution is read via viem), Quick Action / World Chat sharing, and optional Chainlink VRF fair giveaways.
