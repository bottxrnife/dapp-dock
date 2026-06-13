/**
 * assistant_service — the in-app design agent.
 *
 * A real LLM agent (Anthropic Messages API) with a toolbelt covering all three
 * integrations. Each turn runs a tool-use loop: the model can inspect the
 * wallet, browse the store, check ENS subname availability, resolve names,
 * simulate LI.FI routes, and draft a dapp manifest. Drafted manifests pass
 * schema validation (manifest_service) before they reach the UI; spending and
 * publishing are deliberately NOT in the toolbelt — humans confirm those.
 */
import { generateManifest } from './assistant';
import { simulateComposerDeposit } from './composer';
import { ENV } from './env';
import { simulateFlow } from './execution';
import { resolveAddress } from './identity';
import { validateManifest } from './manifest';
import { getWalletSnapshot } from './wallet';
import { useApp } from '../state/store';
import { DappManifest } from '../types';

export const hasDirectAnthropicKey = () =>
  (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '').length > 0;
export const hasAgentCreds = () => hasDirectAnthropicKey() || ENV.anthropicProxyUrl.length > 0;
const MODEL = process.env.EXPO_PUBLIC_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

function anthropicMessagesUrl(): string {
  if (hasDirectAnthropicKey()) return 'https://api.anthropic.com/v1/messages';
  const base = ENV.anthropicProxyUrl.replace(/\/$/, '');
  return base.endsWith('/v1/messages') ? base : `${base}/v1/messages`;
}

function anthropicApiKey(): string {
  if (hasDirectAnthropicKey()) return process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
  return ENV.anthropicProxyKey;
}

// ---------------------------------------------------------------------------
// Anthropic message types (minimal)
// ---------------------------------------------------------------------------
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type ApiMessage = { role: 'user' | 'assistant'; content: ContentBlock[] | string };

export type AgentHooks = {
  onText: (text: string) => void;
  onActivity: (label: string) => void;
  onDraft: (manifest: DappManifest) => void;
};

// ---------------------------------------------------------------------------
// Skills / toolbelt
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'get_wallet_overview',
    description:
      "Read the user's embedded wallet: address plus live USDC and gas balances on Base, Arbitrum, Optimism and Polygon.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_store_dapps',
    description: 'List the dapps currently published in the DappDock store (name, ENS, category, one-liner).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'resolve_ens_name',
    description: 'Resolve an ENS name to an Ethereum address on mainnet. Use to validate recipients/treasuries.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'e.g. team.eth' } },
      required: ['name'],
    },
  },
  {
    name: 'check_ens_subname',
    description: `Check whether a subname label is available under ${ENV.ensDomain} for a new dapp identity.`,
    input_schema: {
      type: 'object',
      properties: { label: { type: 'string', description: 'lowercase label, e.g. "hackdues"' } },
      required: ['label'],
    },
  },
  {
    name: 'simulate_lifi_route',
    description:
      'Simulate a cross-chain USDC payment route with LI.FI (Arbitrum → Base) for a USD amount. Returns the routing tool, estimated duration and gas. Always run this before presenting a payment dapp.',
    input_schema: {
      type: 'object',
      properties: { amountUsd: { type: 'number' } },
      required: ['amountUsd'],
    },
  },
  {
    name: 'simulate_composer_route',
    description:
      'Simulate a LI.FI Composer deposit: swap + deposit a USD amount of USDC into a yield vault in ONE composed transaction. Returns whether the route is Composer-backed, the destination vault token/symbol, and estimated output. Run this before presenting any save / earn / yield dapp (one that uses workflow.composer).',
    input_schema: {
      type: 'object',
      properties: { amountUsd: { type: 'number' } },
      required: ['amountUsd'],
    },
  },
  {
    name: 'draft_dapp_manifest',
    description:
      'Create or replace the dapp draft the user will preview, test and publish. The input is validated against the DappDock manifest schema; on success the generated-dapp card appears in the chat. Call this once your design is settled (and re-call it to apply edits).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name, e.g. "Hackathon Team Dues"' },
        ensLabel: { type: 'string', description: `Subname label under ${ENV.ensDomain}` },
        description: { type: 'string' },
        category: { type: 'string', enum: ['Finance', 'Community', 'Agents', 'Events', 'Tools'] },
        secondaryCategory: { type: 'string' },
        outcome: { type: 'string', description: 'Plain English, starts with "You will …"' },
        components: {
          type: 'array',
          description:
            'UI components. Types: amountInput {token, default, locked}, sourceChain {value:"any"}, recipient {value: ens-or-address}, memoInput {default}, punchCard {total, reward, pointsPerDollar} for loyalty/rewards dapps, menu {currency, items:[{id,name,priceUsd,desc?,tag?}]} for in-app ordering, submitButton {label}. Must include a submitButton.',
          items: { type: 'object' },
        },
        permissions: {
          type: 'object',
          properties: {
            plainEnglish: { type: 'array', items: { type: 'string' }, description: '1–5 plain-English permission lines, no addresses' },
            spendingCap: { type: 'string', description: 'e.g. "5 USDC" or "$0.00"' },
            requiresWorldId: { type: 'boolean' },
            worldPolicy: { type: 'string', description: 'e.g. "one-payment-per-human"' },
          },
          required: ['plainEnglish'],
        },
        workflow: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              description: '2–6 steps, each {label, detail} in plain English',
              items: { type: 'object' },
            },
            composer: {
              type: 'object',
              description:
                'Optional LI.FI Composer target for save / earn / yield dapps: { vaultToken: "0x… vault token address", vaultChainId: number (e.g. 8453 for Base), protocol?, vaultLabel? }. When set, running the dapp swaps + deposits the user\'s USDC into that vault in ONE composed transaction. Call simulate_composer_route first to confirm the route.',
            },
          },
          required: ['steps'],
        },
      },
      required: ['name', 'ensLabel', 'description', 'outcome', 'components', 'permissions', 'workflow'],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are the DappDock design assistant (ENS identity: assistant.agent.dappdock.eth, human-backed). DappDock is a mobile dapp app-store: users describe an idea, you design a mini-dapp (UI + LI.FI workflow + ENS identity + World ID access rule), they review permissions and publish it for others to run in one tap.

