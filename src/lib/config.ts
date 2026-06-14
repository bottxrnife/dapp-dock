/**
 * Forge — app-wide config. The app is a World App Mini App: an AI agent that
 * builds human-only mini-apps. Sponsors: World (humans + the surface), ENS
 * (names + metadata for created apps/agents), Walrus (storage for manifests).
 */
export const APP = {
  name: "Forge",
  tagline: "Describe an app. An agent builds it. Only humans can run it.",
  // World ID 4.0 app (Developer Portal). Public — safe in the client bundle.
  worldAppId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "",
  worldAction: process.env.NEXT_PUBLIC_WORLD_ACTION ?? "verify-human",
  worldEnv: (process.env.NEXT_PUBLIC_WORLD_ENV ?? "production") as "production" | "staging",
  // ENS namespace for created apps + the design agent's identity.
  ensDomain: process.env.NEXT_PUBLIC_ENS_DOMAIN ?? "forge.eth",
  // `sepolia` = free testnet (default — no real ETH). `mainnet` costs gas + domain fees.
  ensChain: (process.env.NEXT_PUBLIC_ENS_CHAIN ?? "sepolia") as "mainnet" | "sepolia",
  // The design agent's own ENS name — its ENSIP-26 agent records are read live.
  agentEns: process.env.NEXT_PUBLIC_AGENT_ENS ?? process.env.NEXT_PUBLIC_ENS_DOMAIN ?? "forge.eth",
  // World Chain mainnet — where MiniKit pay / sendTransaction settle.
  worldChainId: 480,
} as const;

export const hasWorldApp = () => APP.worldAppId.startsWith("app_");
