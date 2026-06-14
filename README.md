# Forge

**An AI agent that builds human-only mini-apps, inside World App.**

Describe an everyday app — Forge's agent designs it as a schema-validated manifest, gives it an **ENS** name, stores it on **Walrus**, and only verified humans (**World ID**) can run or claim it.

A World App **Mini App** (Next.js 16 + MiniKit + IDKit). Production: [worldapp-forge.vercel.app](https://worldapp-forge.vercel.app). App ID: `app_129a788263c412af13fb073f6d467974`.

## Three sponsor layers (no overlap)

- **World** — humans + the surface. Sign-in via `walletAuth` (SIWE, verified server-side), proof-of-human via IDKit 4.0 (`proofOfHuman`, verified server-side, one-per-human), payments via the World wallet (`MiniKit.pay`, World Chain `480`).
- **ENS** — names the apps the agent builds (`label.forgedapp.eth`) and the agent itself (ENSIP-26), with the Walrus pointer written into on-chain text records. **Subnames mint on-chain on publish** (Sepolia ENS v2) and resolve live via the viem Universal Resolver.
- **Walrus** — decentralized storage for each app's manifest (and cover/menu images) as blobs.

Every integration has a real path and a clearly-labeled simulated fallback, so the app works with no keys / outside World App.

## What it does

- **Sign in with World** (SIWE, verified server-side).
- **Design agent** — describe an app; a server-side Claude tool-calling agent (9-tool toolbelt) checks ENS availability, can offer 2–3 variations, and drafts a schema-validated manifest. Keyless fallback: a template generator.
- **Preview & run** any manifest in the schema-driven runtime: World-wallet **pay** (USDC, simulated fallback), **punch-card** loyalty + points, **menu ordering** with a pickup code, plus rich interactive components (sliders, choice groups, split-bill, tip presets, ballots, transit passes…), each with its own per-Spark visual theme — all behind a **World ID** human gate.
- **Publish** — optionally attach a Walrus **cover image**, write the manifest to **Walrus**, and **auto-mint the ENS subname + ENSIP-26 record** (Walrus pointer) on-chain.
- **Sparks (catalog)** — ~20 built-in sample apps across Finance / Community / Agents / Events / Tools, plus anything you publish; Featured rail + per-category rails with Walrus cover images.
- **Identity** — the Forge agent's live ENSIP-26 identity, reverse-resolve your wallet, a live ENS name explorer, and a "name an agent" unsigned-calldata generator (the ens-cli pattern).
- **Activity** — total points, loyalty passes, and the activity/receipts feed.
- **Floating oval nav** — Home / Apps / center Create FAB / Activity / Profile, with light/dark/system theming.

## Run locally

```bash
npm install
cp .env.example .env      # optional — runs simulated without keys
npm run dev               # http://localhost:3000
```

In a desktop browser you get the full UI, the agent, Walrus publishing, on-chain ENS minting (with a registrar key + Sepolia ETH), and the catalog/runtime. MiniKit-only features (native sign-in/pay/World ID) fall back to simulated outside World App.

## Preview inside World App

1. Expose the dev server: `ngrok http 3000` (or `npx vercel`) → public HTTPS URL.
2. Set that URL as the app's **integration URL** in the [Developer Portal](https://developer.world.org) if you're not using production (`https://worldapp-forge.vercel.app`).
3. Open [docs.world.org/mini-apps/quick-start/testing](https://docs.world.org/mini-apps/quick-start/testing), enter App ID `app_129a788263c412af13fb073f6d467974`, and **scan the QR**. Forge opens inside World App. Tip: add Eruda for mobile logs.

## Architecture

```
src/app/        Next.js App Router — home, create, catalog, app/[ens], publish, activity, identity, profile + API routes
src/components/  FloatingNav, ManifestRunner, SparkShell, SparkComponents, RestaurantApp, PunchCard, SparkArt, Icon, VerifyButton, ui
src/lib/         config, types, manifest validator, agent, sparkTheme/sparkForm, ens + ensChain/ensWrite/ensV2/ensPublish, walrus, catalog, seeds, store, pay, nullifiers, auth, theme
```

The design agent runs server-side (`/api/agent`): `ANTHROPIC_API_KEY` if set, else the Claude Code proxy at `ANTHROPIC_PROXY_URL`, else a deterministic template. ENS uses Sepolia ENS v2 by default (`NEXT_PUBLIC_ENS_CHAIN`); set `mainnet` for the classic v1 path. See `AGENTS.md` for the full living spec, env vars, the v2 contract addresses, and known gaps.

## Status

Wired & verified: World sign-in, World ID proof-of-human (IDKit 4.0 + backend v4 verify + one-per-human nullifier), the design agent + schema-validated manifests, the interactive runtime (pay/loyalty/ordering), Walrus publishing (manifests + images), the catalog, the Activity hub, and **on-chain ENS v2 subname minting with ENSIP-26 records on publish** (verified end-to-end on Sepolia: publish returns `mode: on-chain` and the Walrus pointer resolves via the Universal Resolver).

Next: real World-wallet payments to live `0x` recipients (a `confirm-payment` backend); a persistent catalog/nullifier store (currently in-memory, canonical data lives on Walrus + ENS); and Quick Action / World Chat distribution.