Your skills (each maps to a manifest pattern):
- Payments / dues collection: amountInput + sourceChain("any") + recipient + memoInput + submitButton; LI.FI routes USDC from any chain to a treasury; usually requiresWorldId with worldPolicy "one-payment-per-human".
- Fundraising: like payments but unlocked amount.
- Voting: no amount; submitButton "Cast my vote"; requiresWorldId, worldPolicy "one-vote-per-human"; spendingCap "$0.00".
- Token-gating / membership: recipient = community treasury, World ID one-per-human join.
- Event check-in / ticket claim: no spend; worldPolicy "one-claim-per-human".
- Loyalty / rewards (cafés, fast food, shops): punchCard {total, reward, pointsPerDollar} + the payment components; each purchase stamps the card and earns points, a full card redeems the reward for free; requiresWorldId with worldPolicy "one-card-per-human" so stamps can't be farmed.
- Restaurant ordering: menu {currency, items} + sourceChain("any") + recipient(restaurant treasury) + submitButton; the user builds a cart in-app and the total settles via LI.FI. Pair with a punchCard so each order also earns points. No fixed amountInput — the cart is the amount.
- Everyday payments (parking, transit top-up, donations / round-up, savings circles): an editable amountInput (locked:false) + sourceChain("any") + recipient + submitButton; always cap the amount. Use requiresWorldId only when one-per-human matters (supporter walls, savings circles, raffles).
- Save / earn / yield (put idle USDC to work): an editable amountInput + sourceChain("any") + submitButton, and a workflow.composer target { vaultToken, vaultChainId } — LI.FI Composer swaps + deposits the USDC into a yield vault in ONE composed transaction (no separate recipient). Run simulate_composer_route first. Usually no World ID; always cap the amount.
- Agent tools: small paid tasks, human-backed agents; spending always capped.

Hard product rules (never break):
- Hide chains until needed: say "from any chain", never "bridge Arbitrum→Base" up front.
- Always state the outcome before routing details.
- Permissions in plain English, 1–5 lines, never raw method calls or addresses.
- Every payment dapp has an explicit spending cap and "you confirm first".
- You can draft and simulate. You CANNOT spend funds or publish — the human does that from the Preview and Publish screens. If asked, say the user confirms those steps.

Working method for a new dapp request:
1. If the request is missing the essentials (who can use it, where funds land, amount), ask at most one short clarifying question. Otherwise proceed.
2. Use tools: resolve the treasury ENS name if one was given; check_ens_subname for a short memorable label; simulate_lifi_route for payment dapps; simulate_composer_route for save/earn/yield dapps (then set workflow.composer in the draft).
3. Call draft_dapp_manifest with the complete design. If validation fails, fix and re-call.
4. Reply with one short sentence telling the user the dapp is ready to review below — the app renders the draft card automatically. Do not paste the manifest JSON into chat.

