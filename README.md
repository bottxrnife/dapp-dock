# DappDock

A mobile dapp app-store superapp: discover, run, and **create** onchain mini-apps from one place. Describe an idea → the built-in LLM agent designs a mini-dapp (UI + LI.FI workflow + ENS identity + World ID access rule) → you review permissions and publish → anyone runs it in one tap.

Built with **Expo SDK 54** (React Native, expo-router), runs in **Expo Go from the Play Store / App Store**. Design spec and prototype live in `design_handoff_dappdock/`.

> **Why SDK 54?** Play Store / App Store Expo Go does **not** ship SDK 56 yet ([Expo changelog](https://expo.dev/changelog/sdk-56)). This project targets SDK 54 so it loads in the store version of Expo Go. If you need SDK 56, install Expo Go from [expo.dev/go](https://expo.dev/go) (Android direct install) or use a [development build](https://docs.expo.dev/develop/development-builds/introduction/).

## Run it

```bash
npm install
cp .env.example .env   # fill in keys (see below) — optional but recommended
npx expo start --tunnel -c
```

Install **Expo Go** from the Play Store / App Store, then scan the QR code (or use the tunnel URL if LAN fails). The app opens on the onboarding screen. On a Mac you can also launch it with **[Expo Orbit](https://expo.dev/orbit)**.

> **Native only.** There is no web build — run on a device (Expo Go) or via Expo Orbit. The QR codes, local notifications, and biometric spend-gate use `react-native-qrcode-svg`, `expo-notifications`, and `expo-local-authentication`; install them once with `npx expo install react-native-qrcode-svg expo-notifications expo-local-authentication` (each degrades gracefully if absent).

## Credentials

All keys go in `.env` (restart `npx expo start -c` after editing). Each layer falls back to a clearly-labeled simulated mode when its key is missing, so the app is usable immediately.

| Key | Where to get it | What it unlocks |
|---|---|---|
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | The real design agent: an LLM with tool calling that reads your wallet, browses the store, resolves ENS names, checks subname availability, simulates LI.FI routes, and drafts schema-validated dapp manifests. Without it: deterministic template drafting. |
| `EXPO_PUBLIC_WORLD_APP_ID` (+ `_RP_ID`, `_ACTION`, `_ENV`) | [developer.world.org](https://developer.world.org) — create an app + action, mint an RP/signing key | Real **World ID 4.0** proof-of-human: deep-links into World App via the Wallet Bridge and validates the proof against `/api/v4/verify`. Gates creation and one-per-human dapps. **Track B:** point `EXPO_PUBLIC_WORLD_VERIFY_URL` at your backend/contract for production (verification must not be client-trusted). |
| `EXPO_PUBLIC_LIFI_API_KEY` | [portal.li.fi](https://portal.li.fi) | Higher-rate LI.FI quotes/status + Composer. Quotes work without a key too. |
| `EXPO_PUBLIC_ENS_DOMAIN` (+ `EXPO_PUBLIC_ETH_RPC_URL`) | none — **pure ENS via viem** | The namespace for dapp / agent identities (`label.yourdomain.eth`, `assistant.agent.yourdomain.eth`). Resolution, reverse names, ENSIP-5 text records, ENSIP-12 avatars, and ENSIP-26 agent records (`agent-context`, `agent-endpoint[<protocol>]`) all resolve from L1 through the **Universal Resolver** — no API key. Loyalty punch cards are read from each user's `dappdock.loyalty` text record (set it in any ENS manager); otherwise the local device cache is authoritative. |
| `EXPO_PUBLIC_AGENTKIT_URL` | run `server/agentkit` (real `@worldcoin/agentkit`) | **World AgentKit (Track A):** a human-backed agent gets a 3-use x402 **free-trial** to a paid capability, then the normal payment flow resumes. The AgentKit SDK runs server-side; the app reads the free-trial status / fires a task over plain HTTP (Profile → "Human-backed agent"). |

## The wallet

A burner wallet is generated on first launch and stored in the device keychain (Profile tab → Wallet → copy address). Balances are read live from Base, Arbitrum, Optimism and Polygon.

- **Funded** (USDC + a little gas on any of those chains): running a payment dapp executes for real — ERC-20 approval, LI.FI transaction signed and sent from the device, `li.quest/v1/status` polled until funds settle at the destination, explorer link on the done screen.
- **Unfunded**: the route is still validated with a real LI.FI quote, and the timeline runs in simulated mode.

## Sponsor tracks (three sponsors, multiple prizes, all real-with-fallback)

The whole app is built on exactly three sponsor integrations, each with a real keyed path and a graceful simulated fallback:

- **ENS** — identity **and** storage, pure viem (no third-party subname service). ENS names resolve recipients/treasuries; the design agent + agent fleet have verifiable ENSIP-25/26 identities (`*.agent.<domain>` with live `agent-context` / `agent-endpoint` records, shown on Profile); and the **loyalty punch card lives in an ENSIP-5 text record** (`dappdock.loyalty` on each user's primary name) — a credential stored in ENS rather than a private DB. (Fits *Most Creative Use* + *Best AI Agents* + the *Integrate* pool.)
- **World** — **World ID 4.0** proof-of-human / one-per-human (loyalty, red-packet claims, reviews, gated dapps all break without it; proof validation runs in a backend → Track B), **plus World AgentKit** (Track A): a human-backed agent gets a free-trial to a paid x402 capability (`server/agentkit`).
- **LI.FI + Composer** — cross-chain USDC for every payment/order/tip/send, **plus LI.FI Composer** for one-tap swap+deposit "save/earn" dapps (`autosave.dappdock.eth`) where Composer bundles the whole flow into a single transaction; the assistant's Flow tab inspects the composed ops. (Fits *Most Innovative Composer App*, *Best UX*, *Best Composer Tooling*, *Agentic Workflows*.)

## Backend services (for the World tracks)

Both are plain Node, isolated from the Expo bundle (`server/`), with their own `package.json`. Point the app at them via `.env` (use your Mac's LAN IP, not `localhost`, for a physical phone), restart Expo with `-c`.

```bash
# World ID proof verification + one-per-human UNIQUE(action, nullifier) — Track B
WORLD_VERIFY_TRUST=1 PORT=8788 node server/worldid-verify.mjs   # local demo (no creds)
#   → EXPO_PUBLIC_WORLD_VERIFY_URL=http://<lan-ip>:8788/verify

# World AgentKit x402 human-backed free-trial — Track A
cd server/agentkit && npm install && AGENT_PAYTO=0xYourTreasury npm run server   # :4021
#   → EXPO_PUBLIC_AGENTKIT_URL=http://<lan-ip>:4021
#   register the agent (unlocks the free trial, prompts World App):
#   npx @worldcoin/agentkit-cli register <agent-address>
```

## Architecture

- `app/` — expo-router screens: onboarding, home, store, search, detail, runtime, assistant (Chat/Flow), preview, publish, success, profile, **rewards, activity, wallet, pay, redpacket/new, redpacket/[id]**. Home is a **customizable** shortcut grid (add/remove any action or dapp); `menu` dapps (e.g. Corner Bistro) render a tabbed **Order / Rewards / History** mini-app (`RestaurantApp`, points-only) with a **pickup QR**; **Scan** handles any QR (pay a wallet, order, check in, open a dapp). One persistent tab bar (no flash) and a smooth light/dark crossfade.
- `src/services/`
  - `agent.ts` — the LLM agent loop (Anthropic Messages API + toolbelt; drafting/simulating only — spending and publishing always require human confirmation).
  - `manifest.ts` — schema validation gate; the runtime only renders validated manifests.
  - `execution.ts` — LI.FI quote/simulate/execute + status polling (`runFlow` accepts amount/recipient overrides; delegates to `composer.ts` for save/earn dapps).
  - `composer.ts` — **LI.FI Composer**: swap+deposit a user's USDC into a yield vault in one composed transaction (+ Earn API vault discovery).
  - `identity.ts` — ENS via viem (Universal Resolver): resolution, reverse names, ENSIP-5 text records, ENSIP-12 avatars, ENSIP-26 agent records; `publishSubname` assigns the dapp its `label.<domain>` identity.
  - `onchain.ts` — **loyalty ↔ ENS text record** (`dappdock.loyalty` read via viem), with local-cache fallback.
  - `verification.ts` — World ID 4.0 proof-of-human (Wallet Bridge, pure-JS AES-GCM) + `/api/v4/verify` proof validation.
  - `wallet.ts` — embedded burner wallet (expo-secure-store) + multichain balances + `sendUsdc` + key backup.
  - `agentkit.ts` — client view of the AgentKit server (plain HTTP; the SDK stays server-side).
  - `loyalty.ts` / `notify.ts` / `biometric.ts` / `links.ts` — tier helpers, optional local notifications, optional biometric spend-gate, shared deep-link parsing.
- `src/dappStyle.ts` — per-dapp accent + emoji identity (so listings feel distinct, not uniform).
- `src/data/seeds.ts` — seeded store listings (every listing is a manifest; store, detail, and runtime are all views over the same schema).
- `server/` — Node services kept out of the Expo bundle: `worldid-verify.mjs` (Track B) and `agentkit/` (Track A).

## Product rules enforced in code

- Chains are hidden until needed ("Pay from any chain").
- Outcome is always shown before routing details.
- Permissions are plain English; raw details live behind "View technical details".
- Every dapp shows a trust row: ENS identity, World verification, simulation status.
- Agents draft and simulate; **humans confirm spend and publish** (the publish/spend tools simply don't exist in the agent's toolbelt).
