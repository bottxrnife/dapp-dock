#!/usr/bin/env node
/**
 * Register a .eth name on Sepolia (classic ENS — works with Forge ensPublish.ts).
 * Two-phase commit-reveal with a small cache file so it resumes if interrupted.
 *
 * Usage: node scripts/register-sepolia-ens.mjs [label]
 * Registers with NO resolver (minimal, most reliable). We only need ownership of
 * the parent; Forge mints subnames + records under it afterward.
 */
import { createPublicClient, createWalletClient, http, toHex, zeroAddress, zeroHash } from "viem";
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

const CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";
const DURATION = BigInt(365 * 24 * 60 * 60);

const registrationType = {
  type: "tuple",
  components: [
    { name: "label", type: "string" },
    { name: "owner", type: "address" },
    { name: "duration", type: "uint256" },
    { name: "secret", type: "bytes32" },
    { name: "resolver", type: "address" },
    { name: "data", type: "bytes[]" },
    { name: "reverseRecord", type: "uint8" },
    { name: "referrer", type: "bytes32" },
  ],
};

const abi = [
  {
    name: "rentPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }, { name: "duration", type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ name: "base", type: "uint256" }, { name: "premium", type: "uint256" }] }],
  },
  { name: "makeCommitment", type: "function", stateMutability: "pure", inputs: [{ name: "registration", ...registrationType }], outputs: [{ type: "bytes32" }] },
  { name: "commitments", type: "function", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { name: "commit", type: "function", stateMutability: "nonpayable", inputs: [{ name: "commitment", type: "bytes32" }], outputs: [] },
  { name: "register", type: "function", stateMutability: "payable", inputs: [{ name: "registration", ...registrationType }], outputs: [] },
];

async function main() {
  const label = (process.argv[2] || "forgedapp").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const key = process.env.ENS_REGISTRAR_PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error("Set ENS_REGISTRAR_PRIVATE_KEY in .env first.");
    process.exit(1);
  }

  const account = privateKeyToAccount(key);
  const rpc = process.env.ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  const name = `${label}.eth`;
  const cacheFile = resolve(__dirname, `.commit-${label}.json`);

  const existing = await publicClient.getEnsAddress({ name }).catch(() => null);
  if (existing) {
    console.log(`DONE ${name} already registered -> ${existing}`);
    return;
  }

  const balance = await publicClient.getBalance({ address: account.address });
  console.log("Wallet:", account.address, "| balance:", Number(balance) / 1e18, "ETH");

  // Build (or restore) the registration. Secret MUST be identical across commit + register.
  let reg;
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    reg = { ...cached.reg, duration: BigInt(cached.reg.duration) };
    console.log("Restored cached commitment from earlier run.");
  } else {
    reg = {
      label,
      owner: account.address,
      duration: DURATION,
      secret: toHex(randomBytes(32)),
      resolver: zeroAddress,
      data: [],
      reverseRecord: 0,
      referrer: zeroHash,
    };
  }

  const commitment = await publicClient.readContract({ address: CONTROLLER, abi, functionName: "makeCommitment", args: [reg] });
  let committedAt = Number(await publicClient.readContract({ address: CONTROLLER, abi, functionName: "commitments", args: [commitment] }));

  if (committedAt === 0) {
    console.log("Committing…");
    const commitHash = await wallet.writeContract({ account, address: CONTROLLER, abi, functionName: "commit", args: [commitment], chain: sepolia });
    await publicClient.waitForTransactionReceipt({ hash: commitHash });
    writeFileSync(cacheFile, JSON.stringify({ reg: { ...reg, duration: reg.duration.toString() }, commitHash }, null, 2));
    console.log("Commit tx:", commitHash);
    committedAt = Number(await publicClient.readContract({ address: CONTROLLER, abi, functionName: "commitments", args: [commitment] }));
  } else {
    console.log("Existing valid commitment found on-chain.");
  }

  // Wait until minCommitmentAge (60s) has elapsed since the on-chain commit timestamp.
  const minAge = 60;
  while (true) {
    const block = await publicClient.getBlock();
    const age = Number(block.timestamp) - committedAt;
    if (age >= minAge + 5) break;
    const wait = minAge + 5 - age;
    console.log(`Commit age ${age}s — waiting ${wait}s more…`);
    await new Promise((r) => setTimeout(r, Math.min(wait, 15) * 1000));
  }

  const price = await publicClient.readContract({ address: CONTROLLER, abi, functionName: "rentPrice", args: [label, DURATION] });
  const value = (price.base + price.premium) * 12n / 10n; // 20% buffer; contract refunds excess

  console.log("Registering…");
  const sim = await publicClient.simulateContract({ address: CONTROLLER, abi, functionName: "register", args: [reg], value, account: account.address });
  const regHash = await wallet.writeContract({ ...sim.request, chain: sepolia });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: regHash });
  const resolved = await publicClient.getEnsAddress({ name });
  console.log(`SUCCESS ${name} registered (owner ${account.address})`);
  console.log("Resolves to:", resolved ?? "(no resolver set — ownership confirmed)");
  console.log("Tx: https://sepolia.etherscan.io/tx/" + receipt.transactionHash);
}

main().catch((e) => {
  console.error("FAIL:", e.shortMessage || e.message || e);
  if (e.cause?.shortMessage) console.error("cause:", e.cause.shortMessage);
  process.exit(1);
});