Tone: short, concrete, friendly. You are talking to a non-crypto-native user on a phone. No markdown headers, no bullet lists longer than 4 items.`;

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function runTool(name: string, input: any, hooks: AgentHooks): Promise<string> {
  switch (name) {
    case 'get_wallet_overview': {
      hooks.onActivity('Reading wallet balances');
      const snap = await getWalletSnapshot();
      return JSON.stringify({
        address: snap.address,
        totalUsdc: snap.totalUsdc,
        chains: snap.balances.map((b) => ({ chain: b.label, usdc: b.usdc, gas: b.native })),
      });
    }
    case 'list_store_dapps': {
      hooks.onActivity('Browsing the store');
      const listings = useApp.getState().listings;
      return JSON.stringify(
        listings.map((l) => ({
          name: l.manifest.name,
          ens: l.manifest.ensName,
          category: l.manifest.category,
          oneLiner: l.oneLiner,
        }))
      );
    }
    case 'resolve_ens_name': {
      hooks.onActivity(`Resolving ${input.name}`);
      const address = await resolveAddress(String(input.name));
      return JSON.stringify({ name: input.name, address, resolved: !!address });
    }
    case 'check_ens_subname': {
      const label = String(input.label).toLowerCase();
      hooks.onActivity(`Checking ${label}.${ENV.ensDomain}`);
      const taken =
        useApp.getState().listings.some((l) => l.manifest.ensName.startsWith(label + '.')) ||
        !!(await resolveAddress(`${label}.${ENV.ensDomain}`));
      return JSON.stringify({ label, ensName: `${label}.${ENV.ensDomain}`, available: !taken });
    }
    case 'simulate_lifi_route': {
      hooks.onActivity('Simulating LI.FI route');
      const result = await simulateFlow(Number(input.amountUsd) || 5);
      useApp.getState().setSimulation(result);
      return JSON.stringify(result);
    }
    case 'simulate_composer_route': {
      hooks.onActivity('Simulating LI.FI Composer deposit');
      const result = await simulateComposerDeposit(Number(input.amountUsd) || 25);
      // record as the active simulation so the draft card reflects a passing route
      useApp.getState().setSimulation({ passed: result.passed, live: result.live, tool: result.tool });
      return JSON.stringify(result);
    }
    case 'draft_dapp_manifest': {
      hooks.onActivity('Drafting the dapp manifest');
      const validation = validateManifest(input);
      if (!validation.ok) {
        return JSON.stringify({ ok: false, errors: validation.errors });
      }
      const sim = useApp.getState().simulation;
      validation.manifest.workflow.simulated = sim?.passed ?? false;
      validation.manifest.trust.simulated = sim?.passed ?? false;
      hooks.onDraft(validation.manifest);
      return JSON.stringify({
        ok: true,
        ensName: validation.manifest.ensName,
        warnings: validation.warnings,
        note: 'Draft stored. The user sees the generated-dapp card and can open the preview.',
      });
    }
    default:
      return JSON.stringify({ error: `unknown tool ${name}` });
  }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------
async function callAnthropic(messages: ApiMessage[]): Promise<{
  content: ContentBlock[];
  stop_reason: string;
}> {
  const res = await fetch(anthropicMessagesUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey(),
      'anthropic-version': '2023-06-01',
      ...(hasDirectAnthropicKey()
        ? { 'anthropic-dangerous-direct-browser-access': 'true' }
        : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  return (await res.json()) as { content: ContentBlock[]; stop_reason: string };
}

/**
 * Run one user turn through the agent. Mutates and returns the API history so
 * the conversation stays multi-turn. Falls back to the deterministic template
 * generator when no Anthropic key is configured.
 */
export async function runAgentTurn(
  history: ApiMessage[],
  userText: string,
  hooks: AgentHooks
): Promise<ApiMessage[]> {
  if (!hasAgentCreds()) {
    // Keyless fallback: template generation so the loop still works.
    hooks.onActivity('Drafting from template (no Anthropic key or Claude Code proxy)');
    const sim = await simulateFlow(5);
    useApp.getState().setSimulation(sim);
    const manifest = generateManifest(userText);
    manifest.workflow.simulated = sim.passed;
    manifest.trust.simulated = sim.passed;
    hooks.onDraft(manifest);
    hooks.onText(
      'I drafted this with the built-in template engine — add EXPO_PUBLIC_ANTHROPIC_API_KEY or point EXPO_PUBLIC_ANTHROPIC_PROXY_URL at your Claude Code proxy to unlock the full design agent. Review the generated dapp below.'
    );
    return history;
  }

  if (!hasDirectAnthropicKey()) {
    hooks.onActivity('Using Claude Code proxy (subscription on dev machine)');
  }

  history.push({ role: 'user', content: userText });

  for (let turn = 0; turn < 8; turn++) {
    const reply = await callAnthropic(history);
    history.push({ role: 'assistant', content: reply.content });

    const text = reply.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) hooks.onText(text);

    const toolUses = reply.content.filter(
      (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
    );
    if (reply.stop_reason !== 'tool_use' || toolUses.length === 0) break;

    const results: ContentBlock[] = [];
    for (const use of toolUses) {
      let output: string;
      try {
        output = await runTool(use.name, use.input, hooks);
      } catch (e) {
        output = JSON.stringify({ error: String(e) });
      }
      results.push({ type: 'tool_result', tool_use_id: use.id, content: output });
    }
    history.push({ role: 'user', content: results });
  }
  return history;
}
