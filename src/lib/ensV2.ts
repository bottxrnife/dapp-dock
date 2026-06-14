/**
 * ENS v2 (Sepolia) subname minting for Forge.
 *
 * Sepolia migrated to ENSv2 (PermissionedRegistry + per-name subregistries), so
 * classic `setSubnodeRecord` does not apply. Instead each Spark subname is
 * registered in the parent's UserRegistry (the "subregistry") and its ENSIP-26
 * `agent-context` record is written to a shared PermissionedResolver. Reads use
 * the standard Universal Resolver (viem) — see lib/ens.ts.
 *
 * Setup (one-time, scripts/setup-ens-v2-subnames.mjs) produced:
 *   ENS_V2_SUBREGISTRY  — UserRegistry assigned to <parent> in the .eth registry
 *   ENS_V2_RESOLVER     — shared resolver holding subname records
 * Auto-mint requires ENS_REGISTRAR_PRIVATE_KEY (owner of <parent>).
 */
import { createPublicClient, createWalletClient, http, namehash, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { APP } from "./config";
import { ENS_V2, ensRpcUrl, ensV2ParentConfig, hasEnsRegistrar } from "./ensChain";

const FEES = { maxFeePerGas: BigInt("26000000000"), maxPriorityFeePerGas: BigInt(1000000) };

const registryAbi = [
  { name: "register", type: "function", stateMutability: "nonpayable", inputs: [{ name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "registry", type: "address" }, { name: "resolver", type: "address" }, { name: "roleBitmap", type: "uint256" }, { name: "expiry", type: "uint64" }], outputs: [{ type: "uint256" }] },
  { name: "getResolver", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
  { name: "findTokenId", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "uint256" }] },
  { name: "getExpiry", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint64" }] },
] as const;

const resolverAbi = [
  { name: "setText", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { name: "text", type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ type: "string" }] },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type EnsV2Result = {
  ok: boolean;
  ensName: string;
  mode: "on-chain" | "skipped" | "not-configured";
  txHashes: string[];
  message: string;
};

function clients() {
  const account = privateKeyToAccount(process.env.ENS_REGISTRAR_PRIVATE_KEY!.trim() as `0x${string}`);
  const transport = http(ensRpcUrl());
  return {
    account,
    pub: createPublicClient({ chain: sepolia, transport }),
    wallet: createWalletClient({ account, chain: sepolia, transport }),
  };
}

/** Mint `label.<parent>` on ENS v2 (if absent) and set its ENSIP-26 agent-context record. */
export async function provisionSparkSubnameV2(label: string, agentContext: string): Promise<EnsV2Result> {
  const parent = APP.ensDomain;
  const ensName = `${label}.${parent}`;
  const { subregistry, resolver } = ensV2ParentConfig();

  if (!hasEnsRegistrar() || !subregistry || !resolver) {
    return {
      ok: false,
      ensName,
      mode: "not-configured",
      txHashes: [],
      message:
        "ENS v2 auto-mint not configured. Run scripts/setup-ens-v2-subnames.mjs and set ENS_REGISTRAR_PRIVATE_KEY + ENS_V2_SUBREGISTRY + ENS_V2_RESOLVER.",
    };
  }

  const { account, pub, wallet } = clients();
  const parentLabel = parent.split(".")[0];
  const txHashes: string[] = [];

  try {
    const existing = (await pub.readContract({ address: subregistry, abi: registryAbi, functionName: "getResolver", args: [label] }).catch(() => ZERO)) as Address;

    if (existing === ZERO) {
      const parentTokenId = await pub.readContract({ address: ENS_V2.ethRegistry as Address, abi: registryAbi, functionName: "findTokenId", args: [parentLabel] });
      const parentExpiry = await pub.readContract({ address: ENS_V2.ethRegistry as Address, abi: registryAbi, functionName: "getExpiry", args: [parentTokenId] });
      const mint = await wallet.writeContract({ account, address: subregistry, abi: registryAbi, functionName: "register", args: [label, account.address, ZERO, resolver, BigInt(0), parentExpiry], chain: sepolia, gas: BigInt(300000), ...FEES });
      await pub.waitForTransactionReceipt({ hash: mint });
      txHashes.push(mint);
    }

    // Set the ENSIP-26 agent-context record. The v2 resolver's per-node auth read can
    // briefly lag right after registration, so write → read back → retry until it sticks.
    const node = namehash(ensName);
    let stuck = false;
    for (let attempt = 0; attempt < 3 && !stuck; attempt++) {
      const set = await wallet.writeContract({ account, address: resolver, abi: resolverAbi, functionName: "setText", args: [node, "agent-context", agentContext], chain: sepolia, gas: BigInt(160000), ...FEES });
      await pub.waitForTransactionReceipt({ hash: set });
      txHashes.push(set);
      const readBack = (await pub.readContract({ address: resolver, abi: resolverAbi, functionName: "text", args: [node, "agent-context"] }).catch(() => "")) as string;
      if (readBack === agentContext) stuck = true;
      else await new Promise((r) => setTimeout(r, 2500));
    }
    if (!stuck) {
      return { ok: false, ensName, mode: "skipped", txHashes, message: `Minted ${ensName} but agent-context record did not persist after retries.` };
    }

    return {
      ok: true,
      ensName,
      mode: "on-chain",
      txHashes,
      message: txHashes.length > 1 ? `Minted ${ensName} on ENS v2 (Sepolia) with agent records.` : `Updated ${ensName} agent records on ENS v2.`,
    };
  } catch (e) {
    return {
      ok: false,
      ensName,
      mode: "skipped",
      txHashes,
      message: `ENS v2 mint failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function ensV2TxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}
