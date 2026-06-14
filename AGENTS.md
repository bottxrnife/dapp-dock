# AGENTS.md — Forge

**Living document for AI agents and developers working on this repo.**

When you change architecture, screens, integrations, or env vars, **update this file in the same session** and append to the changelog at the bottom. Don't let it drift from the codebase.

> **History:** this repo was originally **DappDock**, an Expo / React Native superapp. On 2026-06-13 it was **rewritten as Forge**, a World App **Mini App** (Next.js). The full Expo history is in git up to the pivot merge `d759cc0`; everything below describes the current Next.js app.

---

## 1. What Forge is

**Forge** is a World App Mini App: an **AI agent that builds human-only mini-apps**. A user describes an everyday app; the agent designs it as a schema-validated **manifest**, it gets an **ENS** name, its manifest is stored on **Walrus**, and only verified humans (**World ID**) can run or claim it.

Core loop: **describe → agent drafts a manifest → preview/run → publish (Walrus + ENS) → others run it (World ID gated).**

**Three sponsors, one per layer (no overlap):**
- **World** — the human layer + the surface. `walletAuth` (SIWE) sign-in, World ID proof-of-human (IDKit, verified server-side, one-per-human), payments via the World wallet (`MiniKit.pay`, World Chain `480`).
- **ENS** — names the created apps (`label.<ENS_DOMAIN>`) and the agent (ENSIP-26), with the Walrus pointer in text records (read via viem Universal Resolver).
- **Walrus** — decentralized storage for each app's manifest (and media) blobs.

The Anthropic agent is an AI feature, not a sponsor track. Every integration has a real path and a **non-failing simulated fallback** (so the app works with no keys / outside World App).

**Product constraint:** published apps are **schema-driven JSON manifests**, never arbitrary user code. The runtime renders `components[]` + `permissions` + `workflow`. This is intentional (security + reviewability) and is also what keeps an AI generator policy-compliant inside World App.

---

## 2. Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**, **Tailwind v4**.
- `@worldcoin/minikit-js` + `@worldcoin/minikit-react` (MiniKit 2.x), `@worldcoin/idkit` + `@worldcoin/idkit-core` (**4.x**), `viem` (ENS).
- Deployed as a public HTTPS URL (Vercel) loaded in the World App webview.

---

## 3. Repository map

