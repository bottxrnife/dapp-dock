# AGENTS.md — DappDock

**Living document for AI agents and developers working on this repo.**

When you change architecture, add screens, wire integrations, fix bugs, or alter env vars — **update this file in the same PR/session** before finishing. Append to the changelog at the bottom with date + what changed. Do not let this file drift from the codebase.

---

## 1. Project summary

**DappDock** is a mobile-first “dapp app store” superapp: users discover, run, and **create** onchain mini-apps from one place. The core loop:

1. User describes an idea → **LLM design agent** drafts a mini-dapp (UI manifest + LI.FI workflow + ENS identity + World ID access rule).
2. User reviews permissions → tests → publishes.
3. Others open and run the dapp from the store.

**Stack:** Expo SDK **54** (targets Play Store / App Store Expo Go), React Native 0.81, expo-router ~6, TypeScript, Zustand, viem, Lucide icons, Geist font. Runs in **Expo Go from the stores** (no native build required for dev).

> **Native-only (web removed 2026-06-13):** there is **no web build** anymore — run natively (Expo Go on device, or Expo Orbit on the Mac). `react-dom`/`react-native-web`, the `npm run web`/`web:export` scripts, `app/+html.tsx`, the `app.json` `web` block, and the `_layout.tsx` phone-frame shell were all deleted. Do **not** re-add web support unless the user asks. Persistence is SecureStore-only (no `localStorage`).

> **SDK note:** SDK 56 is **not** on Play/App Store as of 2026-06. Do not upgrade to SDK 56 unless the user explicitly wants dev builds or sideloaded Expo Go from expo.dev/go.

**Sponsor tracks (exactly three — do not add a fourth blockchain integration):** **ENS** (`identity.ts` + `onchain.ts`, **pure viem via the Universal Resolver — no NameStone/third-party service**) is identity **and** on-chain storage (resolution, ENSIP-5 text records, ENSIP-25/26 agent identity); **World** (`verification.ts` = World ID 4.0 proof-of-human/one-per-human → Track B; `server/agentkit` = real AgentKit x402 human-backed free-trial → Track A) ; **LI.FI Composer** (`execution.ts` + `composer.ts`) is cross-chain USDC routing + composed onchain flows. The Anthropic agent is an AI feature, not a sponsor track. Every integration has a real keyed path and a non-failing simulated fallback — see §6. Two Node services back the World tracks (`server/`), kept out of the Expo bundle.

