/**
 * Auto-provision ENS subnames when a Spark is published.
 * With ENS_REGISTRAR_PRIVATE_KEY set (and the parent domain owned on the chosen
 * chain), Forge mints label.parent + Walrus pointer records — no user wallet or ETH.
 * Default chain is Sepolia (free faucet gas).
 */
import { createPublicClient, createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { DappManifest } from "./types";
import {
  ensChainId,
  ensChainLabel,
  ensChainName,
  ensRpcUrl,
  ensViemChain,
  hasEnsRegistrar,
  isEnsV2,
  parseEnsName,
} from "./ensChain";
import { resolveAddress } from "./ens";
import { setAgentRecordsCalldata, setSubnameCalldata } from "./ensWrite";
import { provisionSparkSubnameV2 } from "./ensV2";

export type EnsProvisionResult = {
  chain: "mainnet" | "sepolia";
  chainLabel: string;
  mode: "on-chain" | "catalog-only";
  ensName: string;
  txHashes?: string[];
  message: string;
};

async function broadcastCalldata(calldata: { to: Address; data: `0x${string}`; value: "0x0" }): Promise<Hash> {
  const key = process.env.ENS_REGISTRAR_PRIVATE_KEY!.trim() as `0x${string}`;
  const account = privateKeyToAccount(key);
  const chain = ensViemChain();
  const transport = http(ensRpcUrl());
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });
  const hash = await wallet.sendTransaction({
    account,
    to: calldata.to,
    data: calldata.data,
    value: BigInt(0),
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

function sparkAgentContext(manifest: DappManifest, blobId: string, walrusUrl?: string | null): string {
  return JSON.stringify({
    forge: "spark",
    name: manifest.name,
    category: manifest.category,
    description: manifest.description?.slice(0, 200),
    manifestBlobId: blobId,
    manifestUrl: walrusUrl ?? undefined,
    version: manifest.version ?? "1",
  });
}

/** Mint subname (if needed) + set ENSIP-26-style records pointing at the Walrus manifest. */
export async function provisionSparkEns(
  manifest: DappManifest,
  blobId: string,
  walrusUrl: string | null,
): Promise<EnsProvisionResult> {
  const chain = ensChainName();
  const chainLabel = ensChainLabel();
  const ensName = manifest.ensName;
  const base = { chain, chainLabel, ensName };

  // Sepolia = ENS v2: mint the subname in the parent's subregistry + set agent records.
  if (isEnsV2()) {
    const { label } = parseEnsName(ensName);
    const r = await provisionSparkSubnameV2(label, sparkAgentContext(manifest, blobId, walrusUrl));
    return {
      ...base,
      mode: r.mode === "on-chain" ? "on-chain" : "catalog-only",
      txHashes: r.txHashes,
      message: r.message,
    };
  }

  if (!hasEnsRegistrar()) {
    return {
      ...base,
      mode: "catalog-only",
      message:
        chain === "sepolia"
          ? "Name reserved in Forge catalog. Set ENS_REGISTRAR_PRIVATE_KEY (Sepolia, owns the parent domain) to auto-mint on-chain for free."
          : "Name reserved in Forge catalog. Mainnet ENS writes cost ETH — switch NEXT_PUBLIC_ENS_CHAIN=sepolia for free testnet names.",
    };
  }

  const { label, parent } = parseEnsName(ensName);
  const account = privateKeyToAccount(process.env.ENS_REGISTRAR_PRIVATE_KEY!.trim() as `0x${string}`);
  const owner = account.address;
  const txHashes: string[] = [];

  try {
    const existing = await resolveAddress(ensName);
    if (!existing) {
      const sub = await setSubnameCalldata(parent, label, owner);
      txHashes.push(await broadcastCalldata(sub));
    }

    const records = [
      { key: "agent-context", value: sparkAgentContext(manifest, blobId) },
      { key: "description", value: manifest.description.slice(0, 500) },
      ...(walrusUrl ? [{ key: "url", value: walrusUrl }] : []),
      { key: "forge.manifest", value: blobId },
    ];
    const rec = await setAgentRecordsCalldata(ensName, records);
    txHashes.push(await broadcastCalldata(rec));

    return {
      ...base,
      mode: "on-chain",
      txHashes,
      message: `ENS subname ${ensName} minted on ${chainLabel}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...base,
      mode: "catalog-only",
      message: `Catalog updated; ENS mint failed (${msg}). Check ENS_REGISTRAR_PRIVATE_KEY owns ${parent} on ${chainLabel}.`,
    };
  }
}

/** Human-readable cost note for the publish UI. */
export function ensCostNote(): string {
  if (ensChainName() === "sepolia") {
    return hasEnsRegistrar()
      ? "ENS names auto-mint on Sepolia testnet — free, no ETH from you."
      : "Sepolia testnet (free). Add ENS_REGISTRAR_PRIVATE_KEY to auto-mint subnames.";
  }
  return "Mainnet ENS costs real ETH for gas. Use NEXT_PUBLIC_ENS_CHAIN=sepolia for free testnet names.";
}

export function ensExplorerTxUrl(hash: string): string {
  const base = ensChainId() === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  return `${base}/tx/${hash}`;
}
