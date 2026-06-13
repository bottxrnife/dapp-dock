/**
 * Credentials for the three sponsor integrations (ENS, World ID, LI.FI). All
 * EXPO_PUBLIC_* vars are inlined at bundle time from `.env` — see `.env.example`.
 * Every service degrades to a clearly-labeled simulated mode when its credential
 * is missing, so the full demo loop works before any keys are added.
 */
export const ENV = {
  // ── World ID 4.0 ──────────────────────────────────────────────────────────
  // developer.world.org → create an app (app_…) + an action, and (4.0) mint an
  // RP + signing key. `app_id` still works on the verify endpoint for backward
  // compatibility; prefer `rp_id` when you have it.
  worldAppId: process.env.EXPO_PUBLIC_WORLD_APP_ID ?? '',
  worldRpId: process.env.EXPO_PUBLIC_WORLD_RP_ID ?? '',
  worldAction: process.env.EXPO_PUBLIC_WORLD_ACTION ?? 'verify-human',
  // Credential preset: "orb" = Proof of Human (orbLegacy, unique human); "device"
  // is the lower-assurance fallback. Maps to the verify `responses[].identifier`.
  worldVerificationLevel: process.env.EXPO_PUBLIC_WORLD_VERIFICATION_LEVEL ?? 'orb',
  // Environment MUST match the action + World App (real device = "production",
  // simulator = "staging"). The #1 World ID debugging trap (SKILL.md, Step E).
  worldEnvironment: process.env.EXPO_PUBLIC_WORLD_ENV ?? 'production',
  // Proof-verification protocol version sent to the v4 endpoint. The Wallet
  // Bridge yields legacy proofs → "3.0" (the v4 endpoint verifies 4.0 AND legacy
  // 3.0 proofs); set "4.0" when forwarding native 4.0 proofs from your backend.
  worldProtocolVersion: process.env.EXPO_PUBLIC_WORLD_PROTOCOL_VERSION ?? '3.0',
  // Proof verification endpoint — World ID 4.0 cloud verifier (POST
  // /api/v4/verify/{rp_id|app_id}). IMPORTANT: World ID Track B requires proof
  // validation to happen in a *backend or smart contract*, never trusting the
  // client. For the prize, point this at YOUR backend (which forwards the proof
  // to World or verifies on-chain and enforces the nullifier UNIQUE constraint).
  // The default hits the cloud verifier directly so the demo works out of the box.
  worldVerifyUrl: process.env.EXPO_PUBLIC_WORLD_VERIFY_URL ?? 'https://developer.world.org/api/v4/verify',
  // World App connect deep link (Wallet Bridge). Override if World App won't open.
  worldConnectUrl: process.env.EXPO_PUBLIC_WORLD_CONNECT_URL ?? 'https://world.org/verify',
  // World ID Wallet Bridge (native/mobile connect path).
  worldBridgeUrl: process.env.EXPO_PUBLIC_WORLD_BRIDGE_URL ?? 'https://bridge.worldcoin.org',
  // World AgentKit resource server (Track A) — see server/agentkit. The app
  // talks to it over plain HTTP (the AgentKit SDK runs server-side, not in the
  // RN bundle). Set to your LAN IP / tunnel so a physical phone can reach it.
  agentkitUrl: process.env.EXPO_PUBLIC_AGENTKIT_URL ?? 'http://localhost:4021',

  // ── LI.FI + Composer ──────────────────────────────────────────────────────
  // portal.li.fi → API key (optional: the API is open; a key only raises rate
  // limits). `lifiApiUrl` is the REST base for /quote and /status — the same
  // endpoints power cross-chain routing AND Composer (set `toToken` to a vault
  // token and the route comes back through the Composer onchain VM; see
  // execution.ts + composer.ts). `lifiComposerUrl` is the dedicated ETHGlobal
  // NY 2026 hackathon Composer SDK host (alpha flashloan ops live only there).
  lifiApiKey: process.env.EXPO_PUBLIC_LIFI_API_KEY ?? '',
  lifiIntegrator: process.env.EXPO_PUBLIC_LIFI_INTEGRATOR ?? 'dappdock',
  lifiApiUrl: process.env.EXPO_PUBLIC_LIFI_API_URL ?? 'https://li.quest/v1',
  lifiComposerUrl: process.env.EXPO_PUBLIC_LIFI_COMPOSER_URL ?? 'https://ethglobal-composer.li.quest',

  // ── ENS ───────────────────────────────────────────────────────────────────
  // Pure ENS via viem on mainnet — resolution, reverse/primary name, text
  // records and avatars all start from L1 (chainId 1). No third-party subname
  // service. ensDomain is the namespace used for dapp/agent identities.
  ensDomain: process.env.EXPO_PUBLIC_ENS_DOMAIN ?? 'dappdock.eth',
  rpcUrl: process.env.EXPO_PUBLIC_ETH_RPC_URL ?? 'https://ethereum-rpc.publicnode.com',

  // ── Design agent (Anthropic / Claude Code proxy) ───────────────────────────
  // Direct API key takes precedence. When unset, agent.ts falls back to a local
  // Anthropic-compatible proxy (dappdock-claude-proxy) on the dev machine.
  anthropicProxyUrl: process.env.EXPO_PUBLIC_ANTHROPIC_PROXY_URL ?? '',
  anthropicProxyKey: process.env.EXPO_PUBLIC_ANTHROPIC_PROXY_KEY ?? 'dummy',
};

export const hasAnthropicProxy = () => ENV.anthropicProxyUrl.length > 0;
export const hasWorldCreds = () =>
  ENV.worldAppId.startsWith('app_') || ENV.worldRpId.startsWith('rp_');
export const hasLifiKey = () => ENV.lifiApiKey.length > 0;