```
src/
├── app/
│   ├── layout.tsx           Root: fonts, metadata, <Providers> (MiniKit)
│   ├── providers.tsx        MiniKitProvider (appId)
│   ├── globals.css          Tailwind v4 + design tokens (white + wash)
│   ├── page.tsx             Home — World-App-style: sign-in, agent hero, Mini Apps grid, Featured
│   ├── create/page.tsx      Design agent chat → draft card → preview/publish (composer floats above the bar)
│   ├── catalog/page.tsx     Sparks — Featured rail + category sections (vertical page + horizontal rails, Walrus cover images)
│   ├── app/[ens]/page.tsx   Run an app (ManifestRunner; shows Walrus cover image)
│   ├── publish/page.tsx     Publish: optional Walrus cover image + writes manifest to Walrus, records ENS name
│   ├── activity/page.tsx    Activity feed (receipts) + total points + loyalty passes
│   ├── profile/page.tsx     Sign-in state, World ID status, theme/settings, Agent-identity (ENS) link
│   ├── identity/page.tsx    ENS Identity: agent records (ENSIP-26), reverse-resolve your wallet, live name explorer, "name an agent" calldata
│   └── api/
│       ├── nonce, complete-siwe       World sign-in (SIWE; verifySiweMessage)
│       ├── rp-signature, verify-proof World ID (RP sign + v4 verify + nullifier store)
│       ├── agent                      Anthropic tool-calling design agent
│       ├── publish, catalog, app/[ens] Walrus write + catalog index
│       ├── upload, blob/[id]          Walrus image upload (bytes) + read proxy (serves /api/blob/{id})
│       ├── ens/profile, ens/calldata  Live ENS reads (profile / ENSIP-26 agent records / verify) + unsigned write calldata
│       └── pay-nonce                  reference id for MiniKit.pay
├── components/
│   ├── FloatingNav.tsx      Floating oval tab bar (Home/Apps/Create FAB/Activity/Profile); truly fixed (own compositing layer)
│   ├── ManifestRunner.tsx   Schema-driven runtime: pay + loyalty + done; delegates menu → RestaurantApp, punch → PunchCard
│   ├── RestaurantApp.tsx    Full ordering mini-app for `menu` Sparks: Order / Rewards / History tabs + pickup code
│   ├── PunchCard.tsx        Loyalty pass UI for `punchCard` Sparks (stamp grid + points)
│   ├── SparkArt.tsx         Per-Spark tile: WHITE mono glyph on a SOLID accent squircle (no outline/translucency)
│   ├── Icon.tsx             Monochrome line icon (`<Icon name … />`, currentColor) — the ONLY glyph source; no emoji anywhere
│   ├── VerifyButton.tsx     World ID gate (IDKit widget + simulated fallback)
│   └── ui.tsx               Button, Card, Pill
└── lib/
    ├── config.ts            APP config (name, world ids, ENS domain, World Chain 480)
    ├── types.ts             DappManifest + components
    ├── manifest.ts          validateManifest() — the schema gate
    ├── agent.ts             Anthropic loop + 9-tool toolbelt (draft_dapp_manifest, draft_variations, list_sparks, get_capabilities, resolve_ens_name, get_agent_identity, suggest_labels, …); returns {draft, drafts}; template fallback
    ├── homeShortcuts.ts     localStorage order of Home "Sparks" tiles (editable: add/remove/rearrange)
    ├── ens.ts               Live ENS reads via viem (resolve/reverse/text/avatar, ENSIP-26 agent profile, ENSIP-25 verify, full profile, availability)
    ├── ensChain.ts          ENS chain config — Sepolia=ENSv2 (default) or mainnet=classic; v1 + v2 addresses, isEnsV2()
    ├── ensWrite.ts          Classic ENS write calldata {to,data,value} — setText, ENSIP-26 agent records, subname (mainnet/ens-cli pattern)
    ├── ensV2.ts             ENS v2 subname minting (Sepolia) — register in parent's subregistry + ENSIP-26 record on shared resolver
    ├── ensPublish.ts        Auto-provision Spark ENS on publish — v2 mint (Sepolia) or classic calldata (mainnet)
    ├── walrus.ts            Walrus HTTP store/read (publisher/aggregator): storeBlob (text), storeBytes (images), readBlob
    ├── catalog.ts           In-memory catalog index (seeds + published) + manifest cache
    ├── seeds.ts             ~20 built-in sample Sparks (pay/claim/punch/menu builders) + POINTS_REWARDS
    ├── appStyle.ts          per-Spark accent color (appAccent) — the solid background of its SparkArt tile
    ├── icons.ts             ICON_PATHS (24x24 line glyphs) + iconNameFor(ens,category); shared by Icon + SparkArt
    ├── theme.ts             light/dark/system mode (localStorage + data-theme); picker lives in Profile
    ├── store.ts             localStorage: loyalty, activity, orders (+ spendPoints rewards marketplace)
    ├── pay.ts               payWorld() — MiniKit.pay (USDC/World Chain) + simulated fallback
    ├── nullifiers.ts        used-nullifier store (one-per-human)
    └── useWorldAuth.ts      walletAuth sign-in hook
```

---

## 4. What the mini app can do (features)

- **Sign in with World** — `walletAuth` (SIWE), verified server-side; reads the World username.
- **Design agent (the hero)** — describe an app in chat; a server-side Anthropic tool-calling agent (`/api/agent`) checks ENS subname availability and drafts a **schema-validated** manifest. Keyless fallback = a deterministic template generator. Default model `claude-sonnet-4-6` (or the Claude Code proxy).
- **Preview + run** — `ManifestRunner` renders the manifest's components and runs the workflow:
  - **Payments** — `MiniKit.pay` (USDC, World Chain) when in World App with a real recipient; otherwise a clearly-labeled simulated settle.
  - **Loyalty** — `punchCard` stamps fill on each run, points accrue (`pointsPerDollar`); a full card flips the CTA to a free **redeem**.
  - **Ordering** — `menu` apps show a cart (steppers) → pay the total → earn points → **pickup code**.
  - **Editable inputs** — unlocked `amountInput` + `memoInput` are editable.
  - **World ID gate** — apps that require proof-of-human show a `VerifyButton` (IDKit) before the action.
