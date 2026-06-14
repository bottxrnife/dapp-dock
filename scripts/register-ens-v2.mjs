#!/usr/bin/env node
/**
 * Register a .eth name on ENS v2 (Sepolia) — fully scripted.
 * Mints mock USDC (open faucet), approves the registrar, then commit-reveal registers.
 * Usage: node scripts/register-ens-v2.mjs [label]
 *
 * v2 Sepolia addresses (discovered on-chain; see AGENTS.md):
 *   ETH_REGISTRY  0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67  (PermissionedRegistry for .eth)
 *   ETHRegistrar  0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA  (commit-reveal register)
 *   mock USDC     0x3DfC8b53dAFa5eBbb071a8B97678Ab534Ed838D9  (6dp, open mint)
 */
import { createPublicClient, createWalletClient, http, toHex, zeroAddress, zeroHash, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomBytes } from "crypto";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const p = resolve(root, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const REGISTRAR = "0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA";
const REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
const USDC = "0x3DfC8b53dAFa5eBbb071a8B97678Ab534Ed838D9";
const DURATION = 31557600n; // 1 year (uint64)

const registrarAbi = [
  { name: "isAvailable", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "bool" }] },
  { name: "getRegisterPrice", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }, { name: "duration", type: "uint64" }, { name: "paymentToken", type: "address" }], outputs: [{ name: "base", type: "uint256" }, { name: "premium", type: "uint256" }] },
  { name: "MIN_COMMITMENT_AGE", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "commitmentAt", type: "function", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { name: "makeCommitment", type: "function", stateMutability: "pure", inputs: [{ name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "secret", type: "bytes32" }, { name: "subregistry", type: "address" }, { name: "resolver", type: "address" }, { name: "duration", type: "uint64" }, { name: "referrer", type: "bytes32" }], outputs: [{ type: "bytes32" }] },
  { name: "commit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },
  { name: "register", type: "function", stateMutability: "nonpayable", inputs: [{ name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "secret", type: "bytes32" }, { name: "subregistry", type: "address" }, { name: "resolver", type: "address" }, { name: "duration", type: "uint64" }, { name: "paymentToken", type: "address" }, { name: "referrer", type: "bytes32" }], outputs: [] },
  { name: "NameRegistered", type: "event", inputs: [{ name: "tokenId", type: "uint256", indexed: true }, { name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "subregistry", type: "address" }, { name: "resolver", type: "address" }, { name: "duration", type: "uint64" }, { name: "paymentToken", type: "address" }, { name: "referrer", type: "bytes32", indexed: true }, { name: "base", type: "uint256" }, { name: "premium", type: "uint256" }] },
];
const erc20Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "mint", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
];

async function main() {
  const label = (process.argv[2] || "forgedapp").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const key = process.env.ENS_REGISTRAR_PRIVATE_KEY?.trim() || process.env.WORLD_SIGNER_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Need ENS_REGISTRAR_PRIVATE_KEY (or WORLD_SIGNER_PRIVATE_KEY) in .env");
    process.exit(1);
  }
  const account = privateKeyToAccount(key);
  const transport = http(process.env.ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const pub = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const cacheFile = resolve(__dirname, `.v2-commit-${label}.json`);

  console.log("Wallet:", account.address);
  const ethBal = await pub.getBalance({ address: account.address });
  console.log("Sepolia ETH:", Number(ethBal) / 1e18);
  if (ethBal === 0n) { console.error("FAIL: no Sepolia ETH for gas"); process.exit(1); }

  const available = await pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "isAvailable", args: [label] });
  console.log(`isAvailable(${label}):`, available);
  if (!available) { console.log(`DONE: ${label}.eth not available (maybe already yours)`); return; }

  const [base, premium] = await pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "getRegisterPrice", args: [label, DURATION, USDC] });
  const price = base + premium;
  console.log("Price:", Number(price) / 1e6, "USDC");

  // 1) Ensure USDC balance (mint mock) + allowance
  let bal = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (bal < price) {
    const want = price * 3n; // buffer for renew/retry
    console.log("Minting mock USDC:", Number(want) / 1e6);
    const h = await wallet.writeContract({ account, address: USDC, abi: erc20Abi, functionName: "mint", args: [account.address, want], chain: sepolia });
    await pub.waitForTransactionReceipt({ hash: h });
    bal = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  }
  console.log("USDC balance:", Number(bal) / 1e6);
  const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [account.address, REGISTRAR] });
  if (allowance < price) {
    console.log("Approving registrar to spend USDC…");
    const h = await wallet.writeContract({ account, address: USDC, abi: erc20Abi, functionName: "approve", args: [REGISTRAR, price * 5n], chain: sepolia });
    await pub.waitForTransactionReceipt({ hash: h });
  }

  // 2) Commit (cache secret so we resume across the 60s wait)
  let secret;
  if (existsSync(cacheFile)) {
    secret = JSON.parse(readFileSync(cacheFile, "utf8")).secret;
    console.log("Restored cached commit secret.");
  } else {
    secret = toHex(randomBytes(32));
  }
  const commitment = await pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "makeCommitment", args: [label, account.address, secret, zeroAddress, zeroAddress, DURATION, zeroHash] });
  let committedAt = Number(await pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "commitmentAt", args: [commitment] }));
  if (committedAt === 0) {
    console.log("Committing…");
    const h = await wallet.writeContract({ account, address: REGISTRAR, abi: registrarAbi, functionName: "commit", args: [commitment], chain: sepolia });
    await pub.waitForTransactionReceipt({ hash: h });
    writeFileSync(cacheFile, JSON.stringify({ secret, label }));
    committedAt = Number(await pub.readContract({ address: REGISTRAR, abi: registrarAbi, functionName: "commitmentAt", args: [commitment] }));
  } else {
    console.log("Existing commitment found on-chain.");
  }

  // 3) Wait for MIN_COMMITMENT_AGE + buffer
  while (true) {
    const block = await pub.getBlock();
    const age = Number(block.timestamp) - committedAt;
    if (age >= 65) break;
    console.log(`Commit age ${age}s — waiting…`);
    await new Promise((r) => setTimeout(r, Math.min(65 - age, 15) * 1000));
  }

  // 4) Register
  console.log("Registering…");
  const sim = await pub.simulateContract({ address: REGISTRAR, abi: registrarAbi, functionName: "register", args: [label, account.address, secret, zeroAddress, zeroAddress, DURATION, USDC, zeroHash], account: account.address });
  const h = await wallet.writeContract({ ...sim.request, chain: sepolia });
  const receipt = await pub.waitForTransactionReceipt({ hash: h });

  let tokenId;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== REGISTRAR.toLowerCase()) continue;
    try { const d = decodeEventLog({ abi: registrarAbi, ...log }); if (d.eventName === "NameRegistered") tokenId = d.args.tokenId; } catch {}
  }
  console.log(`SUCCESS: ${label}.eth registered on ENS v2 (Sepolia)`);
  console.log("Owner:", account.address);
  if (tokenId !== undefined) console.log("tokenId:", tokenId.toString());
  console.log("Tx: https://sepolia.etherscan.io/tx/" + receipt.transactionHash);
}

main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message || e); if (e.cause?.shortMessage) console.error("cause:", e.cause.shortMessage); process.exit(1); });
