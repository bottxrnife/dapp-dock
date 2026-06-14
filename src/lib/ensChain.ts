/**
 * Shared ENS chain config — Sepolia by default so hackathon/dev usage is free.
 * Reads are always free (RPC only). Writes need gas; Sepolia ETH comes from faucets.
 */
import type { Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { APP } from "./config";

export type EnsChainName = "mainnet" | "sepolia";

export const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

/** Public Resolver 2 fallbacks when the parent resolver cannot be read live. */
export const ENS_PUBLIC_RESOLVER: Record<EnsChainName, `0x${string}`> = {
  mainnet: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  sepolia: "0xE99638b40E6276797920350E8328498949777eE2",
};

export function ensChainName(): EnsChainName {
  return APP.ensChain === "mainnet" ? "mainnet" : "sepolia";
}

export function ensViemChain(): Chain {
  return ensChainName() === "mainnet" ? mainnet : sepolia;
}

export function ensChainId(): number {
  return ensViemChain().id;
}

export function ensRpcUrl(): string {
  if (process.env.ETH_RPC_URL) return process.env.ETH_RPC_URL;
  // drpc handles CCIP-Read / v2 resolution reliably; publicnode was flaky for v2 calls.
  return ensChainName() === "mainnet" ? "https://ethereum-rpc.publicnode.com" : "https://sepolia.drpc.org";
}

export function ensChainLabel(): string {
  return ensChainName() === "mainnet" ? "Ethereum mainnet" : "Sepolia testnet (ENS v2)";
}

/** Sepolia ENS is now ENSv2 (PermissionedRegistry + subregistries). Mainnet stays classic v1. */
export function isEnsV2(): boolean {
  return ensChainName() === "sepolia";
}

/** ENS v2 (Sepolia) contract addresses — discovered on-chain (see AGENTS.md ENS notes). */
export const ENS_V2 = {
  ethRegistry: "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67",
  registrar: "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA",
  factory: "0xd2a632d8a8b67c2c4398c255cbd7af8dd7236198",
  userRegistryImpl: "0x0F99e7Ea74903AfCB7224d0354fD7428A6f92917",
  resolverImpl: "0xE566a1FBaf30Ff7C39828fe99f955fC55544cb9c",
  usdc: "0x3DfC8b53dAFa5eBbb071a8B97678Ab534Ed838D9",
} as const;

/** The deployed subregistry + shared resolver for the Forge parent (from setup script). */
export function ensV2ParentConfig(): { subregistry?: `0x${string}`; resolver?: `0x${string}` } {
  return {
    subregistry: (process.env.ENS_V2_SUBREGISTRY?.trim() || undefined) as `0x${string}` | undefined,
    resolver: (process.env.ENS_V2_RESOLVER?.trim() || undefined) as `0x${string}` | undefined,
  };
}

/** Whether the server can auto-mint subnames (registrar key + parent ownership on this chain). */
export function hasEnsRegistrar(): boolean {
  const key = process.env.ENS_REGISTRAR_PRIVATE_KEY?.trim();
  return !!key && /^0x[0-9a-fA-F]{64}$/.test(key);
}

export function parseEnsName(ensName: string): { label: string; parent: string } {
  const dot = ensName.indexOf(".");
  if (dot <= 0) return { label: ensName, parent: APP.ensDomain };
  return { label: ensName.slice(0, dot), parent: ensName.slice(dot + 1) };
}