- **Publish** — optionally attach a **cover image** (uploaded to **Walrus** via `/api/upload`), writes the manifest JSON to **Walrus** (blob id), records the app under its **ENS** name in the catalog. Images are served back through `/api/blob/{id}` (aggregator proxy).
- **Sparks (catalog)** — World-App-style browse: a **Featured** horizontal rail + per-category rails (vertical page scroll + horizontal rails), category chips, and Walrus cover images (fallback to per-app emoji/accent).
- **Activity** — total points, your loyalty passes, and the activity/receipts feed (localStorage).
- **Floating oval nav** — Home / Apps / center **Create FAB** / Activity / Profile, visible on every tab and **truly fixed** (own compositing layer so it doesn't drift on fast scroll).

**Built-in sample Sparks (`seeds.ts`, ~20 across all 5 categories, each with a tagline + rating/runs/reviews):** Team Dues, Split the Bill, Coffee Tip Jar, Burger Block Rewards (punch), Article Unlock, Corner Bistro (menu → RestaurantApp), Bean Counter Café (punch), DAO Vote, Savings Circle, Community Fundraiser, Club Membership Pass, Charity Round-Up, Research Agent Market, Trip Planner Agent, Community Raffle, Ticket Claim, Event RSVP, Parking Meter, Transit Top-Up. The `menu` Spark renders the full tabbed ordering UI; `punchCard` Sparks render the loyalty pass; `POINTS_REWARDS` powers the Rewards tab.

---

## 5. Manifest schema (runtime contract)

`DappManifest` (`src/lib/types.ts`), validated by `validateManifest()` (`src/lib/manifest.ts`).

**Component types:** `amountInput {token, default, locked?}`, `recipient {value}`, `memoInput {default}`, `punchCard {total, reward, pointsPerDollar}`, `menu {currency, items[], pointsPerDollar?}`, `submitButton {label}` (required). Each `menu` item is `{ id, name, priceUsd, desc?, tag?, imageBlobId? }` — `imageBlobId` is an optional **Walrus** photo the creator attaches on the publish page (uploaded via `/api/upload`, shown via `/api/blob/{id}` in the RestaurantApp).

**Validation:** name/description/outcome required; `ensLabel` → `label.<ENS_DOMAIN>`; 1–5 plain-English permissions (no `0x` addresses); 2–6 workflow steps; `requiresConfirmation` always forced true; punchCard/menu shapes guarded. `storage` (`{ manifestBlobId?, imageBlobId? }`) is carried through validation — `imageBlobId` (a Walrus cover image) is set on publish and rendered on the catalog/run pages.

**Adding a component type — touch all 3:** the `ManifestComponent` union in `types.ts`, `COMPONENT_TYPES` + per-type guard in `manifest.ts`, and the `draft_dapp_manifest` tool description + `SYSTEM_PROMPT` in `agent.ts`. Then render it in `ManifestRunner.tsx`.

---

## 6. Integrations & credentials

| Env var | Layer | Real behavior | No-key fallback |
|---|---|---|---|
| `NEXT_PUBLIC_WORLD_APP_ID` (+ `WORLD_RP_ID`, `WORLD_SIGNER_PRIVATE_KEY` server-only, `NEXT_PUBLIC_WORLD_ACTION`, `NEXT_PUBLIC_WORLD_ENV`) | World ID | IDKit widget → backend RP-sign (`/api/rp-signature`) → v4 verify (`/api/verify-proof`, `developer.world.org/api/v4/verify/{rp_id}`) → UNIQUE(action,nullifier) | `VerifyButton` simulates a verify |
| (same World wallet) | Payments | `MiniKit.pay` USDC on World Chain 480 (`lib/pay.ts`) | simulated settle |
| `ANTHROPIC_API_KEY` **or** `ANTHROPIC_PROXY_URL` (+ `_PROXY_KEY`, `ANTHROPIC_MODEL`) | Agent | Anthropic Messages tool loop (server) | template generator |
| `NEXT_PUBLIC_ENS_DOMAIN`, `NEXT_PUBLIC_ENS_CHAIN` (`sepolia`=ENSv2 \| `mainnet`=classic), `NEXT_PUBLIC_AGENT_ENS`, `ETH_RPC_URL`, `ENS_REGISTRAR_PRIVATE_KEY` (server), `ENS_V2_SUBREGISTRY`, `ENS_V2_RESOLVER` | ENS | **Sepolia runs ENS v2** (PermissionedRegistry + per-name subregistries). Live viem reads work via the Universal Resolver for v2 names. **Auto subname mint on publish** (`ensV2.ts`): registers `label.<parent>` in the parent's subregistry + writes ENSIP-26 `agent-context` (Walrus pointer) to a shared resolver — Forge's registrar wallet pays gas, users pay nothing. Mainnet path uses classic `ensWrite`/`ensPublish` (unsigned calldata). Design agent has `get_agent_identity`. | reads degrade to null; without registrar/subregistry config publish records catalog-only names |
| `WALRUS_PUBLISHER_URL`, `WALRUS_AGGREGATOR_URL` | Walrus | `PUT /v1/blobs` to store the manifest **and uploaded cover images** (`storeBytes` via `/api/upload`), `GET /v1/blobs/{id}` to read (images served through `/api/blob/{id}`) | publish still records locally + clear error if Walrus is down |
| `WALRUS_NETWORK`, `SUI_ADDRESS`, `FORGE_PUBLIC_CATALOG_BLOB_ID` | Walrus CLI + Sui wallet | Local `walrus store` for **public** assets (seed catalog, manifests); keystore at `~/.sui/sui_config/sui.keystore` | optional; app runs from in-memory seeds without it |

**Live World ID app (created via the developer-portal MCP, team "dApp Dock"):** app `app_e642b84ff13c702c62e16c5997d27db5`, RP `rp_3c60d66756b89a0c` (registered on-chain), action `verify-human`. The Dev Portal app is in **mini-app** mode, named **Forge**. Set its **integration URL** to your deployed/tunnel URL before testing in World App.

**Live ENS v2 app (Sepolia):** parent **`forgedapp.eth`** registered on ENS v2 (`tx 0x4633cc1b…`), owned by the registrar wallet `0x174B3865…0675`. v2 addresses (discovered on-chain): ETHRegistry `0xDEDB9291…B398B67`, ETHRegistrar `0x8c2E866B…aFFcA`, VerifiableFactory `0xd2a632d8…36198`, UserRegistryImpl `0x0F99e7Ea…2917`, ResolverImpl `0xE566a1FB…4cb9c`, mock USDC `0x3DfC8b53…38D9` (open `mint`). Forge's subregistry for `forgedapp.eth` = `0x2c8d4cc1…F4413`, shared resolver = `0xAa0fD17B…937c`. Live subnames: `hello.forgedapp.eth`, `coffee-tip.forgedapp.eth` (both resolve `agent-context` via the Universal Resolver). Re-run `scripts/setup-ens-v2-subnames.mjs` if ENS resets the v2 contracts.

**Secrets:** `WORLD_SIGNER_PRIVATE_KEY`, `ENS_REGISTRAR_PRIVATE_KEY`, and the agent key are **server-only** (no `NEXT_PUBLIC_` prefix). `.env` is gitignored; `.env.example` is the template.

---

## 7. Running & previewing

```bash
npm install
cp .env.example .env     # optional — app runs simulated without keys
npm run dev              # http://localhost:3000
```

In a desktop browser you get the full UI, the agent, Walrus publishing, and the catalog/runtime; MiniKit-only features (native sign-in/pay/World ID) fall back to simulated outside World App.

**Preview inside World App:**
1. Expose the dev server: `ngrok http 3000` (or `npx vercel`) → public HTTPS URL.
2. Set that URL as the app's **integration URL** in the Developer Portal (or via the `configure_mini_app` MCP tool).
3. Open [docs.world.org/mini-apps/quick-start/testing](https://docs.world.org/mini-apps/quick-start/testing), enter App ID `app_e642b84ff13c702c62e16c5997d27db5`, scan the QR. (Eruda helps with mobile logs.)

**Verify before shipping:** `npx tsc --noEmit`, `npm run build`.

---

## 8. Conventions

- **Design system (Shakepay-inspired):** electric-blue brand accent `#00A2FF` (`brand`/`brand-strong`/`brand-soft`), bold **display font** (Bricolage Grotesque → the `.display` class on big headings), dark `ink-panel` for "card" panels, and `shadow-soft`/`shadow-card`/`shadow-pop` (the electric glow). Spacing follows the World mini-app guidelines (24px page padding, 16px in-section, 32px between sections). Use the tokens in `globals.css` (`bg`, `surface`, `wash`, `ink`, `muted`, `brand`, `blue-soft`/`blue-link` = brand-mapped, `cta`/`cta-text`, `success`, `ink-panel`). Don't hardcode hex except per-app accents from `appStyle.ts` and the hero gradients.
- The agent must **never** get spend/publish tools — humans confirm those.
- Server secrets never get a `NEXT_PUBLIC_` prefix.
- Prefer extending the manifest schema + validator over ad-hoc UI.
- Bottom padding must clear the floating nav (`NAV_CLEARANCE`) — pages use `pb-28`+.

---

## 9. Known gaps / next

- **Payments**: `MiniKit.pay` is wired but recipients are placeholder ENS, so it usually simulates; needs real 0x recipients (and a `confirm-payment` backend) for live settles.
- **ENS**: default **Sepolia = ENS v2** (Holesky is shut down; Sepolia classic ENS was migrated to v2). Real on-chain subname minting on publish via `ensV2.ts` (parent `forgedapp.eth` + its subregistry). Mainnet (`NEXT_PUBLIC_ENS_CHAIN=mainnet`) uses classic v1 (reads + ens-cli calldata) and costs real ETH. **v2 contracts on Sepolia reset periodically** — if minting fails with "name not found"/auth errors, re-run `scripts/setup-ens-v2-subnames.mjs`. The registrar wallet needs Sepolia ETH for gas (~0.007/Spark; top up from a faucet).
- **Catalog index** is in-memory (resets on serverless cold start); the manifest is canonical on Walrus. Production: a KV/DB or rebuild from ENS subnames.
- **Nullifier store** is in-memory (`lib/nullifiers.ts`) — fine for a single dev process; production needs a KV/DB with a UNIQUE constraint.
- **Distribution**: Quick Action deeplinks / World Chat sharing not built yet.
- The Dev Portal app's integration URL still points at a placeholder until a public URL is set.

---

## 10. Changelog

| Date | Author | Change |
|---|---|---|
| 2026-06-14 | Build agent | **Real ENS v2 subname minting on Sepolia (auto-create on publish).** Discovered that Holesky is shut down and **Sepolia migrated to ENS v2** (PermissionedRegistry + per-name subregistries), so classic registration/`setSubnodeRecord` no longer work there. Registered the parent **`forgedapp.eth`** on ENS v2 programmatically (mock USDC is openly mintable → `scripts/register-ens-v2.mjs`), deployed a UserRegistry **subregistry** + shared resolver for it and assigned them (`scripts/setup-ens-v2-subnames.mjs`). New **`lib/ensV2.ts`**: on publish, `/api/publish` → `ensPublish` → `provisionSparkSubnameV2` registers `label.forgedapp.eth` in the subregistry and writes the ENSIP-26 `agent-context` (Walrus manifest pointer) to the resolver, with write-then-readback retry (v2 per-node auth lags right after registration). `ensChain.ts` gains `isEnsV2()` + v2 address book; reads use viem's Universal Resolver (works for v2 names unchanged). Verified live: `hello.forgedapp.eth` + `coffee-tip.forgedapp.eth` resolve `agent-context` on-chain; full `/api/publish` path mints end-to-end (only blocked by registrar gas balance). `.env` switched to `NEXT_PUBLIC_ENS_CHAIN=sepolia` + `ETH_RPC_URL=https://sepolia.drpc.org` + `ENS_V2_SUBREGISTRY`/`ENS_V2_RESOLVER`. `npm run build` clean. |
| 2026-06-14 | Build agent | **(superseded) Free ENS on Sepolia classic + auto subname mint.** Initial attempt used classic Sepolia ENS contracts; superseded same day after discovering Sepolia is now ENS v2. `ensChain.ts`/`ensPublish.ts` retained for the mainnet classic path. |
| 2026-06-14 | Build agent | **Real ENS integration (ens-cli pattern) — agent identity layer.** Functional, no-hard-coded ENS for the ENS prize tracks (AI-agent identity, most-creative, integrate). **Reads (`ens.ts`, live viem):** full profile (address/resolver/avatar/text), **ENSIP-26** agent records (`agent-context`, `agent-endpoint[mcp\|a2a\|web]`), **ENSIP-25** registry verification (`agent-registration[<erc7930>][<id>]`), forward/reverse name verification, `.eth` availability. **Writes (`ensWrite.ts`, the gskril/ens-cli pattern):** generate UNSIGNED calldata `{to,data,value}` for setText / agent-records (multicall) / subname — the caller signs with any Ethereum wallet (the World wallet is World-Chain-only). New routes `/api/ens/profile` + `/api/ens/calldata`; new `/identity` page (the Forge agent's live ENSIP-26 identity, reverse-resolve your wallet, a live name explorer, and a "name an agent" calldata generator with copy + round-trip refresh). Design agent gained `get_agent_identity` (ENSIP-26 discovery). Config `NEXT_PUBLIC_AGENT_ENS`. Verified live: `vitalik.eth` resolves with records (`verified:true`); `forge.eth` agent-records calldata encodes against its real resolver. `npm run build` clean. |
| 2026-06-14 | Build agent | **Walrus CLI + Sui wallet for public assets.** Installed `suiup`/`sui`/`walrus`; reconstructed `~/.sui/sui_config` from testnet keystore; downloaded `~/.config/walrus/client_config.yaml`. Stored the **public seed catalog** (19 Spark manifests) on Walrus testnet (`FORGE_PUBLIC_CATALOG_BLOB_ID`). Runtime publish/images still use the HTTP publisher/aggregator; CLI wallet is for on-chain public blobs only. |
| 2026-06-13 | Build agent (4 subagents) | **Icon system, dark mode, heart-pin, no emoji.** Foundations (parent): `icons.ts` + `<Icon>` (monochrome line glyphs, the only glyph source — **all emoji removed app-wide**, incl. dead `appEmoji`/`tint`/reward emoji); `SparkArt` redesigned to a **white glyph on a solid accent squircle** (no outline/translucency); `theme.ts` + globals re-based to **var-based tokens with a `:root[data-theme="dark"]` dark palette** (no-flash inline script in layout). Then 4 subagents: **(1) Home** — Add sheet gains **search + Recents** (from activity), Featured cards get a **heart to pin to Home**, custom how-it-works icons. **(2) Catalog/Activity/Run** — a **heart on every Spark card** pins/unpins to Home (`toggleShortcut`), emoji purged. **(3) Profile** — **Light/Dark/System theme picker** + settings (notifications toggle, clear local data, about). **(4) Components** — emoji→Icon across Nav/Create/Landing/AuthGate/RestaurantApp/ManifestRunner/PunchCard. `npm run build` clean; 0 pictographic emoji left in `src`. |
| 2026-06-13 | Build agent (2 subagents) | **Drag-to-reorder Home + multi-variation picker.** (1) Home "Sparks" edit mode now uses **touch drag-to-reorder** via `@dnd-kit` (Pointer+Touch sensors tuned so a tap still hits ✕; `arrayMove`→`saveShortcuts`), replacing the ◀/▶ buttons. New deps: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. (2) The design agent can now draft **2–3 variations at once** (`draft_variations` tool → `AgentTurn.drafts`/`Conversation.drafts`); when present the Create screen shows a **"Pick a variation"** selector (SparkArt + name + ENS + summary), and choosing one drops into the normal Preview/Publish/Tweak flow. A "Give me 3 variations" tweak chip summons a picker from any draft. `npm run build` clean. |
| 2026-06-13 | Build agent (4 subagents) | **Deeper Shakepay pass: editable Home, mono illustrations, richer agent, full-screen preview.** Foundations (parent): new `SparkArt` (custom **monochrome line illustrations** per Spark in its accent color — replaces emoji tiles app-wide) + `homeShortcuts` (localStorage order). Then 4 parallel subagents: **(1) Home** — the "Sparks" grid is now **editable** (Edit/Done toggle replacing "Get more"; ✕ remove, ◀/▶ rearrange, "Add a Spark" sheet, persisted). **(2) Agent** — toolbelt grew 3→7 tools (`list_sparks`, `get_capabilities`, `resolve_ens_name`, `suggest_labels`) and the prompt now proactively offers 2–3 build **variations** + iterates on drafts (still no spend/publish). **(3) Create** — the build **Preview is now full-screen** (overlay rendering the real `ManifestRunner` + Publish), plus "Tweak it" variation chips that re-prompt the agent. **(4) Restyle** — `SparkArt` + deeper Shakepay styling (big `.display` numbers, electric accents, rounded-3xl) across Catalog/Activity/Profile/RestaurantApp/ManifestRunner. `npm run build` clean. |
| 2026-06-13 | Build agent | **Shakepay-inspired UI makeover.** Followed the World mini-app **design guidelines** (24/16/32 spacing rhythm, centered states) and used the **Shakepay design language** as the style reference: re-based the `globals.css` token system around the electric-blue brand `#00A2FF` (`brand`/`brand-strong`/`brand-soft`, with the legacy `blue-*` names remapped onto it so every screen goes electric), added a bold **display font** (Bricolage Grotesque via `.display`) for headings, an `ink-panel` token (replacing hardcoded `#16204a` in PunchCard/RestaurantApp/Activity), and `shadow-soft`/`card`/`pop` (electric glow). Restyled the Home hero (electric gradient + glow), Create FAB + nav active state (brand), pill buttons, and all page titles/section headers; refreshed Landing/AuthGate/Profile gradients. `npm run build` clean; tokens verified in the compiled CSS. NB: the Stitch screen assets couldn't be fetched (only IDs, no hosted URLs / no Stitch integration), so this is grounded in the Shakepay brand + World guidelines. |
| 2026-06-13 | Build agent | **Fixed World ID "something went wrong" in World App.** Verified the Dev Portal config via MCP (app `app_76c26b…`, RP `rp_a4d9018439240167` **registered** on-chain, action `verify-human` present, signer key derives to the registered address — all correct). Root cause was the IDKit preset: `VerifyButton` used `orbLegacy` (World ID **3.0**-only), which fails for World ID **4.0** users. Switched to the mini-app-recommended **`proofOfHuman`** preset (4.0 + legacy Orb fallback), set `environment={APP.worldEnv}` explicitly, added an **`onError`** handler that maps IDKit/bridge error codes to actionable messages (no more silent "something went wrong"), and a `key={nonce}` so retries use a fresh RP signature. Also excluded the untracked `scripts/` dir from `tsconfig` so local `tsc`/`build` matches Vercel. `npm run build` clean. |
| 2026-06-13 | Build agent | **Per-menu-item photos on Walrus.** `menu` items now carry an optional `imageBlobId`; the publish page lists each item with an "Add photo" picker (uploads to Walrus via `/api/upload`, persists onto the draft item, served via `/api/blob/{id}`). `RestaurantApp` shows each item's photo in the Order tab, with a name/tag-based emoji tile fallback when none is set. `npm run build` clean. |
| 2026-06-13 | Build agent | **Restored the full sample-app set + rich runtime interface (ported from DappDock).** Rewrote `seeds.ts` into ~20 showcase Sparks across all five categories using `pay`/`claim`/`punch`/`menu` builders, each with a `tagline` + `stats` (rating/runs/reviews) + `featured` (new optional display fields on `DappManifest`; the catalog/Sparks cards now show ★ rating · runs). Reframed every workflow for Forge's sponsors — payments settle in the **World wallet on World Chain** (dropped all LI.FI/`sourceChain` wording, no Composer app). Ported the **full interface**: new `RestaurantApp` (Order / Rewards / History tabs, cart, points marketplace, pickup-code confirmation) that `ManifestRunner` delegates every `menu` Spark to, and a new `PunchCard` pass that it uses for `punchCard` Sparks. Added `store.spendPoints` + `OrderRecord.userHandle/simulated`, and `POINTS_REWARDS`. `npm run build` clean. |
| 2026-06-13 | Build agent (3 subagents) | **Sparks page + Walrus images + Activity + fixed nav.** (1) **Sparks (catalog)** rebuilt World-App-style: a **Featured** horizontal rail + per-category rails (vertical page + horizontal scroll) + category chips; `AppRecord` gained `imageBlobId`/`featured`. (2) **Walrus images now work end-to-end** — `walrus.storeBytes`, `POST /api/upload` (raw bytes, ≤5MB), `GET /api/blob/[id]` (aggregator read proxy); publish has an optional **cover image** picker; `validateManifest` + `/api/publish` preserve `storage.imageBlobId`; the image shows on the Sparks cards + run page + `ManifestRunner`. (3) **Rewards → Activity** (`/activity`): activity feed leads, plus total points + loyalty passes; old `/rewards` removed. (4) **FloatingNav**: Activity tab; bar is now **truly fixed** (`translateZ(0)` compositing layer, `z-50`) so it no longer drifts on fast scroll. `npm run build` clean; deployed to Vercel. |
| 2026-06-13 | Build agent | **Ported workflow + floating oval nav + Rewards.** Floating oval tab bar (Home/Apps/center Create FAB/Rewards/Profile) visible on every tab; Create is no longer fullscreen (composer floats above the bar). Ported the working runtime: `MiniKit.pay` (USDC/World Chain) with simulated fallback (`lib/pay.ts`, `/api/pay-nonce`), punch-card stamping + points, `menu` ordering with a pickup code, activity receipts, and a Rewards hub backed by a `localStorage` store (`lib/store.ts`). Expanded to 8 built-in sample apps with per-app emoji/accent (`appStyle.ts`). Flipped the Developer Portal app to **mini-app** mode and renamed it **Forge** via the MCP. |
| 2026-06-13 | Build agent | **Walrus storage + catalog + run loop.** `lib/walrus.ts` (HTTP publisher/aggregator), `lib/catalog.ts` index, and `/api/publish` `/api/catalog` `/api/app/[ens]` + the catalog/run pages. |
| 2026-06-13 | Build agent | **World ID via IDKit 4.x.** RP-signature route, verify-proof route (v4 verifier + nullifier store), `VerifyButton`; the runtime gates runs behind proof-of-human. |
| 2026-06-13 | Build agent | **Design agent + manifest runtime.** Ported the manifest types + validator; server-side Anthropic tool loop (`/api/agent`) + template fallback; `ManifestRunner`; Create chat. |
| 2026-06-13 | Build agent | **Pivot to Forge (World App Mini App).** Replaced the Expo/RN app with Next.js + MiniKit + World sign-in (SIWE). Sponsors realigned to **World + ENS + Walrus** (dropped LI.FI; ENS used for created-app/agent identity, not people). Prior Expo history is in git up to merge `d759cc0`. |

---

*Last reviewed against the codebase: 2026-06-13 (Forge — Next.js 16 World App Mini App; World + ENS + Walrus; floating oval nav; agent → manifest → Walrus publish → World-ID-gated run).*
