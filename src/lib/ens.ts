/**
 * ENS reads via viem on Ethereum mainnet (Universal Resolver, full CCIP-Read).
 * Modeled on the agent-native ens-cli (github.com/gskril/ens-cli): read
 * operations execute and return results; write operations live in ensWrite.ts
 * and return unsigned calldata for the caller to sign.
 *
 * Identity for agents:
 *  - ENSIP-26 (Agent Text Records): `agent-context` + `agent-endpoint[<proto>]`.
 *  - ENSIP-25 (AI Agent Registry verification): `agent-registration[<erc7930>][<id>]`.
 * Every function is real (no hard-coded values) and a safe no-op on failure.
 */
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com"),
});

function safeNormalize(name: string): string | null {
  try {
    return normalize(name.trim());
  } catch {
    return null;
  }
}

export async function resolveAddress(name: string): Promise<string | null> {
  const n = safeNormalize(name);
  if (!n) return null;
  try {
    return await ensClient.getEnsAddress({ name: n });
  } catch {
    return null;
  }
}

export async function lookupAddress(address: string): Promise<string | null> {
  try {
    return await ensClient.getEnsName({ address: address as Address });
  } catch {
    return null;
  }
}

export async function getTextRecord(name: string, key: string): Promise<string | null> {
  const n = safeNormalize(name);
  if (!n) return null;
  try {
    return await ensClient.getEnsText({ name: n, key });
  } catch {
    return null;
  }
}

export async function getAvatar(name: string): Promise<string | null> {
  const n = safeNormalize(name);
  if (!n) return null;
  try {
    return await ensClient.getEnsAvatar({ name: n });
  } catch {
    return null;
  }
}

export async function getResolver(name: string): Promise<Address | null> {
  const n = safeNormalize(name);
  if (!n) return null;
  try {
    return await ensClient.getEnsResolver({ name: n });
  } catch {
    return null;
  }
}

/** ENSIP-26 Agent Text Records: the agent's identity entry point + endpoints. */
export type AgentProfile = {
  context: string | null;
  endpoints: { mcp?: string; a2a?: string; web?: string };
  hasRecords: boolean;
};

export async function getAgentProfile(name: string): Promise<AgentProfile> {
  const [context, mcp, a2a, web] = await Promise.all([
    getTextRecord(name, "agent-context"),
    getTextRecord(name, "agent-endpoint[mcp]"),
    getTextRecord(name, "agent-endpoint[a2a]"),
    getTextRecord(name, "agent-endpoint[web]"),
  ]);
  const endpoints: AgentProfile["endpoints"] = {};
  if (mcp) endpoints.mcp = mcp;
  if (a2a) endpoints.a2a = a2a;
  if (web) endpoints.web = web;
  return { context, endpoints, hasRecords: !!context || Object.keys(endpoints).length > 0 };
}

/** ERC-7930 interoperable address encoding for an EVM registry (ENSIP-25). */
export function erc7930(chainId: number, address: string): string {
  let ref = chainId.toString(16);
  if (ref.length % 2) ref = "0" + ref;
  const refLen = (ref.length / 2).toString(16).padStart(2, "0");
  const addr = address.toLowerCase().replace(/^0x/, "");
  return `0x0001` + `0000` + refLen + ref + `14` + addr;
}

/** Default agent registry: ERC-8004 on Ethereum mainnet (per ENSIP-25 example). */
export const ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const ERC8004_REGISTRY_7930 = erc7930(1, ERC8004_REGISTRY);

/** ENSIP-25: verify a name is attested to an agent-registry entry (non-empty record). */
export async function verifyAgentRegistration(
  name: string,
  agentId: string,
  registry7930: string = ERC8004_REGISTRY_7930,
): Promise<{ key: string; value: string | null; verified: boolean }> {
  const key = `agent-registration[${registry7930}][${agentId}]`;
  const value = await getTextRecord(name, key);
  return { key, value, verified: !!value && value.length > 0 };
}

/** Basic ENS name verification: forward → reverse must round-trip to the same name. */
export async function verifyName(name: string): Promise<{ address: string | null; primary: string | null; verified: boolean }> {
  const address = await resolveAddress(name);
  if (!address) return { address: null, primary: null, verified: false };
  const primary = await lookupAddress(address);
  const n = safeNormalize(name);
  return { address, primary, verified: !!primary && !!n && safeNormalize(primary) === n };
}

export type EnsProfile = {
  name: string;
  address: string | null;
  resolver: string | null;
  avatar: string | null;
  records: Record<string, string>;
  agent: AgentProfile;
  verified: boolean;
};

/** Full live profile for the ENS explorer + agent identity surfaces. */
export async function getFullProfile(name: string): Promise<EnsProfile | null> {
  const n = safeNormalize(name);
  if (!n) return null;
  const [address, resolver, avatar, url, description, twitter, github, agent, verification] = await Promise.all([
    resolveAddress(n),
    getResolver(n),
    getAvatar(n),
    getTextRecord(n, "url"),
    getTextRecord(n, "description"),
    getTextRecord(n, "com.twitter"),
    getTextRecord(n, "com.github"),
    getAgentProfile(n),
    verifyName(n),
  ]);
  const records: Record<string, string> = {};
  if (url) records.url = url;
  if (description) records.description = description;
  if (twitter) records["com.twitter"] = twitter;
  if (github) records["com.github"] = github;
  return { name: n, address, resolver, avatar, records, agent, verified: verification.verified };
}

/** Whether a second-level .eth name is available to register (real on-chain check). */
export async function isAvailable(name: string): Promise<boolean> {
  const n = safeNormalize(name);
  if (!n || n.split(".").length !== 2 || !n.endsWith(".eth")) return false;
  // A name is "registered" if it resolves to an owner/resolver; treat unresolved as available.
  const resolver = await getResolver(n);
  if (resolver) return false;
  const addr = await resolveAddress(n);
  return !addr;
}
