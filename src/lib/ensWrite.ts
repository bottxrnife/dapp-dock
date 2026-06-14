/**
 * ENS write operations as UNSIGNED CALLDATA (the agent-native ens-cli pattern):
 * we compute `{ to, data, value }` from live inputs (resolver read from the
 * Universal Resolver) and hand it back for the caller to sign + broadcast with
 * any Ethereum wallet. Nothing here holds keys or hard-codes results.
 *
 * Used to give agents/Sparks a real on-chain identity:
 *  - ENSIP-26 agent records (`agent-context`, `agent-endpoint[<proto>]`)
 *  - ENSIP-5 text records, address records
 *  - subnames (a registry/fleet of agent names under a parent you own)
 */
import { encodeFunctionData, type Address } from "viem";
import { labelhash, namehash } from "viem/ens";
import { getResolver } from "./ens";
import { ENS_PUBLIC_RESOLVER, ENS_REGISTRY, ensChainId, ensChainName } from "./ensChain";

const PUBLIC_RESOLVER = ENS_PUBLIC_RESOLVER[ensChainName()];

const setTextAbi = [
  { name: "setText", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
] as const;
const setAddrAbi = [
  { name: "setAddr", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "a", type: "address" }], outputs: [] },
] as const;
const multicallAbi = [
  { name: "multicall", type: "function", stateMutability: "nonpayable", inputs: [{ name: "data", type: "bytes[]" }], outputs: [{ type: "bytes[]" }] },
] as const;
const setSubnodeRecordAbi = [
  { name: "setSubnodeRecord", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "label", type: "bytes32" }, { name: "owner", type: "address" }, { name: "resolver", type: "address" }, { name: "ttl", type: "uint64" }], outputs: [] },
] as const;

export type Calldata = { to: Address; data: `0x${string}`; value: "0x0"; summary: string; chainId: number };

async function resolverFor(name: string): Promise<Address> {
  return ((await getResolver(name)) as Address | null) ?? PUBLIC_RESOLVER;
}

/** ENSIP-5: set a single text record. */
export async function setTextCalldata(name: string, key: string, value: string): Promise<Calldata> {
  const to = await resolverFor(name);
  const data = encodeFunctionData({ abi: setTextAbi, functionName: "setText", args: [namehash(name), key, value] });
  return { to, data, value: "0x0", summary: `Set "${key}" on ${name}`, chainId: ensChainId() };
}

/** Set an address record. */
export async function setAddrCalldata(name: string, address: string): Promise<Calldata> {
  const to = await resolverFor(name);
  const data = encodeFunctionData({ abi: setAddrAbi, functionName: "setAddr", args: [namehash(name), address as Address] });
  return { to, data, value: "0x0", summary: `Set address on ${name}`, chainId: ensChainId() };
}

/** ENSIP-26: set multiple agent records in one multicall (agent-context + endpoints + registration). */
export async function setAgentRecordsCalldata(
  name: string,
  records: Array<{ key: string; value: string }>,
): Promise<Calldata> {
  const to = await resolverFor(name);
  const node = namehash(name);
  const calls = records
    .filter((r) => r.key && r.value)
    .map((r) => encodeFunctionData({ abi: setTextAbi, functionName: "setText", args: [node, r.key, r.value] }));
  const data =
    calls.length === 1
      ? calls[0]
      : encodeFunctionData({ abi: multicallAbi, functionName: "multicall", args: [calls] });
  return { to, data, value: "0x0", summary: `Set ${calls.length} agent record${calls.length === 1 ? "" : "s"} on ${name}`, chainId: ensChainId() };
}

/** Build the ENSIP-26 record list for naming an agent (skips empty fields). */
export function agentRecordList(opts: {
  context?: string;
  mcp?: string;
  a2a?: string;
  web?: string;
  registrationKey?: string; // ENSIP-25 full key
}): Array<{ key: string; value: string }> {
  const recs: Array<{ key: string; value: string }> = [];
  if (opts.context) recs.push({ key: "agent-context", value: opts.context });
  if (opts.mcp) recs.push({ key: "agent-endpoint[mcp]", value: opts.mcp });
  if (opts.a2a) recs.push({ key: "agent-endpoint[a2a]", value: opts.a2a });
  if (opts.web) recs.push({ key: "agent-endpoint[web]", value: opts.web });
  if (opts.registrationKey) recs.push({ key: opts.registrationKey, value: "1" });
  return recs;
}

/** Create a subname under a parent you own (registry.setSubnodeRecord). */
export async function setSubnameCalldata(
  parent: string,
  label: string,
  owner: string,
  resolver?: string,
): Promise<Calldata> {
  const res = (resolver as Address | undefined) ?? (await resolverFor(parent));
  const data = encodeFunctionData({
    abi: setSubnodeRecordAbi,
    functionName: "setSubnodeRecord",
    args: [namehash(parent), labelhash(label), owner as Address, res, BigInt(0)],
  });
  return { to: ENS_REGISTRY as Address, data, value: "0x0", summary: `Create ${label}.${parent}`, chainId: ensChainId() };
}
