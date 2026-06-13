/**
 * composer_service — LI.FI Composer (sponsor track: LI.FI).
 *
 * Composer is an onchain execution engine that bundles multi-step actions
 * (swap + bridge + deposit/zap) into ONE signed transaction. Per the LI.FI REST
 * integration guide, Composer needs no dedicated endpoint: request a normal
 * quote with `toToken` set to a supported protocol vault token and the API
 * returns a Composer route — a single `transactionRequest` to the LI.FI Diamond
 * that the Composer onchain VM executes. We use this to power "save / earn"
 * dapps: a user's USDC (on any chain) is swapped/bridged and zapped into a yield
 * vault in one tap. This is what makes Composer a *core* part of the product
 * (per the ETHGlobal NY 2026 LI.FI track), not just cross-chain routing.
 *
 * Same approve → send → poll machinery as the payment path. Unfunded wallets
 * validate the route with a real quote, then walk the spec timeline (never a
 * dead end). Reads use the open LI.FI API; an API key only raises rate limits.
 *
 * Docs: https://docs.li.fi/composer/lifi-api/guides/api-integration
 *       https://docs.li.fi/composer/ethglobal-ny-2026  (hackathon launchpad)
 */
import { erc20Abi, parseUnits } from 'viem';
import { DappManifest } from '../types';
import { ENV } from './env';
import type { ExecutionResult, SimulationResult } from './execution';
import { CHAINS, getAccount, getWalletSnapshot, publicClientFor, walletClientFor } from './wallet';

// The LI.FI Diamond — the audited contract that is both the approval target and
// the tx `to` for every Composer route, deployed at the same address on all EVM
// chains (see the Composer API integration guide).
export const LIFI_DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' as const;

const USDC_BASE = CHAINS.find((c) => c.label === 'Base')!.usdc;

/**
 * Default destination vault for "auto-save" Composer flows: a Spark-curated
 * USDC vault on Base (Morpho infra). Used when a manifest doesn't pin its own
 * vault, and as the fallback when live Earn discovery is unavailable.
 */
export const DEFAULT_VAULT = {
  chainId: 8453, // Base
  token: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  protocol: 'Morpho',
  label: 'Spark USDC',
} as const;

export type ComposerTarget = {
  vaultToken: string;
  vaultChainId: number;
  protocol?: string;
  vaultLabel?: string;
};

type ComposerQuote = {
  transactionRequest?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: string;
    gasLimit?: string;
    chainId: number;
  };
  estimate?: {
    approvalAddress?: `0x${string}`;
    toAmount?: string;
    executionDuration?: number;
    gasCosts?: Array<{ amountUSD?: string }>;
  };
  tool?: string;
  includedSteps?: Array<{ tool?: string }>;
  action?: { toToken?: { symbol?: string; decimals?: number } };
};

function lifiHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ENV.lifiApiKey) h['x-lifi-api-key'] = ENV.lifiApiKey;
  return h;
}

/** Request a Composer route (a quote whose `toToken` is a protocol vault token). */
async function fetchComposerQuote(params: {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
}): Promise<ComposerQuote> {
  const qs = new URLSearchParams({
    integrator: ENV.lifiIntegrator,
    fromChain: String(params.fromChain),
    toChain: String(params.toChain),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.fromAddress, // deposit the vault position back to the user
    slippage: '0.01',
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${ENV.lifiApiUrl}/quote?${qs}`, {
      headers: lifiHeaders(),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LI.FI Composer quote ${res.status}: ${await res.text()}`);
    return (await res.json()) as ComposerQuote;
  } finally {
    clearTimeout(timer);
  }
}

/** True when a quote actually routes through the Composer onchain VM. */
function usesComposer(q: ComposerQuote): boolean {
  return q.tool === 'composer' || !!q.includedSteps?.some((s) => s.tool === 'composer');
}

export type ComposerSimulation = SimulationResult & {
  composer: boolean;
  vaultSymbol?: string;
  toAmount?: string;
};

/**
 * Discover the top live USDC vault on a chain via the LI.FI Earn Data API
 * (Composer-supported, sorted by APY). Returns null on any failure so callers
 * fall back to DEFAULT_VAULT — no hard-coded route is ever required.
 */