**On-chain by design:** the loyalty **punch count + points are read from ENS** (the `dappdock.loyalty` ENSIP-5 text record on the user's primary name) — a credential stored in ENS, not just on-device. See §6b.

**Design source of truth:** `design_handoff_dappdock/` — `README.md` (pixel spec), `BUILD_GUIDE.md` (architecture), `dapp-manifest.example.json` (manifest schema), `DappDock.dc.html` + `support.js` (interactive prototype). Home ships **Variant A** (Classic hub) only; B/C exist in the prototype but were not implemented.

**Product constraint:** Published dapps are **schema-driven manifests**, not arbitrary user code. The runtime renders `components[]`, `permissions`, and `workflow` from JSON. This is intentional (security + reviewability).

---

## 2. Build chronology (what was done, step by step)

### Phase 0 — Handoff intake
1. Read `design_handoff_dappdock/README.md` (full UI spec: tokens, 9 screens, nav map, animations, state model).
2. Read `BUILD_GUIDE.md` (7 core services, ENS/LI.FI/World integration plan, demo script).
3. Read `dapp-manifest.example.json` (canonical manifest for the hackathon team dues demo).
4. Read `DappDock.dc.html` + `support.js` (prototype logic: scripted chat timeline, runtime step timing, navigation).

### Phase 1 — Scaffold
5. Initialized Expo blank TypeScript app in repo root (`create-expo-app`).
6. Moved `design_handoff_dappdock/` aside during scaffold, restored after.
7. Set `package.json` `main` → `expo-router/entry`.
8. Installed: `expo-router`, safe-area, screens, linking, constants, status-bar, font, splash-screen, web-browser, linear-gradient, secure-store, clipboard, crypto, svg, Geist fonts.
9. Installed app deps: `viem`, `@noble/ciphers`, `zustand`, `lucide-react-native` (with `--legacy-peer-deps` due to react-dom peer conflict).
10. Configured `app.json`: name `DappDock`, scheme `dappdock`, background `#F5F6FA`, expo-router plugin.
11. Removed template `App.tsx` / `index.ts`.

### Phase 2 — Design system & shell
12. Created `src/theme.ts` — all color tokens from spec (`C.bg`, `C.blueSoft`, etc.) + `font()` helper for Geist weights.
13. Created `src/components/ui.tsx` — `Txt`, `FadeUp`, `Pulse`, `TypingDots`, `Chip`, `IconTile`, `SearchPill`, `BackButton`, `PrimaryButton`, `SectionHeader`, `ListRow`, `OpenPill`, `Screen`.
14. Created `src/components/TabBar.tsx` — Home / Store / Create FAB / Profile with spec shadows and gradient fade.
15. Created `app/_layout.tsx` — Geist font loading, splash hide, Stack with `animation: 'none'` (per-screen `FadeUp` owns transitions).
16. Created `src/polyfills.ts` — `crypto.getRandomValues` via `expo-crypto` for viem + World ID bridge on Hermes.

### Phase 3 — Data model & state
17. Created `src/types.ts` — `DappManifest`, `DappListing`, `WorkflowStep`, `ChatMessage`.
18. Created `src/data/seeds.ts` — `HACKDUES_MANIFEST` + 5 seed listings (Split USDC, DAO Vote, Agent Market, Ticket Claim, Run Club).
19. Created `src/state/store.ts` (Zustand) — session, wallet snapshot, listings, agent conversation (`apiHistory` + `UiMessage[]`), draft manifest, simulation result, builder credits.

### Phase 4 — Core services (BUILD_GUIDE’s 7 services)
20. **`src/services/env.ts`** — reads `EXPO_PUBLIC_*` vars; `hasWorldCreds()`, `hasLifiKey()`.
21. **`src/services/manifest.ts`** — `validateManifest()` gates agent output; enforces component types, plain-English permissions, 2–6 workflow steps, no raw addresses in permissions.
22. **`src/services/identity.ts`** — pure ENS via viem mainnet (Universal Resolver): resolve/reverse, ENSIP-5 text records, ENSIP-12 avatars, ENSIP-26 agent records; `publishSubname()` assigns `label.<domain>` (live when it already resolves on-chain).
23. **`src/services/verification.ts`** — **World ID 4.0** (encrypt request → Wallet Bridge → deep link World App → poll bridge → `verifyProof()` against the v4 verify endpoint `/api/v4/verify/{rp_id|app_id}`). Verify URL is configurable for the Track B backend/contract requirement. Simulated when no `WORLD_APP_ID`.
24. **`src/services/execution.ts`** — LI.FI quote/simulate; **real execution** when wallet funded (approve + send + poll `li.quest/v1/status`); unfunded = validated quote + spec timeline timing. `runFlow` delegates to `composer.ts` when `workflow.composer` is set. All calls go through `ENV.lifiApiUrl`.
24b. **`src/services/composer.ts`** — **LI.FI Composer**: swap+deposit a user's USDC into a yield vault in ONE composed transaction (a `/quote` whose `toToken` is a vault token → Composer onchain VM). `simulateComposerDeposit` (agent), `runComposerDeposit` (execute, funded → approve LI.FI Diamond + send + poll; unfunded → timeline), `fetchTopUsdcVault` (Earn API discovery, falls back to `DEFAULT_VAULT`).
25. **`src/services/wallet.ts`** — burner key in `expo-secure-store`; balances on Base/Arbitrum/Optimism/Polygon USDC + native gas.
26. **`src/services/assistant.ts`** — deterministic template fallback (`generateManifest`) when no Anthropic key.
27. **`src/services/agent.ts`** — **real LLM agent**: Anthropic Messages API + tool loop. Tools: `get_wallet_overview`, `list_store_dapps`, `resolve_ens_name`, `check_ens_subname`, `simulate_lifi_route`, `simulate_composer_route`, `draft_dapp_manifest` (accepts a `workflow.composer` target). **No spend/publish tools** (human confirms those).

### Phase 5 — Screens (expo-router)
28. `app/index.tsx` — Onboarding; World ID CTA → `verifyHuman()` → `/home`; Explore → `/store`.
29. `app/home.tsx` — Variant A hub: header with live wallet balance, hero card, 8 quick tiles, recommended rows. Tab bar.
30. `app/store.tsx` — Category pills, featured horizontal scroll, sections (Verified by humans / Built with agents / Recently published). Tab bar.
31. `app/detail/[ens].tsx` — Trust chips, permissions card (1.5px blue border), workflow preview, Run CTA. Resolves listing by ENS param.
32. `app/runtime/[ens].tsx` — Form → processing timeline (pulse on active step) → done. `ens=draft` uses `draft` from store. World ID gate before pay. Real or simulated execution.
33. `app/assistant.tsx` — Chat/Flow segmented control; real agent via `runAgentTurn()`; prompt chips; generated dapp card; typing dots; activity lines for tool calls.
34. `app/preview.tsx` — Live preview frame, summary rows, Edit/Test/Publish actions.
35. `app/publish.tsx` — 5-item checklist; `publishSubname()` + `addListing()`.
36. `app/success.tsx` — Published confirmation; links to store/profile.
37. `app/profile.tsx` — Stats, embedded wallet (copy address), created/saved dapps, agent fleet cards. Tab bar.

### Phase 6 — User pivot: “real app”, not demo
38. User requested real working app with LLM agent + tool calls (not scripted demo only).
39. Replaced scripted `playChat()` timeline with `agent.ts` tool-calling loop.
40. Added wallet service + real LI.FI execution path.
41. Home balance reads live `wallet.totalUsdc` instead of hardcoded `$128.40`.

### Phase 7 — QA & fixes
42. Typecheck: `npx tsc --noEmit` — clean.
43. Bundle: `npx expo export --platform ios` — clean.
44. **Expo Go “failed to download remote update”** — LAN IP unreachable from phone. Fix: `npx expo start --tunnel`; URL pattern `exp://<urlRandomness>-anonymous-8081.exp.direct` (see `.expo/settings.json` → `urlRandomness`).
45. **Hermes compat in `verification.ts`** — replaced `atob`/`TextDecoder` with manual base64 + UTF-8 decode (World ID bridge would crash otherwise).
46. **Navigation anti-pattern** — `preview.tsx` / `publish.tsx` used `router.replace()` during render; fixed with `<Redirect href="/assistant" />`.
47. Added `.env` to `.gitignore`.
48. Created `.env.example` and root `README.md`.
49. Installed `@expo/ngrok` (devDependency) for tunnel mode.

---

## 3. Repository map

```
dapp-dock/
├── app/                          # expo-router screens (file-based routes)
│   ├── _layout.tsx               # Root: fonts, splash, Stack
│   ├── index.tsx                 # Onboarding (/)
│   ├── home.tsx                  # Home tab
│   ├── store.tsx                 # Store tab (?category= param)
│   ├── profile.tsx               # Profile tab
│   ├── scan.tsx                  # QR scanner (center tab action)
│   ├── search.tsx                # Store search (filterListings)
│   ├── rewards.tsx               # Rewards hub: passes, tier, points marketplace
│   ├── activity.tsx              # Activity / receipts feed
│   ├── wallet.tsx                # Wallet: receive QR, send, per-chain, backup
│   ├── pay.tsx                   # Pay-by-ENS (P2P) + contacts + request QR
│   ├── assistant.tsx             # Create tab → assistant (no tab bar)
│   ├── preview.tsx               # Generated dapp preview
│   ├── publish.tsx               # Publish checklist
│   ├── success.tsx               # Post-publish success
│   ├── detail/[ens].tsx          # Dapp detail (save, reviews, share QR, not-found)
│   ├── redpacket/new.tsx         # Create a red packet (lucky money)
│   ├── redpacket/[id].tsx        # Claim / share a red packet
│   └── runtime/[ens].tsx         # Dapp runtime; ens=draft; editable inputs; menu/order mode
├── src/
│   ├── theme.ts                  # Design tokens
│   ├── dappStyle.ts              # Per-dapp accent + emoji identity (DappAvatar)
│   ├── types.ts                  # DappManifest, DappListing, etc.
│   ├── polyfills.ts              # crypto.getRandomValues for Hermes
│   ├── data/seeds.ts             # Seed listings + HACKDUES/BURGERBLOCK/BISTRO/CAFE + POINTS_REWARDS
│   ├── state/store.ts            # Zustand global state + persistence (persistJSON/loadJSON)
│   ├── components/
│   │   ├── ui.tsx                # Shared UI primitives
│   │   ├── PunchCard.tsx         # Loyalty punch-card pass (renders `punchCard` component)
│   │   ├── MenuOrder.tsx         # Restaurant menu + cart (renders `menu` component)
│   │   ├── RestaurantApp.tsx     # Tabbed menu mini-app: Order / Rewards / History + pickup QR
│   │   ├── QR.tsx                # QR wrapper (optional react-native-qrcode-svg; degrades)
│   │   └── TabBar.tsx            # Bottom tab bar: Home/Store/Scan FAB/Create/Profile
│   └── services/
│       ├── env.ts                # Environment / credential helpers
│       ├── agent.ts              # LLM agent + toolbelt (PRIMARY)
│       ├── assistant.ts          # Template fallback manifest generator
│       ├── manifest.ts           # Schema validation
│       ├── identity.ts           # ENS via viem (resolve, text records, ENSIP-26 agent records)
│       ├── verification.ts       # World ID bridge + verify
│       ├── execution.ts          # LI.FI simulate + execute (runFlow; delegates to composer.ts)
│       ├── composer.ts           # LI.FI Composer: swap+deposit to a yield vault in one tx
│       ├── wallet.ts             # Embedded burner wallet + sendUsdc + exportPrivateKey
│       ├── onchain.ts            # Loyalty ← ENS text record (pure viem getEnsText read)
│       ├── loyalty.ts            # Tier ladder + points/pass aggregation helpers
│       ├── notify.ts             # Optional local notifications (expo-notifications)
│       ├── biometric.ts          # Optional spend gate (expo-local-authentication)
│       ├── agentkit.ts           # Client view of the AgentKit server (plain HTTP; SDK stays server-side)
│       └── links.ts              # Deep-link parsing + share-link builders
├── server/                       # Node services (NOT in the Expo bundle)
│   ├── worldid-verify.mjs        # World ID 4.0 backend verifier (Track B: backend validation + UNIQUE nullifier)
│   └── agentkit/                 # World AgentKit (Track A): x402 free-trial resource server + agent client
├── __tests__/                    # Jest unit tests (loyalty, manifest, links, onchain, store, composer)
├── .maestro/                     # Maestro e2e flows (8 journeys) + README
├── jest.config.js / jest.setup.js / babel.config.js  # test harness (jest-expo)
├── design_handoff_dappdock/      # Original design spec (DO NOT DELETE)
├── .env.example                  # Credential template
├── app.json                      # Expo config
├── package.json
├── README.md                     # User-facing run instructions
└── AGENTS.md                     # This file
```

---

## 4. Navigation map (implemented)

```
Onboarding (/) ── World ID ──→ /home        ── Explore ──→ /store
/home: search → /search; hero → /assistant; tiles: Pay → /pay, Swap/Fundraise/Members → /detail/<ens>,
       Lucky → /redpacket/new, Agents/Events → /store?category=..., Rewards → /rewards; avatar → /profile
/home: recommended rows → /detail/<ens> (incl. Burger Block, Corner Bistro)
/search: filterListings results → /detail/[ens]; no match → /assistant
/store: rows/featured → /detail/[ens]; accepts ?category= deep link; search pill → /search
/detail/[ens]: Run → /runtime/[ens]; heart → toggleSave; share → QR (dappdock://detail/<ens>);
       reviews gated by World ID (one per human); unknown ENS → not-found
/runtime/[ens]: editable amount/memo; menu dapps → in-app cart → pay total; biometric spend gate;
       loyalty stamp + points + activity recorded; Ask assistant → /assistant; done → /home
/rewards: passes + tier + points marketplace (spendPoints) → /runtime/<ens>; → /activity
/activity: receipts feed (tap onchain entry → explorer)
/wallet: receive QR, send (biometric), per-chain breakdown, reveal key
/pay: resolve ENS → sendUsdc; recents (contacts); request QR (dappdock://pay?to=…)
/redpacket/new: create → /redpacket/[id]; /redpacket/[id]: claim (World ID one-per-human) + share QR
/scan: QR (dappdock://detail|runtime|redpacket|pay/<seg> or any ENS) → route; manual paste + demo chips
/assistant: card → /preview   /preview: Edit/Test/Publish   /publish → /success
Tab bar (home, store, profile): center FAB → /scan; Create → /assistant; Profile → /wallet, /rewards, /activity
```

---

## 5. State model (`useApp` / Zustand)

| Field | Purpose |
|---|---|
| `verified`, `verifiedSimulated` | World ID session |
| `wallet` | `WalletSnapshot` from `getWalletSnapshot()` |
| `listings` | Store catalogue (`DappListing[]`) |
| `builderCredits`, `publishedCount` | Profile stats |
| `apiHistory` | Anthropic multi-turn message history (for agent) |
| `messages` | UI chat: `chat` \| `activity` \| `card` messages |
| `agentBusy` | Disables input while agent runs |
| `draft` | Current generated `DappManifest` |
| `draftPublishedLive` | Whether the published name already resolves on-chain (real ENS registration) |
| `simulation` | Last `SimulationResult` from LI.FI |
| `loyalty` | Per-dapp `LoyaltyRecord` (`punches`, `points`, `redeemed`); `addStamp` / `redeemReward(ens, cardSize)` / `spendPoints(ens, cost, label)→bool`. Persisted to the local SecureStore cache; ENS is the read-through overlay (see §6b) |
| `loyaltyOnchain` | `true` once a loyalty card was **read** from the user's ENS `dappdock.loyalty` text record (`syncLoyaltyFromChain`); drives the "Synced from your ENS profile" indicator on `PunchCard` + `/rewards` |
| `activity` | `ActivityEntry[]` receipts feed; `recordActivity(e)` (capped 100) |
| `savedEns` | Favorited dapp ENS list; `toggleSave(ens)` / `isSaved(ens)` |
| `homeShortcuts` | Customizable Home tile grid (persisted); `addShortcut` / `removeShortcut` / `resetShortcuts`; `DEFAULT_SHORTCUTS` |
| `orders` | Menu/restaurant orders (persisted); `placeOrder(o)→record` for the History tab + pickup QR; `addPoints(ens, n)` for points-only loyalty |
| `userListings` | User-published listings (merged ahead of seeds into `listings`) |
| `reviews` | `Record<ens, Review[]>` one-per-human (keyed by World ID nullifier); `submitReview(ens, r)` |
| `redPackets` | `Record<id, RedPacket>` lucky money; `createRedPacket(opts)→id` / `claimRedPacket(id, nullifier)` |
| `contacts` | Saved payees for pay-by-ENS; `saveContact(c)` |

**Persistence (local cache):** generic `persistJSON(key, value)` / `loadJSON(key)` over **expo-secure-store only** (web removed). Keys under `dappdock.*` (theme, loyalty, activity, saved, listings, reviews, redpackets, contacts). `loadPersistedState()` restores all slices from `_layout` (alongside `loadThemePreference()`). Theme is stored raw; everything else as JSON. The local cache is the **offline fallback**; for loyalty, ENS is the source of truth (§6b) and `syncLoyaltyFromChain()` (called from Home after the wallet loads) hydrates the cache from chain.

**Helpers:** `findListing(ens)`, `listingFromManifest(manifest)`.

---

## 6. Integrations & credential matrix

| Env var | Service | Real behavior | No-key fallback |
|---|---|---|---|
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | `agent.ts` | Claude tool-calling agent | `assistant.ts` template generator; UI shows “template mode” |
| `EXPO_PUBLIC_WORLD_APP_ID` (+ `_RP_ID`/`_ACTION`/`_ENV`/`_VERIFY_URL`) | `verification.ts` | World ID 4.0: Wallet Bridge → World App → **v4** `/api/v4/verify` (point `_VERIFY_URL` at `server/worldid-verify.mjs` for Track B) | Simulated verify (~1.4s) |
| `EXPO_PUBLIC_AGENTKIT_URL` | `agentkit.ts` → `server/agentkit` | **World AgentKit (Track A):** human-backed agent x402 free-trial (3 free uses, then pay). Real `@worldcoin/agentkit` runs server-side | App shows a labeled offline/simulated status |
| `EXPO_PUBLIC_LIFI_API_KEY` (+ `LIFI_API_URL`, `LIFI_COMPOSER_URL`) | `execution.ts` + `composer.ts` | Cross-chain USDC routing **and** Composer (swap+deposit to a vault in one tx — `toToken`=vault on the open `/quote` API). Key only raises rate limits | Quotes still work unauthenticated; unfunded = validated route + timeline |
| `EXPO_PUBLIC_ENS_DOMAIN` | `identity.ts` (publish/resolve) + `onchain.ts` (loyalty) | **Pure ENS via viem** — no third-party subname service. Namespace for dapp/agent identities; resolution, reverse names, ENSIP-5 text records, ENSIP-12 avatars, ENSIP-26 agent records all from L1 via the Universal Resolver. Loyalty read from each user's `dappdock.loyalty` text record | No key needed; loyalty falls back to local SecureStore cache when no record/primary name |
| `EXPO_PUBLIC_ETH_RPC_URL` | `identity.ts` + `onchain.ts` | Mainnet ENS resolution + loyalty/agent text-record reads | Defaults to publicnode |

**Wallet (no env):** Auto-generated burner on device (expo-secure-store). Fund with USDC + gas on Base/Arbitrum/Optimism/Polygon for real LI.FI execution / `sendUsdc`; unfunded = simulated timeline. `exportPrivateKey()` reveals the key for backup (behind the biometric gate).

**Every function is real-with-fallback (audited 2026-06-13):** no integration throws into the UI when its key is missing or a network call fails — each returns a clearly-labeled simulated result. Only the three sponsor hosts + the Anthropic agent are contacted: an Ethereum RPC (ENS, via the Universal Resolver), `li.quest` + `earn.li.fi` (LI.FI + Composer + Earn vault discovery), `bridge.worldcoin.org` / `developer.world.org` (World ID 4.0), `api.anthropic.com`. Do not add other external hosts (no NameStone — ENS is the sponsor track, used directly).

---

## 6b. On-chain storage (ENS) & sponsor-track mapping

**Why ENS for storage:** the project is limited to its three implemented sponsor tracks, and "everything on-chain (incl. the punch count)" maps cleanly onto **ENS text records** — exactly the ENS "Most Creative Use" pattern ("store credentials in text records, subnames as access tokens"). **Pure ENS via viem — no NameStone or any third-party subname service** (ENS itself is the sponsor track). No 4th sponsor / no custom contract needed.

**ENS is used directly (per the ENS docs / llms-full.txt):**
- All resolution starts on L1 mainnet through the **Universal Resolver** (`0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`), which viem ≥2 targets automatically — this is ENSv2- and CCIP-Read-ready (offchain/L2 subnames resolve transparently).
- **Agent identity (ENSIP-25 + ENSIP-26):** the design agent is `assistant.agent.<ENS_DOMAIN>`. `identity.ts` reads its `agent-context` and `agent-endpoint[<protocol>]` text records (`getAgentContext` / `getAgentEndpoint` / `getAgentProfile`) — a verifiable on-chain identity, not a cosmetic label.
- **Loyalty on ENS (`src/services/onchain.ts`):** the punch card lives in the user's **`dappdock.loyalty` ENSIP-5 text record** on their primary name, as JSON `{ "<dappEns>": { punches, points, redeemed }, … }` — a credential stored in ENS.
  - **Read** (`readLoyalty`): reverse-resolve the wallet → primary name (`lookupAddress`), then `getEnsText(name, 'dappdock.loyalty')` via the Universal Resolver. `syncLoyaltyFromChain()` (Home, after wallet load) merges chain → local cache (chain wins) and flips `loyaltyOnchain`.
  - **Write:** the in-app burner wallet can't write records on a name it doesn't own without an on-chain tx, so writes stay in the local SecureStore cache (the writable source of truth); ENS is the read-through overlay. Users opt in by setting the record on their own name in any ENS manager / ENSIP-5 resolver / CCIP-Read gateway.
  - **Fallback:** no primary name / no record → `readLoyalty` returns `null`; local cache is authoritative ("Saved on device"). When a record is found the UI shows "Synced from your ENS profile".

**Mapping each feature to a sponsor track (all real-with-fallback):**

| Feature | ENS | World ID | LI.FI |
|---|---|---|---|
| Loyalty punch card / points | **stores punches+points in a text record** | one-card-per-human gate | order/purchase settles any-chain |
| Restaurant order-ahead (`menu`) | merchant treasury name | optional | cart total routed cross-chain |
| Red packets / lucky money | sender name | **one-claim-per-human** | claim payout (escrow simulated) |
| Pay-by-ENS (`/pay`) | **resolve `alice.eth`** | — | `sendUsdc` routes USDC |
| Save / earn (`autosave`) | vault-position identity | optional | **Composer: swap+deposit to a vault in one tx** |
| Reviews | (authored credential) | **one-review-per-human** (nullifier) | — |
| Design agent | **ENSIP-25/26 identity (`agent-context`)** | human-backed creator | drafts LI.FI/Composer flows |
| Human-backed agent access | agent ENS identity | **AgentKit x402 free-trial (Track A) — World ID = human** | (paid capability settles USDC) |
| Publish a dapp | **`label.<domain>` identity + manifest records** | verified creator | — |

**Extending on-chain storage:** reuse the `onchain.ts` pattern — store a JSON blob in an ENSIP-5 text record and read it via viem `getEnsText` (Universal Resolver, CCIP-Read aware), never throw. To make writes first-class, set the record from a name the wallet owns (on-chain `setText`) or via a CCIP-Read offchain resolver / gateway you control — still pure ENS, no third-party API.

---

## 7. Agent toolbelt (`src/services/agent.ts`)

The agent **must not** get tools for spending or publishing. Boundaries are product rules.

| Tool | What it does |
|---|---|
| `get_wallet_overview` | Address + per-chain USDC/gas |
| `list_store_dapps` | Current store listings |
| `resolve_ens_name` | Mainnet ENS → address |
| `check_ens_subname` | Availability under `ENS_DOMAIN` |
| `simulate_lifi_route` | LI.FI quote Arbitrum→Base for amount |
| `simulate_composer_route` | LI.FI Composer deposit (swap+deposit to a vault) for amount |
| `draft_dapp_manifest` | Validates + stores draft (incl. optional `workflow.composer`); triggers UI card |

**Flow per user message:** push user text → up to 8 Anthropic turns → on `tool_use`, run tools → push `tool_result` → repeat until `end_turn` → surface assistant text + optional draft card.

**Model default:** `claude-sonnet-4-5` (override via `EXPO_PUBLIC_ANTHROPIC_MODEL`).

---

## 8. Manifest schema (runtime contract)

Canonical example: `design_handoff_dappdock/dapp-manifest.example.json`.

**Component types:** `amountInput`, `sourceChain`, `recipient`, `memoInput`, `punchCard`, `menu`, `submitButton`.

**Adding a component type — touch all 4:** `src/types.ts` union · `COMPONENT_TYPES` in `manifest.ts` · `draft_dapp_manifest` tool description in `agent.ts` · `SYSTEM_PROMPT` pattern in `agent.ts`. Then render it in `runtime/[ens].tsx`.

**`workflow.composer` (LI.FI Composer save/earn):** `{ vaultToken, vaultChainId, protocol?, vaultLabel? }`. When set, `runFlow` delegates to `composer.runComposerDeposit` — the user's USDC is swapped + deposited into the vault in one composed transaction (no separate recipient). Validated in `manifest.ts`; the agent sets it via `draft_dapp_manifest` after `simulate_composer_route`. Seed example: `autosave.dappdock.eth`.

**`punchCard` (loyalty/rewards):** `{ total, reward, pointsPerDollar }`. Runtime renders the pass (stamp grid + points) above the payment form; each successful run calls `addStamp()` (+1 stamp, `amount × pointsPerDollar` points) and `recordActivity()`. When the card is full the primary CTA flips to a free local redeem flow that calls `redeemReward()` and resets the stamps. Points also feed the `/rewards` hub + marketplace (`spendPoints`). Pair with `requiresWorldId` + `worldPolicy: "one-card-per-human"`.

**`menu` (restaurant ordering):** `{ currency, items: [{ id, name, priceUsd, desc?, tag? }], pointsPerDollar? }`. Any `menu` dapp renders the **`RestaurantApp`** tabbed mini-app (not the generic runtime): **Order** (cart via `MenuOrder` → pay total through `runFlow`, earn `pointsPerDollar` points), **Rewards** (redeem `POINTS_REWARDS` via `spendPoints`, shows the earn rate), **History** (past `orders`). It's **points-only — no `punchCard`/stamps**; points accrue via `addPoints`. After paying, a confirmation shows a **pickup QR** (`dappdock://order/<id>`) with the buyer's ENS/short-address + unique order id so the merchant can verify the order. Cart is runtime state, not a manifest field.

**`amountInput.locked`:** when `false`/absent the runtime renders an **editable** amount (and memo); the entered value flows through `runFlow` overrides. Locked amounts render as static rows (fixed-price dapps).

**`runFlow(manifest, onStep, overrides?)`:** `overrides.amountUsd` / `overrides.recipient` take precedence over component defaults — used by editable inputs, menu carts, and any caller needing a computed amount.

**Validation** (`manifest.ts`): name, description, outcome, ensLabel, 1–5 plain-English permissions (no `0x` addresses), 2–6 workflow steps, submitButton required, `requiresConfirmation: true` always forced.

**Views over one manifest:** Store card → Detail (permissions + trust) → Runtime (components + workflow timeline).

---

## 9. Animations & timings (from spec)

| Interaction | Timing |
|---|---|
| Screen enter | `FadeUp` 300ms, translateY 10→0 |
| Chat bubbles | `FadeUp` 300ms each |
| Typing dots | 1.2s blink, 0.2s stagger |
| Pulse (chip / active step) | 1.4–2.4s box-shadow loop |
| Runtime steps (simulated path) | 700/1400/2100/2800ms per step; done at 3600ms |
| Runtime steps (live path) | Driven by `runFlow()` callbacks as txs complete |

---

## 10. Running & debugging

```bash
npm install --legacy-peer-deps
# one-time, required by QR / notifications / biometrics (see §12):
npx expo install react-native-qrcode-svg expo-notifications expo-local-authentication
cp .env.example .env   # optional — app runs fully simulated without keys
npx expo start --tunnel -c   # prefer tunnel for physical devices
```

**Backend services (optional — for the World prize tracks).** Both are plain Node, isolated from the Expo bundle. Point the app at them via `.env` (use your LAN IP / tunnel for a physical phone), restart Expo with `-c`.

```bash
# Track B — World ID proof verification + UNIQUE nullifier (one-per-human)
WORLD_VERIFY_TRUST=1 PORT=8788 node server/worldid-verify.mjs      # demo (no real creds)
# real: WORLD_RP_ID=rp_… WORLD_APP_ID=app_… node server/worldid-verify.mjs
#   → EXPO_PUBLIC_WORLD_VERIFY_URL=http://<host>:8788/verify

# Track A — AgentKit x402 free-trial resource server (real @worldcoin/agentkit)
cd server/agentkit && npm install && AGENT_PAYTO=0xYourTreasury npm run server   # :4021
#   → EXPO_PUBLIC_AGENTKIT_URL=http://<host>:4021
#   register the agent (unlocks free trial, prompts World App):
#   npx @worldcoin/agentkit-cli register <agent-address>
```

**Native only (no web):** run on a device via **Expo Go** (scan the QR) or on the Mac via **Expo Orbit**. There is no `npm run web`. After tunnel starts, read `urlRandomness` from `.expo/settings.json` → `exp://<urlRandomness>-anonymous-8081.exp.direct`, or scan the QR from the terminal.

**Common failures:**

| Symptom | Likely cause | Fix |
|---|---|---|
| “Failed to download remote update” | Phone can’t reach Metro on LAN | Use `--tunnel`; same Wi-Fi or tunnel URL |
| “Incompatible SDK version” | Project SDK ≠ store Expo Go SDK | Keep project on SDK 54; or install matching Expo Go from [expo.dev/go](https://expo.dev/go) (Android) |
| Agent says “template mode” | No Anthropic key | Set `EXPO_PUBLIC_ANTHROPIC_API_KEY`, restart with `-c` |
| Runtime always simulated | Wallet unfunded | Send USDC + gas to address on Profile |
| Publish says simulated ENS | The `label.<domain>` name doesn't resolve on-chain yet | Register the subname for real (on-chain / your own resolver); `publishSubname` flips `live` when it resolves |
| Punch card says "Saved on device" (not ENS) | Wallet has no primary ENS name, or no `dappdock.loyalty` text record | Set a primary name + a `dappdock.loyalty` JSON text record in any ENS manager; reopen Home to `syncLoyaltyFromChain()` |
| `Unable to resolve module react-native-qrcode-svg / expo-notifications / expo-local-authentication` | Optional deps not installed | `npx expo install react-native-qrcode-svg expo-notifications expo-local-authentication` |
| World ID fails on device | Missing World App / wrong app id / env mismatch | Install World App; check `WORLD_APP_ID` is `app_...`; ensure `WORLD_ENV` matches the action's environment (production vs staging — the #1 trap) |
| World ID verify returns `app_not_migrated` | App isn't on World ID 4.0 | Migrate the app to 4.0 in the Developer Portal, or set `EXPO_PUBLIC_WORLD_PROTOCOL_VERSION`/verify URL to your backend that handles it |
| `simctl` warning on Mac | No Xcode simulators | Ignore for Expo Go; only affects iOS simulator |
| Bottom CTAs / tab bar under Android nav buttons | SDK 54 renders edge-to-edge; fixed bottom padding ignores system inset | All bottom padding must derive from `useSafeAreaInsets().bottom` — `Screen` adds it automatically; never hardcode `paddingBottom` on screen roots |

**Verify before shipping changes:**
```bash
npx tsc --noEmit
npm test                                              # Jest unit tests (needs deps installed)
npx expo export --platform ios --output-dir /tmp/dd-check
maestro test .maestro/                                # optional, needs a running app + Maestro
```

---

## 11. UX rules (enforce in code — do not regress)

1. Hide chains until needed (“Pay from any chain”, not “bridge Arbitrum→Base”).
2. Always show outcome before routing details.
3. Permissions in plain English only on cards; raw details behind “View technical details”.
4. Every dapp shows trust row: ENS, World verification, simulation status.
5. Creation is reversible: Edit / Test / Publish are separate steps.
6. Agents draft & simulate; humans confirm spend & publish.

---

## 12. What is NOT done yet (known gaps)

- Home variants B and C (prototype only).
- `assistant_service` does not stream tokens (full response per turn).
- No Privy/embedded smart-wallet — uses local burner key only (now with reveal/backup + `sendUsdc`).
- No app backend for the store: it's Zustand + seeds. User-published listings, loyalty, activity, saved, reviews, red packets and contacts now **persist** across restarts (SecureStore); they are still per-device (no sync). (World ID verification *does* have a backend now — `server/worldid-verify.mjs` — for Track B; point `EXPO_PUBLIC_WORLD_VERIFY_URL` at it.)
- Red-packet claim payout is recorded locally (no escrow contract) — World ID one-per-human and the share/claim UX are real; the LI.FI payout leg is simulated like other unfunded paths.
- **World Track A (AgentKit) is integrated server-side** (`server/agentkit`, real `@worldcoin/agentkit` + x402 free-trial) — the SDK can't run in the Hermes/RN client, so it lives in Node and the app talks to it over HTTP (`src/services/agentkit.ts`). Remaining manual steps for the live free-trial: register the agent address in AgentBook via the World App (`@worldcoin/agentkit-cli register`) and fund for post-trial x402 payments. **Track D (ProveKit)** is still not attempted (needs a Noir prover Hermes can't run).
- Category filter on Store doesn’t filter featured sections consistently for all edge cases.
- Android-specific World ID / deep link testing not verified.
- `EXPO_PUBLIC_ANTHROPIC_API_KEY` in client bundle (acceptable for hackathon; move to proxy for production).
- **New deps required:** `react-native-qrcode-svg`, `expo-notifications`, `expo-local-authentication`. `QR.tsx`, `notify.ts`, `biometric.ts` all degrade gracefully if absent, but the bundle needs them installed (`npx expo install …`). Multi-token execution, assistant streaming, and creator analytics remain unbuilt.

---

## 13. Instructions for agents updating this repo

**Before ending a session:**
1. Run `npx tsc --noEmit`.
2. If you changed routes, services, or env vars — update sections 3–8 and the changelog below.
3. If you fixed a runtime/device issue — add to section 10 table.
4. If you completed a gap from section 12 — remove or narrow it.

**Conventions:**
- Match existing `src/theme.ts` tokens; don’t invent new colors. `C` is a **proxy over light/dark palettes** — never snapshot `C.x` into module-level constants; read it during render. Text/icons on `C.cta` backgrounds must use `C.ctaText` (never `C.white`). Dark panels use `C.inkPanel` (`C.blueInk` is text-on-blueSoft and inverts in dark mode). Every new route screen must subscribe via `useApp((s) => s.themeMode)` (or destructure the whole store) so theme toggles repaint it.
- New screens go in `app/`; shared logic in `src/services/` or `src/components/`.
- Agent tools that move money or publish **must not** be added without explicit user request and security review.
- Prefer extending `DappManifest` schema + `validateManifest()` over ad-hoc UI.
- Use `--legacy-peer-deps` if npm peer conflicts on install.

**Do not:**
- Delete or overwrite `design_handoff_dappdock/`.
- Commit `.env`.
- Use `router.replace()` / `router.push()` during render — use `<Redirect>` or `useEffect`.

---

## 14. Changelog (agents: append here)

| Date | Author | Change |
|---|---|---|
| 2026-06-13 | Build agent | **UX round 2: smooth theme, customizable Home, Alipay-scan, restaurant app, pinned chrome.** (1) **Theme crossfade** — `ThemeFade` overlay fades the previous bg on light/dark switch (no snap). (2) **Customizable Home** — `homeShortcuts` (persisted) replaces the fixed 8 tiles; "Customize" edit mode (✕ / ＋ Add sheet) adds any action or store dapp. (3) **Scan = any QR** — `routeForPayload` now routes raw wallet addresses & non-dapp ENS → Pay, `dappdock://pay\|checkin/...` → Pay/run, dapp ENS → its page. (4) **Corner Bistro restaurant app** — `RestaurantApp` (Order/Rewards/History + pickup QR), **points-only** (100 pts/$1, `menu.pointsPerDollar` + `addPoints`), persisted `orders`. (5) **Pinned chrome** — detail header (back/details/share/heart) + Run button are now sticky; the body scrolls between them. (6) **Back to app** — finishing a run returns to the dapp's detail, not Home. `tsc` + Jest 53/53 + iOS bundle clean. |
| 2026-06-13 | Build agent | **UX polish: persistent tab bar, docked Create, per-dapp personality.** (1) **No more tab-flash** — the floating bar was remounting per screen; now there's **one `<TabBar/>` in the root layout** (`usePathname`-driven, animated in/out), so switching tabs never unmounts it. (2) **Create is docked** — entering Create keeps the tab bar (input floats above it); once the user focuses/types (or a conversation exists) the assistant goes **immersive** (`assistantImmersive` flag → bar slides away, input drops to the bottom for full-screen chat). (3) **Per-dapp identity** — new `src/dappStyle.ts` (deterministic accent hashed from ENS + hand-picked/category emoji) + `DappAvatar`; replaced the uniform monogram tiles everywhere (store, home, search, profile, detail, preview, assistant draft). `tsc` + Jest 50/50 + iOS bundle clean. README refreshed. |
| 2026-06-13 | Build agent | **World AgentKit (Track A) — real integration + both servers running.** Added `server/agentkit/` (isolated Node, own `package.json`/`node_modules`): a Hono **x402 resource server** guarded by `@worldcoin/agentkit` `createAgentkitHooks({ mode: { type: 'free-trial', uses: 3 } })` (`resource-server.mjs`) + a human-backed agent client via `createAgentkitClient().fetch()` (`agent.mjs`). Verified live: `/status` serves the free-trial config, `GET /agent/premium` returns **402** until the agent is AgentBook-registered (then 3 free uses), the World ID verifier enforces one-per-human. The AgentKit SDK is **never bundled** into the Expo app (confirmed via bundle grep) — the app reads the server over plain HTTP (`src/services/agentkit.ts` + `EXPO_PUBLIC_AGENTKIT_URL`) and Profile shows a "Human-backed agent · AgentKit" card with a "Run a human-backed task" action. Started both Node services (`worldid-verify.mjs` :8788, `agentkit` :4021). `tsc` + Jest 50/50 + iOS bundle clean. Remaining manual step for the live trial: `npx @worldcoin/agentkit-cli register <agent-address>` (World App). |
| 2026-06-13 | Build agent | **Maximize prize coverage within the 3 sponsors.** Added more real integrations so the one project qualifies for multiple prizes per sponsor. **LI.FI:** assistant **Flow tab → Composer inspector** (`ComposerInspector` — op sequence swap→bridge→deposit, destination vault, LI.FI Diamond execution contract, "1 transaction" badge → *Best Composer Tooling*); runtime shows a vault + "bundled into one transaction" note (→ *Best UX*); already had *Most Innovative* + *Agentic Workflows*. **ENS:** the Profile **agent fleet now resolves live ENSIP-25/26 identities** (`getAgentProfile` per `*.agent.<domain>`: verified badge + on-chain `agent-context`) → *Best AI Agents*, alongside *Most Creative* (loyalty credential in text records) + the *Integrate* pool. **World:** target *Track B* (+ *Track C* continuity); **Track A (AgentKit) and Track D (ProveKit) are intentionally not attempted** — both need a web/backend agent runtime or a Noir prover that can't run in Expo Go (a token import would be the "just a wrapper" Track A disqualifies). `tsc` + Jest 50/50 + iOS bundle clean. |
| 2026-06-13 | Build agent | **Testing + close sponsor-requirement gaps.** Ran the full suite green — `tsc --noEmit` clean, **Jest 50/50** (added `__tests__/composer.test.ts` + Composer cases in `manifest.test.ts`), iOS `expo export` clean. **ENS (anti-cosmetic):** the assistant header now shows the agent's **live** ENSIP-26 identity via `getAgentProfile(assistant.agent.<domain>)` (real Universal-Resolver lookup, no hard-coded label). **World ID Track B:** added `server/worldid-verify.mjs` — a zero-dependency Node backend that validates the proof against World's v4 endpoint and enforces a `UNIQUE (action, nullifier)` constraint (smoke-tested: 2nd identical nullifier → `duplicate_nullifier`); point `EXPO_PUBLIC_WORLD_VERIFY_URL` at it so verification is backend-side, not client-trusted. |
| 2026-06-13 | Build agent | **Sponsor-doc compliance pass (ENS, World ID, LI.FI) — pushed in 3 increments.** Verified each integration against its official docs (world.org SKILL.md, docs.ens.domains/llms-full.txt, docs.li.fi Composer + llms.txt) and the ETHGlobal NY 2026 prize criteria. **(1) ENS — pure viem, dropped NameStone** (ENS is the sponsor track; no third-party subname service): resolution/reverse/text/avatar via the **Universal Resolver**; new **ENSIP-26** agent-record helpers (`getAgentContext`/`getAgentEndpoint`/`getAgentProfile`) for the design agent's identity; loyalty stays a read-through `dappdock.loyalty` text record (write path is the local cache, since the burner can't own the name). Removed `namestoneApiKey`/`hasEnsCreds`. **(2) LI.FI Composer (was just `/v1/quote` routing).** New `composer.ts`: a `/quote` with `toToken`=vault returns a Composer route (swap+deposit in ONE tx); `runFlow` delegates when `workflow.composer` is set; `simulate_composer_route` agent tool + `draft_dapp_manifest` composer target (Agentic Workflows track); seed `autosave.dappdock.eth`; Earn API vault discovery. **(3) World ID 4.0** — verify proofs against the **v4** `/api/v4/verify/{rp_id}` endpoint with the v4 body (was the legacy v2 flat body); `rp_id`/`environment`/`protocol_version`/configurable `verify_url` (Track B requires backend/contract validation — documented + wired). `tsc` + iOS bundle clean. Commits authored as `bottxrnife` via `commit-tree` (no co-author trailer), conventional `type:` + bullet format. |
| 2026-06-13 | Build agent | **Robust e2e selectors + CI.** Added stable `testID`s to icon-only / dynamic-label controls (`tab-*`, `home-search`, `search-input`, `detail-run\|save\|share`, `runtime-submit\|pay`, `menu-add\|inc\|dec-<itemId>`, `pay-recipient\|amount\|send`, `redpacket-amount\|count\|split-equal\|split-lucky\|create\|open\|copy`, `theme-light\|dark`) — `testID` threaded through `PrimaryButton`/`SearchPill`/`SplitOption`. Rewrote the (local-only) Maestro flows 02,03,05,06,07,08 to select by `id:` instead of positional `point:`/`below:`/ambiguous text. Added **GitHub Actions CI** (`.github/workflows/ci.yml`): `tsc --noEmit` + `expo export` always, plus a **guarded** Jest step that self-installs + runs only if `__tests__/` is checked out (Jest/Maestro are gitignored local-only per the repo-sync commit). `tsc` clean. |
| 2026-06-13 | Build agent | **Repo sync commit.** Consolidated all superapp features into local `main`: wallet, rewards, search/activity, pay-by-ENS, red packets, menu ordering, on-chain loyalty, expanded seeds. Removed web preview (`+html.tsx`, react-native-web). `.gitignore` excludes local-only paths (`commits/`, `scripts/`, tests, Maestro, sponsor doc); Jest/Maestro configs stay local and out of the shipped tree. |
| 2026-06-13 | Build agent | **QA hardening: tests, e2e, multi-agent review.** Added a **Jest** harness (`jest.config.js`, `jest.setup.js` mocking expo-secure-store/notifications/local-auth, `babel.config.js`, test scripts, devDeps, tsconfig `exclude` for tests) with unit tests under `__tests__/` for `loyalty`, `manifest`, `links`, `onchain`, and the store (loyalty + red-packet reducers). Added a **Maestro** e2e suite under `.maestro/` (8 journey flows + README): onboarding, loyalty stamp/redeem, restaurant order, rewards hub, red packet, pay-by-ENS, search+save, theme toggle. Ran 4 parallel review agents (design×2, React-correctness, data-layer) and fixed every real finding: dark-mode gradient haze (new `bgWithAlpha()` in theme.ts, used by TabBar + assistant input fade), `pay.tsx` now sends to the **resolved** address (not the raw input) + headline `numberOfLines` + off-token color, `$NaN` guards on spendingCap (publish + detail), red-packet **share-inflation fix** (`createRedPacket` clamps `count ≤ cents` so shares always sum to the funded total), `validateManifest` now checks `punchCard`/`menu` internal shape, stable list keys (reviews/permissions/points/claims), and a Store **empty-category** state. `tsc` + iOS bundle clean. |
| 2026-06-13 | Build agent | **On-chain loyalty (ENS) + web removed + integration audit.** (1) **Loyalty stored on ENS** — new `src/services/onchain.ts` writes each user's punch/points to their `m<addr>.<ENS_DOMAIN>` subname `app.loyalty` text record via NameStone `set-name`, reads via `get-names` + viem `getEnsText` fallback; store mutations call `pushLoyaltyOnchain` (fire-and-forget), `syncLoyaltyFromChain()` hydrates from chain on Home load; `loyaltyOnchain` flag drives "Stamps stored on ENS / Synced to ENS" indicators on `PunchCard` + `/rewards`; graceful local-cache fallback with no NameStone key (see §6b). (2) **Web emulator deleted** — removed `app/+html.tsx`, the `_layout.tsx` phone-frame, `web`/`web:export` scripts, `react-dom` + `react-native-web`, `app.json` `web` block, and all `Platform.OS==='web'`/`localStorage` branches in `store.ts` + `wallet.ts` (native-only via Expo Orbit; persistence is SecureStore-only). (3) **Audited** every integration for real-keyed-path + non-throwing fallback; confirmed only the three sponsor hosts + Anthropic are contacted. `.env.example` documents on-chain loyalty. `tsc` clean. Parallelized via subagents (audit, web-cleanup, red-packet + pay-by-ENS screens). |
| 2026-06-13 | Build agent | **Superapp expansion (8 phases).** Foundation: generic `persistJSON`/`loadJSON` + persisted slices (`activity`, `savedEns`, `userListings`, `reviews`, `redPackets`, `contacts`), `loadPersistedState()` in `_layout`. **Rewards** (`/rewards`, `loyalty.ts` tiers, points marketplace `spendPoints`, `/activity` receipts, `notify.ts`). **Discovery** (`/search` + `filterListings`, save/heart on detail + profile, World-ID reviews `submitReview`, listing persistence, not-found guards). **Wallet** (`/wallet`: receive QR, `sendUsdc`, per-chain, `exportPrivateKey`, `biometric.ts` spend gate). **Editable runtime inputs** + `runFlow` overrides; share-a-dapp QR; `links.ts` shared deep-link parser. **Restaurant ordering**: new `menu` component + `MenuOrder.tsx` cart → LI.FI total (seed `bistro.dappdock.eth`). **Red packets** (`/redpacket/new` + `[id]`, World-ID one-claim-per-human, lucky/equal split). **Pay-by-ENS** (`/pay` resolve→`sendUsdc`, contacts, request QR). **Mini-apps batch**: Bean Counter Café, Charity Round-Up, Community Raffle, Parking Meter, Savings Circle, Transit Top-Up (`payManifest` helper). Home tiles → Pay/Lucky/Rewards; Scan demo chips added. New deps: `react-native-qrcode-svg`, `expo-notifications`, `expo-local-authentication` (all optional at runtime). `tsc` clean. |
| 2026-06-12 | Initial build agent | Full Expo app from `design_handoff_dappdock/` spec: 11 routes, 7 services, LLM agent with 6 tools, wallet + real LI.FI path, World ID bridge, NameStone publish, tunnel dev fix, Hermes base64 fix, Redirect navigation fix, `.env.example`, `README.md`, this `AGENTS.md`. |
| 2026-06-12 | Build agent | **Downgraded Expo SDK 56 → 54** for Play Store Expo Go compatibility. Updated all `expo-*` packages, `react@19.1.0`, `react-native@0.81.5`, `expo-router@~6.0.24`. Removed invalid `app.json` plugins (`expo-status-bar`, `expo-font`, `expo-web-browser`). Added `start:tunnel` script. |
| 2026-06-12 | Build agent | **Safe-area fix (Android edge-to-edge):** `Screen` now adds `max(insets.bottom, 12)` to all bottom padding (scroll + non-scroll); removed hardcoded `paddingBottom` override in `app/index.tsx`; assistant chat list/input and Flow tab pad by inset; `TabBar` gradient pads `max(insets.bottom, 12) + 12`. Rule added: never hardcode bottom padding on screen roots (section 10). |
| 2026-06-12 | Build agent | **Web preview:** added `react-dom` + `react-native-web`, `app/+html.tsx`, phone-frame shell in `_layout.tsx` (web only), `localStorage` wallet fallback in `wallet.ts`, `npm run web` / `web:export` scripts. |
| 2026-06-12 | Build agent | **Theming:** higher-contrast light palette (darker text2/text3, deeper blueSoft, dimmer bg, stronger dividers) + full **dark palette**; `C` is now a Proxy over the active palette with new tokens `ctaText` + `inkPanel`; `themeMode` in store with SecureStore/localStorage persistence (`loadThemePreference()` called from `_layout`); **Light/Dark toggle in Profile → Settings**; StatusBar + web backdrop follow theme; every route screen subscribes to `themeMode`. |
| 2026-06-12 | Build agent | **Fast-food loyalty mini-app (Burger Block Rewards):** new `punchCard` manifest component `{total, reward, pointsPerDollar}` (types, validator, agent toolbelt docs + system-prompt pattern); `src/components/PunchCard.tsx` pass UI (stamp grid on `inkPanel`, points pill, pulsing next slot); persisted `loyalty` state in store (`addStamp`/`redeemReward`, `loadLoyaltyState()` in `_layout`, demo seed 7/10 stamps); runtime renders the pass, stamps on successful purchase, and runs a free 4-step redeem flow when the card is full; seed listing `burgerblock.dappdock.eth` (featured, World ID `one-card-per-human`), Home recommended row, Scan demo chip "Burger counter". |
| 2026-06-12 | Build agent | **Scan tab + functional homepage:** TabBar is now 5 slots — Home, Store, **Scan (center FAB, QR scanner)**, Create, Profile. New `app/scan.tsx` (expo-camera ~17, `dappdock://` + ENS payload parsing, manual paste, demo-code chips, web fallback panel). All 8 home tiles route somewhere real (Swap/Fundraise/Members → new dapps; Agents/Events → `/store?category=`). Store reads `?category=` param; humans-section chip is data-driven (`requiresWorldId`). Added 6 seed dapps: Swap Anything, Table 12 Order & Pay, Coffee Tip Jar, Community Fundraiser, Club Membership Pass, Article Unlock. `expo-camera` config plugin in app.json. |

---

*Last reviewed against codebase: 2026-06-13 (SDK 54, native-only; pure-viem ENS + ENSIP-26, World ID 4.0 verify + AgentKit free-trial, LI.FI Composer; Node services in `server/`; customizable Home, RestaurantApp mini-app, persistent tab bar + theme crossfade).*
