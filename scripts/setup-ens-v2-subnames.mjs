#!/usr/bin/env node
/**
 * One-time ENS v2 (Sepolia) setup so Forge can mint subnames under forgedapp.eth:
 *   1. Deploy a UserRegistry proxy (the subregistry) via VerifiableFactory
 *   2. Assign it to forgedapp.eth (ETH_REGISTRY.setSubregistry)
 *   3. Deploy a shared PermissionedResolver proxy (holds ENSIP-26 records)
 *   4. Mint a test subname (hello.forgedapp.eth) + set an agent-context record
 *   5. Verify by reading the record back
 * Saves addresses to scripts/.ensv2-forgedapp.json for the app to consume.
 *
 * Discovered v2 Sepolia addresses (see AGENTS.md):
 *   ETH_REGISTRY      0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67
 *   VerifiableFactory 0xd2a632d8a8b67c2c4398c255cbd7af8dd7236198
 *   UserRegistryImpl  0x0F99e7Ea74903AfCB7224d0354fD7428A6f92917
 *   ResolverImpl      0xE566a1FBaf30Ff7C39828fe99f955fC55544cb9c
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseEventLogs, namehash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
function loadEnv() {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const PARENT = process.argv[2] || "forgedapp.eth";
const ETH_REGISTRY = "0xDEDB92913A25abE1f7BCDD85D8A344a43B398B67";
const FACTORY = "0xd2a632d8a8b67c2c4398c255cbd7af8dd7236198";
const USER_REGISTRY_IMPL = "0x0F99e7Ea74903AfCB7224d0354fD7428A6f92917";
const RESOLVER_IMPL = "0xE566a1FBaf30Ff7C39828fe99f955fC55544cb9c";
const ROLES_ALL = BigInt("0x1111111111111111111111111111111111111111111111111111111111111111");
const cfgFile = resolve(__dirname, ".ensv2-forgedapp.json");

const factoryAbi = [
  { name: "deployProxy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "implementation", type: "address" }, { name: "salt", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [{ type: "address" }] },
  { name: "ProxyDeployed", type: "event", inputs: [{ name: "sender", type: "address", indexed: true }, { name: "proxyAddress", type: "address", indexed: true }, { name: "salt", type: "uint256" }, { name: "implementation", type: "address" }] },
];
const initAbi = [{ name: "initialize", type: "function", stateMutability: "nonpayable", inputs: [{ name: "rootAccount", type: "address" }, { name: "roleBitmap", type: "uint256" }], outputs: [] }];
const registryAbi = [
  { name: "register", type: "function", stateMutability: "nonpayable", inputs: [{ name: "label", type: "string" }, { name: "owner", type: "address" }, { name: "registry", type: "address" }, { name: "resolver", type: "address" }, { name: "roleBitmap", type: "uint256" }, { name: "expiry", type: "uint64" }], outputs: [{ type: "uint256" }] },
  { name: "setSubregistry", type: "function", stateMutability: "nonpayable", inputs: [{ name: "anyId", type: "uint256" }, { name: "registry", type: "address" }], outputs: [] },
  { name: "getSubregistry", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
  { name: "getResolver", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
  { name: "findTokenId", type: "function", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "uint256" }] },
  { name: "getExpiry", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint64" }] },
  { name: "ownerOf", type: "function", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "address" }] },
];
const resolverAbi = [
  { name: "setText", type: "function", stateMutability: "nonpayable", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }, { name: "value", type: "string" }], outputs: [] },
  { name: "text", type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ type: "string" }] },
];

const key = (process.env.ENS_REGISTRAR_PRIVATE_KEY || process.env.WORLD_SIGNER_PRIVATE_KEY).trim();
const account = privateKeyToAccount(key);
const transport = http(process.env.ETH_RPC_URL || "https://sepolia.drpc.org");
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ account, chain: sepolia, transport });

const parentLabel = PARENT.split(".")[0];
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, "utf8")) : { parent: PARENT };

const FEES = { maxFeePerGas: 26000000000n, maxPriorityFeePerGas: 1000000n }; // ~26 gwei cap, tiny tip

async function deployProxy(impl, tag) {
  const salt = BigInt("0x" + Buffer.from(`${tag}:${PARENT}:v1`).toString("hex").padStart(2, "0").slice(0, 62));
  const data = encodeFunctionData({ abi: initAbi, functionName: "initialize", args: [account.address, ROLES_ALL] });
  const hash = await wallet.writeContract({ account, address: FACTORY, abi: factoryAbi, functionName: "deployProxy", args: [impl, salt, data], chain: sepolia, gas: 700000n, ...FEES });
  const rc = await pub.waitForTransactionReceipt({ hash });
  const [log] = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs: rc.logs });
  return log.args.proxyAddress;
}

async function main() {
  console.log("Wallet:", account.address, "| parent:", PARENT);

  // 1) Subregistry (UserRegistry proxy)
  if (!cfg.subregistry) {
    console.log("Deploying UserRegistry subregistry…");
    cfg.subregistry = await deployProxy(USER_REGISTRY_IMPL, "subreg");
    writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  }
  console.log("subregistry:", cfg.subregistry);

  // 2) Assign subregistry to the parent (if not already)
  const currentSub = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getSubregistry", args: [parentLabel] });
  if (currentSub.toLowerCase() !== cfg.subregistry.toLowerCase()) {
    console.log("Assigning subregistry to parent…");
    const tokenId = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "findTokenId", args: [parentLabel] });
    const h = await wallet.writeContract({ account, address: ETH_REGISTRY, abi: registryAbi, functionName: "setSubregistry", args: [tokenId, cfg.subregistry], chain: sepolia, gas: 120000n, ...FEES });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  console.log("parent.getSubregistry:", await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getSubregistry", args: [parentLabel] }));

  // 3) Shared resolver proxy
  if (!cfg.resolver) {
    console.log("Deploying shared resolver…");
    cfg.resolver = await deployProxy(RESOLVER_IMPL, "resolver");
    writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  }
  console.log("resolver:", cfg.resolver);

  // 4) Mint test subname hello.<parent>
  const testLabel = "hello";
  const sub = createPublicClient({ chain: sepolia, transport });
  const existing = await sub.readContract({ address: cfg.subregistry, abi: registryAbi, functionName: "getResolver", args: [testLabel] }).catch(() => "0x0000000000000000000000000000000000000000");
  const parentTokenId = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "findTokenId", args: [parentLabel] });
  const parentExpiry = await pub.readContract({ address: ETH_REGISTRY, abi: registryAbi, functionName: "getExpiry", args: [parentTokenId] });
  if (existing === "0x0000000000000000000000000000000000000000") {
    console.log("Minting test subname hello." + PARENT + " …");
    const h = await wallet.writeContract({ account, address: cfg.subregistry, abi: registryAbi, functionName: "register", args: [testLabel, account.address, "0x0000000000000000000000000000000000000000", cfg.resolver, BigInt(0), parentExpiry], chain: sepolia, gas: 400000n, ...FEES });
    await pub.waitForTransactionReceipt({ hash: h });
  }

  // 5) Set + read back an agent-context record
  const node = namehash(`${testLabel}.${PARENT}`);
  console.log("Setting agent-context on", `${testLabel}.${PARENT}`, "node", node);
  const set = await wallet.writeContract({ account, address: cfg.resolver, abi: resolverAbi, functionName: "setText", args: [node, "agent-context", `{"forge":"spark","name":"Hello Forge"}`], chain: sepolia, gas: 150000n, ...FEES });
  await pub.waitForTransactionReceipt({ hash: set });
  const readBack = await pub.readContract({ address: cfg.resolver, abi: resolverAbi, functionName: "text", args: [node, "agent-context"] });
  console.log("READBACK agent-context:", readBack);

  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  console.log("\nSUCCESS — v2 subname pipeline works. Config saved to", cfgFile);
  console.log(JSON.stringify(cfg, null, 2));
}

main().catch((e) => { console.error("FAIL:", e.shortMessage || e.message || e); if (e.cause?.shortMessage) console.error("cause:", e.cause.shortMessage); process.exit(1); });
