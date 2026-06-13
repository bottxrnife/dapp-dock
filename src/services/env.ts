/**
 * Credentials for the three sponsor integrations (ENS, World ID, LI.FI). All
 * EXPO_PUBLIC_* vars are inlined at bundle time from `.env` — see `.env.example`.
 * Every service degrades to a clearly-labeled simulated mode when its credential
 * is missing, so the full demo loop works before any keys are added.
 */
export const ENV = {
  // ── World ID ──────────────────────────────────────────────────────────────
  // developer.world.org → create an app + an incognito action.
  worldAppId: process.env.EXPO_PUBLIC_WORLD_APP_ID ?? '',
  worldAction: process.env.EXPO_PUBLIC_WORLD_ACTION ?? 'verify-human',
  // "orb" = proof of unique human (orbLegacy preset, the docs default); "device"
  // is the lower-assurance fallback.
  worldVerificationLevel: process.env.EXPO_PUBLIC_WORLD_VERIFICATION_LEVEL ?? 'orb',
  // Proof verification endpoint. Per docs.world.org the cloud verifier is v4 at
  // developer.world.org. Point this at YOUR backend proxy in production (World ID
  // Track B requires verification in a backend/contract); the app POSTs the proof
  // to `${worldVerifyUrl}/${worldRpId||worldAppId}`.
  worldVerifyUrl: process.env.EXPO_PUBLIC_WORLD_VERIFY_URL ?? 'https://developer.world.org/api/v4/verify',
  worldRpId: process.env.EXPO_PUBLIC_WORLD_RP_ID ?? '',
  // World ID Wallet Bridge (native/mobile connect path).
  worldBridgeUrl: process.env.EXPO_PUBLIC_WORLD_BRIDGE_URL ?? 'https://bridge.worldcoin.org',

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
};

export const hasWorldCreds = () => ENV.worldAppId.startsWith('app_');
export const hasLifiKey = () => ENV.lifiApiKey.length > 0;
