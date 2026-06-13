/**
 * wallet_service — embedded, abstracted wallet (per BUILD_GUIDE: "users should
 * never configure networks").
 *
 * A burner key is generated on first launch and kept in the device keychain
 * via expo-secure-store. Balances are read live: USDC on Base / Arbitrum /
 * Optimism / Polygon plus native gas balances. The execution service uses the
 * same account to sign real LI.FI transactions when the wallet is funded.
 */
import * as SecureStore from 'expo-secure-store';
import {
  Chain,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  PublicClient,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey, PrivateKeyAccount } from 'viem/accounts';
import { arbitrum, base, optimism, polygon } from 'viem/chains';
import { resolveAddress } from './identity';

const KEY_NAME = 'dappdock.wallet.key';

export type ChainInfo = {
  chain: Chain;
  usdc: `0x${string}`;
  label: string;
};

export const CHAINS: ChainInfo[] = [
  { chain: base, usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', label: 'Base' },
  { chain: arbitrum, usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', label: 'Arbitrum' },
  { chain: optimism, usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', label: 'Optimism' },
  { chain: polygon, usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', label: 'Polygon' },
];

export function publicClientFor(chainId: number): PublicClient {
  const info = CHAINS.find((c) => c.chain.id === chainId) ?? CHAINS[0];
  return createPublicClient({ chain: info.chain, transport: http() }) as PublicClient;
}

let cachedAccount: PrivateKeyAccount | null = null;

async function loadPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_NAME);
}

async function savePrivateKey(pk: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_NAME, pk);
}

export async function getAccount(): Promise<PrivateKeyAccount> {
  if (cachedAccount) return cachedAccount;
  let pk = await loadPrivateKey();
  if (!pk) {
    pk = generatePrivateKey();
    await savePrivateKey(pk);
  }
  cachedAccount = privateKeyToAccount(pk as `0x${string}`);
  return cachedAccount;
}

export function walletClientFor(chainId: number, account: PrivateKeyAccount) {
  const info = CHAINS.find((c) => c.chain.id === chainId) ?? CHAINS[0];
  return createWalletClient({ chain: info.chain, transport: http(), account });
}

export type ChainBalance = {
  chainId: number;
  label: string;
  usdc: number;
  native: number;
};

export type WalletSnapshot = {
  address: `0x${string}`;
  totalUsdc: number;
  balances: ChainBalance[];
};

export type SendResult = { txHash: `0x${string}`; explorerUrl: string; chainLabel: string };

/**
 * Send USDC to an address or ENS name. Picks the chain explicitly given, else
 * the first chain holding enough USDC. Direct erc20 transfer (same-chain) —
 * for cross-chain delivery the LI.FI path in execution_service is used instead.
 */
export async function sendUsdc(opts: {
  to: string;
  amountUsd: number;
  chainId?: number;
}): Promise<SendResult> {
  const account = await getAccount();
  const recipient = opts.to.startsWith('0x')
    ? (opts.to as `0x${string}`)
    : await resolveAddress(opts.to);
  if (!recipient) throw new Error(`Could not resolve ${opts.to}`);

  const snapshot = await getWalletSnapshot();
  const chainId =
    opts.chainId ??
    snapshot.balances.find((b) => b.usdc >= opts.amountUsd && b.native > 0)?.chainId ??
    CHAINS[0].chain.id;
  const info = CHAINS.find((c) => c.chain.id === chainId) ?? CHAINS[0];

  const walletClient = walletClientFor(chainId, account);
  const publicClient = publicClientFor(chainId);
  // USDC has 6 decimals — clamp so free-text amounts like "1.2345678" don't make
  // viem throw "too many decimals".
  const amountRaw = parseUnits(opts.amountUsd.toFixed(6), 6);

  const txHash = await walletClient.writeContract({
    address: info.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipient as `0x${string}`, amountRaw],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return {
    txHash,
    chainLabel: info.label,
    explorerUrl: `${info.chain.blockExplorers?.default.url}/tx/${txHash}`,
  };
}

/** Reveal the burner private key for backup. Returns null if none exists. */
export async function exportPrivateKey(): Promise<string | null> {
  return loadPrivateKey();
}

export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const account = await getAccount();
  const balances = await Promise.all(
    CHAINS.map(async (info): Promise<ChainBalance> => {
      try {
        const client = createPublicClient({ chain: info.chain, transport: http() });
        const [usdcRaw, nativeRaw] = await Promise.all([
          client.readContract({
            address: info.usdc,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [account.address],
          }),
          client.getBalance({ address: account.address }),
        ]);
        return {
          chainId: info.chain.id,
          label: info.label,
          usdc: Number(formatUnits(usdcRaw, 6)),
          native: Number(formatUnits(nativeRaw, 18)),
        };
      } catch {
        return { chainId: info.chain.id, label: info.label, usdc: 0, native: 0 };
      }
    })
  );
  return {
    address: account.address,
    totalUsdc: balances.reduce((sum, b) => sum + b.usdc, 0),
    balances,
  };
}