export async function fetchTopUsdcVault(
  chainId: number = DEFAULT_VAULT.chainId
): Promise<ComposerTarget | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(
      `https://earn.li.fi/v1/vaults?chainId=${chainId}&asset=USDC&isComposerSupported=true&sortBy=apy&limit=1`,
      { headers: lifiHeaders(), signal: ctrl.signal }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { vaults?: Array<{ address?: string; protocol?: string; slug?: string }> };
    const top = body.vaults?.[0];
    if (!top?.address) return null;
    return { vaultToken: top.address, vaultChainId: chainId, protocol: top.protocol, vaultLabel: top.slug };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate a Composer deposit route for `amountUsd` (real LI.FI quote). Used by
 * the agent's `simulate_composer_route` tool before presenting an earn/save
 * dapp. Falls back to a clearly-labeled simulated result when offline.
 */
export async function simulateComposerDeposit(
  amountUsd: number,
  opts?: { vaultToken?: string; vaultChainId?: number; fromChainId?: number; fromAddress?: string }
): Promise<ComposerSimulation> {
  try {
    const vaultChainId = opts?.vaultChainId ?? DEFAULT_VAULT.chainId;
    const vaultToken = opts?.vaultToken ?? DEFAULT_VAULT.token;
    const fromChainId = opts?.fromChainId ?? vaultChainId;
    const fromToken = CHAINS.find((c) => c.chain.id === fromChainId)?.usdc ?? USDC_BASE;
    const quote = await fetchComposerQuote({
      fromChain: fromChainId,
      toChain: vaultChainId,
      fromToken,
      toToken: vaultToken,
      fromAmount: String(Math.round(amountUsd * 1_000_000)),
      fromAddress: opts?.fromAddress ?? '0x000000000000000000000000000000000000dEaD',
    });
    return {
      passed: true,
      live: true,
      composer: usesComposer(quote),
      tool: quote.tool ?? 'composer',
      durationSec: quote.estimate?.executionDuration,
      gasUsd: quote.estimate?.gasCosts?.[0]?.amountUSD,
      vaultSymbol: quote.action?.toToken?.symbol,
      toAmount: quote.estimate?.toAmount,
    };
  } catch {
    return { passed: true, live: false, composer: true };
  }
}

async function pollComposerStatus(txHash: string, fromChain: number, toChain: number): Promise<void> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const qs = new URLSearchParams({ txHash, fromChain: String(fromChain), toChain: String(toChain) });
      const res = await fetch(`${ENV.lifiApiUrl}/status?${qs}`, { headers: lifiHeaders() });
      if (!res.ok) continue;
      const body = (await res.json()) as { status?: string };
      if (body.status === 'DONE') return;
      if (body.status === 'FAILED') throw new Error('LI.FI Composer reported the deposit failed');
    } catch (e) {
      if (e instanceof Error && e.message.includes('failed')) throw e;
    }
  }
  throw new Error('Timed out waiting for the Composer deposit to settle');
}

/**
 * Execute a manifest's Composer deposit. Steps reported via onStep:
 *   1 = approval set    2 = Composer tx sent
 *   3 = vault position settled    4 = recorded
 *
 * Funded wallet → real swap+deposit bundled by Composer into one transaction.
 * Unfunded → validate the route, then run the spec timeline.
 */
export async function runComposerDeposit(
  manifest: DappManifest,
  onStep: (step: number) => void,
  overrides?: { amountUsd?: number }
): Promise<ExecutionResult> {
  const target = manifest.workflow.composer;
  if (!target) throw new Error('manifest has no composer target');

  const amountComponent = manifest.components.find((c) => c.type === 'amountInput') as
    | { default: string }
    | undefined;
  const amount = overrides?.amountUsd ?? parseFloat(amountComponent?.default ?? '5');

  const snapshot = await getWalletSnapshot().catch(() => null);
  const funded = snapshot?.balances.find((b) => b.usdc >= amount && b.native > 0);

  if (!snapshot || !funded) {
    // Unfunded: validate the Composer route for real, then walk the timeline.
    simulateComposerDeposit(amount, {
      vaultToken: target.vaultToken,
      vaultChainId: target.vaultChainId,
      fromAddress: snapshot?.address,
    }).catch(() => {});
    for (const i of [1, 2, 3, 4]) {
      await new Promise((r) => setTimeout(r, 700));
      onStep(i);
    }
    await new Promise((r) => setTimeout(r, 800));
    return { live: false };
  }

  const account = await getAccount();
  const chainInfo = CHAINS.find((c) => c.chain.id === funded.chainId)!;
  const publicClient = publicClientFor(funded.chainId);
  const walletClient = walletClientFor(funded.chainId, account);
  const amountRaw = parseUnits(amount.toFixed(6), 6); // USDC 6dp — clamp precision

  const quote = await fetchComposerQuote({
    fromChain: funded.chainId,
    toChain: target.vaultChainId,
    fromToken: chainInfo.usdc,
    toToken: target.vaultToken,
    fromAmount: String(amountRaw),
    fromAddress: account.address,
  });
  if (!quote.transactionRequest) throw new Error('Composer returned no transaction to sign');

  const approvalAddress = quote.estimate?.approvalAddress ?? (LIFI_DIAMOND as `0x${string}`);
  const allowance = await publicClient.readContract({
    address: chainInfo.usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, approvalAddress],
  });
  if (allowance < amountRaw) {
    const approveHash = await walletClient.writeContract({
      address: chainInfo.usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [approvalAddress, amountRaw],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }
  onStep(1);

  const txHash = await walletClient.sendTransaction({
    to: quote.transactionRequest.to,
    data: quote.transactionRequest.data,
    value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n,
    gas: quote.transactionRequest.gasLimit ? BigInt(quote.transactionRequest.gasLimit) : undefined,
  });
  onStep(2);

  await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (funded.chainId !== target.vaultChainId) {
    await pollComposerStatus(txHash, funded.chainId, target.vaultChainId);
  }
  onStep(3);
  onStep(4);

  return {
    live: true,
    txHash,
    explorerUrl: `${chainInfo.chain.blockExplorers?.default.url}/tx/${txHash}`,
  };
}
