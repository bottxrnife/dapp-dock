/**
 * Forge design agent (server-side). An Anthropic tool-calling loop that drafts
 * schema-validated mini-app manifests. It can draft and check ENS availability;
 * it has NO spend/publish tools - a human confirms those in the UI. Falls back
 * to a deterministic template when no model credential is set.
 */
import { APP } from "./config";
import { listApps } from "./catalog";
import { getAgentProfile, resolveAddress, verifyName } from "./ens";
import { validateManifest } from "./manifest";
import { SEED_APPS } from "./seeds";
import type { DappManifest } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const hasDirectKey = () => (process.env.ANTHROPIC_API_KEY ?? "").length > 0;
const hasProxy = () => (process.env.ANTHROPIC_PROXY_URL ?? "").length > 0;
export const hasAgentCreds = () => hasDirectKey() || hasProxy();

function messagesUrl(): string {
  if (hasDirectKey()) return "https://api.anthropic.com/v1/messages";
  const base = (process.env.ANTHROPIC_PROXY_URL ?? "").replace(/\/$/, "");
  return base.endsWith("/v1/messages") ? base : `${base}/v1/messages`;
}
function apiKey(): string {
  return hasDirectKey() ? (process.env.ANTHROPIC_API_KEY ?? "") : (process.env.ANTHROPIC_PROXY_KEY ?? "dummy");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: any }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type ApiMessage = { role: "user" | "assistant"; content: ContentBlock[] | string };
export type AgentTurn = {
  history: ApiMessage[];
  text: string;
  draft: DappManifest | null;
  drafts: DappManifest[] | null;
  source: string;
};

/**
 * The hard-coded menu of everything this agent can assemble - surfaced verbatim
 * through the get_capabilities tool so the model can ground itself and offer
 * concrete variations. Mirrors the manifest schema (do not let it drift).
 */
const CAPABILITIES = {
  componentTypes: {
    amountInput: {
      fields: {
        token: 'string, e.g. "USDC"',
        default: "string amount",
        locked: "boolean? - true = fixed price, false/omit = the user can edit the amount",
      },
    },
    recipient: { fields: { value: "an ENS name or 0x address that receives the payment" } },
    memoInput: { fields: { default: "string - a user-editable note attached to the payment" } },
    punchCard: {
      fields: {
        total: "number - stamps needed to earn the reward",
        reward: "string - what a full card earns",
        pointsPerDollar: "number - points earned per $1",
      },
    },
    menu: {
      fields: {
        currency: 'string, e.g. "USDC"',
        items: "array of { id, name, priceUsd, desc?, tag? (section like Mains/Drinks), imageBlobId? }",
        pointsPerDollar: "number? - points earned per $1 spent",
      },
    },
    submitButton: { fields: { label: "string - the call to action" }, required: "exactly one per manifest" },
  },
  skills: [
    { id: "payment", name: "Payment / dues", pattern: "amountInput + recipient + memoInput? + submitButton" },
    { id: "loyalty", name: "Loyalty / punch card", pattern: "punchCard + amountInput + recipient + submitButton" },
    { id: "ordering", name: "Ordering / menu", pattern: "menu + recipient + submitButton" },
    { id: "tipjar", name: "Tip jar", pattern: "amountInput (unlocked) + recipient + submitButton" },
    { id: "vote", name: "Vote", pattern: "submitButton only; requiresWorldId, spendingCap $0.00" },
    { id: "raffle", name: "Raffle", pattern: "submitButton only; requiresWorldId, one-entry-per-human" },
    { id: "rsvp", name: "RSVP / ticket claim", pattern: "submitButton only; requiresWorldId, one-claim-per-human" },
    {
      id: "membership",
      name: "Membership",
      pattern: "amountInput + recipient + submitButton; requiresWorldId, one-membership-per-human",
    },
    { id: "fundraiser", name: "Fundraiser", pattern: "amountInput (unlocked) + recipient + submitButton" },
    { id: "savings", name: "Savings circle", pattern: "amountInput + recipient + submitButton" },
    { id: "transit", name: "Parking / transit", pattern: "amountInput + recipient + submitButton" },
    { id: "article", name: "Article unlock", pattern: "amountInput (locked, small) + recipient + submitButton" },
    {
      id: "agent",
      name: "Agent-hire",
      pattern: "amountInput + recipient + submitButton; the result is approved before it settles",
    },
  ],
  worldPolicies: [
    "one-payment-per-human",
    "one-card-per-human",
    "one-vote-per-human",
    "one-entry-per-human",
    "one-claim-per-human",
    "one-membership-per-human",
  ],
  categories: ["Finance", "Community", "Agents", "Events", "Tools"],
  notes: [
    "Payments always settle in the user's World wallet on World Chain - never mention bridges or other chains.",
    "Every manifest must include exactly one submitButton.",
    "You can draft and check names only; a human confirms spend and publish.",
  ],
} as const;

/** The full manifest shape the agent drafts - shared by draft_dapp_manifest (one)
 *  and draft_variations (an array of these) so both stay in lock-step. */
const MANIFEST_INPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    ensLabel: { type: "string", description: `subname label under ${APP.ensDomain}` },
    description: { type: "string" },
    category: { type: "string", enum: ["Finance", "Community", "Agents", "Events", "Tools"] },
    outcome: { type: "string", description: 'plain English, starts with "You will …"' },
    components: {
      type: "array",
      description:
        "The app's UI + actions, rendered in order. Component types: " +
        'amountInput {token (e.g. "USDC"), default (amount string), locked? (true = fixed price, false/omit = user can edit)}; ' +
        "recipient {value: an ENS name or 0x address that receives the payment}; " +
        "memoInput {default: a user-editable note on the payment}; " +
        "punchCard {total (stamps for the reward), reward, pointsPerDollar} - loyalty/stamp card; pair with amountInput + recipient so each paid run stamps it; " +
        'menu {currency, items:[{id, name, priceUsd, desc?, tag? (section like "Mains"/"Drinks"), imageBlobId?}], pointsPerDollar?} - ordering; the cart total is the amount, pair with a recipient; ' +
        "submitButton {label} - REQUIRED, include exactly one. " +
        'Patterns: payment/dues = amountInput + recipient (+ memoInput) + submitButton; loyalty = punchCard + amountInput + recipient + submitButton; ordering = menu + recipient + submitButton; vote/raffle/RSVP/claim = submitButton only with requiresWorldId + spendingCap "$0.00".',
      items: { type: "object" },
    },
    permissions: {
      type: "object",
      properties: {
        plainEnglish: { type: "array", items: { type: "string" } },
        spendingCap: { type: "string" },
        requiresWorldId: { type: "boolean" },
        worldPolicy: { type: "string" },
      },
      required: ["plainEnglish"],
    },
    workflow: {
      type: "object",
      properties: { steps: { type: "array", items: { type: "object" } } },
      required: ["steps"],
    },
  },
  required: ["name", "ensLabel", "description", "outcome", "components", "permissions", "workflow"],
} as const;

const TOOLS = [
  {
    name: "get_current_draft",
    description:
      "Return the Spark the user is currently editing (its manifest), or none. Call this first when the user asks to change/edit an existing Spark, then re-call draft_dapp_manifest with the full updated design.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "check_ens_subname",
    description: `Check whether a subname label is available under ${APP.ensDomain} for a new app identity.`,
    input_schema: {
      type: "object",
      properties: { label: { type: "string", description: 'lowercase label, e.g. "cafe"' } },
      required: ["label"],
    },
  },
  {
    name: "draft_dapp_manifest",
    description:
      "Create or update the mini-app draft the human will review and publish. Validated against the Forge schema; on success a draft card is shown. Call once the design is settled, for a SPECIFIC request or when editing an existing draft. To iterate on an existing draft (cheaper price, add loyalty, require World ID, turn it into a menu, rename, etc.) re-call with the FULL updated manifest - every field, not just the change.",
    input_schema: MANIFEST_INPUT_SCHEMA,
  },
  {
    name: "draft_variations",
    description:
      "Offer the user 2-3 DISTINCT variations of the Spark to choose from (e.g. different pricing models or component patterns). Each is the full manifest. Use this for open-ended requests; use draft_dapp_manifest for a single specific app or when editing an existing draft.",
    input_schema: {
      type: "object",
      properties: {
        variations: {
          type: "array",
          description: "2-3 genuinely different full manifests, each in the same shape draft_dapp_manifest accepts.",
          minItems: 2,
          maxItems: 3,
          items: MANIFEST_INPUT_SCHEMA,
        },
      },
      required: ["variations"],
    },
  },
  {
    name: "list_sparks",
    description:
      "List the current Forge catalog Sparks (built-in samples + anything published) for inspiration and to avoid duplicate names/labels. Returns up to 30 as [{name, ensName, category, description}]. No inputs.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_capabilities",
    description:
      "Return the full menu of what you can build: every component type and its fields, the skill patterns you can assemble, the World ID one-per-human policies, and the categories. Use it to ground yourself and to offer concrete variations. No inputs.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "resolve_ens_name",
    description:
      'Resolve an ENS name (e.g. "vitalik.eth", or a bare label) to a mainnet address so you can validate a recipient the user names before using it. Returns {name, address, resolves}.',
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: 'an ENS name like "vitalik.eth", or a bare label' } },
      required: ["name"],
    },
  },
  {
    name: "get_agent_identity",
    description:
      "Look up another agent's on-chain identity by ENS name (ENSIP-26): its agent-context, agent-endpoint[mcp|a2a|web], and whether the name forward/reverse verifies. Use it to discover or verify agents. Returns {name, address, verified, agentContext, endpoints, hasRecords}.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: 'an agent ENS name, e.g. "assistant.forge.eth"' } },
      required: ["name"],
    },
  },
  {
    name: "suggest_labels",
    description: `Propose 3 candidate lowercase ENS labels derived from an app name and report availability under ${APP.ensDomain} for each. Returns [{label, ensName, available}]. Use with check_ens_subname when naming a new app.`,
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "the app's display name or idea" } },
      required: ["name"],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are Forge's design agent, inside World App. Users describe an everyday mini-app; you design it as a schema-validated manifest that runs inside Forge. Each published app gets an ENS subname under ${APP.ensDomain}, its manifest is stored on Walrus, and only verified humans can run or claim it.

You can build a wide range of mini-apps by assembling a small set of components. Skills you can ship:
- Payment / dues - collect a fixed or open amount to a recipient.
- Loyalty / punch card - a stamp card that fills on each paid run and earns points.
- Ordering / menu - an in-app menu cart; pay the total, earn points, get a pickup code.
- Tip jar - one tap, pick-your-own-amount tip.
- Vote - one verified human, one vote (no spend).
- Raffle - one entry per human (no spend).
- RSVP / ticket claim - claim one pass or spot per human (no spend).
- Membership pass - one membership per human, usually a recurring fee.
- Fundraiser - open-amount contributions toward a goal.
- Savings circle - rotating contributions that pay out each round.
- Parking / transit - pay a metered or top-up amount.
- Article unlock - a tiny fixed micropayment.
- Agent-hire - fund a human-backed agent task; the result is approved before it settles.

Tools for grounding & design:
- get_capabilities - the full menu of component types, their fields, the skill patterns, and the one-per-human policies. Lean on it so you know exactly what you can offer.
- list_sparks - the existing catalog, for inspiration and to avoid duplicate names/labels.
- resolve_ens_name - verify a recipient the user names (e.g. "pay alice.eth") resolves to a real address before you use it.
- get_agent_identity - look up / verify another agent's ENS identity (ENSIP-26 agent records + forward/reverse) for discovery.
- suggest_labels + check_ens_subname - pick an available ENS label under ${APP.ensDomain} for a new app.
- get_current_draft + draft_dapp_manifest - read and (re)write a single design.
- draft_variations - offer 2-3 distinct full manifests at once for the user to pick from in the UI.

Be proactive about choosing the right drafting tool:
- For OPEN-ENDED or vague requests (e.g. "make me a coffee shop app"), call draft_variations with 2-3 genuinely different takes (e.g. punch-card vs points-only menu vs a simple tip jar), then end with one short sentence inviting the user to pick one below.
- For SPECIFIC requests, or when EDITING an existing draft, call draft_dapp_manifest (single).

To edit or iterate (the user may say "make it cheaper", "add loyalty", "require World ID", "turn it into a menu", "rename it", "give me 3 variations", etc.): call get_current_draft first, then re-call draft_dapp_manifest with the FULL updated manifest - every field, not just the change (or draft_variations if they explicitly want options).

Component patterns to assemble: amountInput + recipient (+ memoInput) + submitButton for payments; add a punchCard for loyalty; a menu (+ recipient) for ordering; submitButton alone with requiresWorldId + spendingCap "$0.00" for vote/raffle/RSVP/claim. Set requiresWorldId + a worldPolicy (one-payment-per-human, one-card-per-human, one-vote-per-human, one-entry-per-human, one-claim-per-human, one-membership-per-human) whenever it should be one-per-human.

Hard rules:
- Payments settle in the user's World wallet on World Chain; never mention bridges or other chains.
- State the outcome before the details. Permissions are 1-5 plain-English lines, never raw addresses.
- You draft and check names only. You CANNOT spend or publish - the human confirms those in the UI.

Method: prefer draft_variations over clarifying questions when a request is open-ended; ask at most one short question only if truly essential. Ground with get_capabilities/list_sparks as needed, verify any named recipient with resolve_ens_name, pick free labels with suggest_labels/check_ens_subname, then call draft_variations (open-ended) or draft_dapp_manifest (specific/editing) and reply with one short sentence pointing at what's ready to review below. Keep replies short and friendly. No markdown headers.`;

/** Availability check shared by check_ens_subname + suggest_labels: a label is
 *  taken if a seed Spark already uses it or it resolves on mainnet. */
async function labelAvailable(label: string): Promise<boolean> {
  const l = label.toLowerCase();
  const taken = SEED_APPS.some((a) => a.ensName.startsWith(l + ".")) || !!(await resolveAddress(`${l}.${APP.ensDomain}`));
  return !taken;
}

/** Derive up to 3 distinct lowercase ENS-label candidates from an app name. */
function candidateLabels(name: string): string[] {
  const words = name.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  const first = words[0] || "app";
  const pool = [first, words.slice(0, 2).join(""), words.join(""), words.map((w) => w[0]).join(""), `${first}app`];
  const unique = [...new Set(pool.map((c) => c.replace(/[^a-z0-9-]/g, "")).filter((c) => c.length >= 2))];
  let n = 1;
  while (unique.length < 3) unique.push(`${first}${++n}`);
  return unique.slice(0, 3);
}

async function runTool(name: string, input: Record<string, unknown>, currentDraft: DappManifest | null): Promise<string> {
  if (name === "get_current_draft") {
    return JSON.stringify(currentDraft ? { draft: currentDraft } : { draft: null, note: "No Spark drafted yet." });
  }
  if (name === "check_ens_subname") {
    const label = String(input.label ?? "").toLowerCase();
    return JSON.stringify({ label, ensName: `${label}.${APP.ensDomain}`, available: await labelAvailable(label) });
  }
  if (name === "list_sparks") {
    const sparks = listApps()
      .slice(0, 30)
      .map((a) => ({ name: a.name, ensName: a.ensName, category: a.category, description: a.description }));
    return JSON.stringify(sparks);
  }
  if (name === "get_capabilities") {
    return JSON.stringify(CAPABILITIES);
  }
  if (name === "resolve_ens_name") {
    const raw = String(input.name ?? "").trim().toLowerCase();
    const full = raw.includes(".") ? raw : raw ? `${raw}.eth` : "";
    const address = full ? await resolveAddress(full) : null;
    return JSON.stringify({ name: full || raw, address: address ?? null, resolves: !!address });
  }
  if (name === "get_agent_identity") {
    const raw = String(input.name ?? "").trim().toLowerCase();
    const full = raw.includes(".") ? raw : raw ? `${raw}.eth` : "";
    if (!full) return JSON.stringify({ error: "name required" });
    const [profile, verification] = await Promise.all([getAgentProfile(full), verifyName(full)]);
    return JSON.stringify({
      name: full,
      address: verification.address,
      verified: verification.verified,
      agentContext: profile.context,
      endpoints: profile.endpoints,
      hasRecords: profile.hasRecords,
    });
  }
  if (name === "suggest_labels") {
    const suggestions: { label: string; ensName: string; available: boolean }[] = [];
    for (const label of candidateLabels(String(input.name ?? ""))) {
      suggestions.push({ label, ensName: `${label}.${APP.ensDomain}`, available: await labelAvailable(label) });
    }
    return JSON.stringify(suggestions);
  }
  if (name === "draft_dapp_manifest") {
    const v = validateManifest(input);
    if (!v.ok) return JSON.stringify({ ok: false, errors: v.errors });
    return JSON.stringify({ ok: true, ensName: v.manifest.ensName, warnings: v.warnings });
  }
  if (name === "draft_variations") {
    const list = Array.isArray(input.variations) ? (input.variations as unknown[]) : [];
    const variations = list.map((item, index) => {
      const v = validateManifest(item);
      return v.ok ? { index, ok: true, ensName: v.manifest.ensName } : { index, ok: false, errors: v.errors };
    });
    return JSON.stringify({ ok: true, count: variations.length, variations });
  }
  return JSON.stringify({ error: `unknown tool ${name}` });
}

async function callAnthropic(messages: ApiMessage[]): Promise<{ content: ContentBlock[]; stop_reason: string }> {
  const res = await fetch(messagesUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: SYSTEM_PROMPT, tools: TOOLS, messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { content: ContentBlock[]; stop_reason: string };
}

/** Run one user turn. Returns the updated history, the assistant text, and any draft. */
export async function runAgentTurn(
  history: ApiMessage[],
  userText: string,
  creator: string,
  currentDraft: DappManifest | null = null
): Promise<AgentTurn> {
  if (!hasAgentCreds()) {
    const draft = templateManifest(userText, creator) ?? currentDraft;
    return {
      history,
      text: "Drafted with the built-in template engine (add a Claude API key or Claude Code to unlock the full agent). Review the app below.",
      draft,
      drafts: null,
      source: "template",
    };
  }

  const convo: ApiMessage[] = [...history, { role: "user", content: userText }];
  let draft: DappManifest | null = currentDraft;
  let drafts: DappManifest[] | null = null;
  let text = "";

  for (let turn = 0; turn < 8; turn++) {
    const reply = await callAnthropic(convo);
    convo.push({ role: "assistant", content: reply.content });

    text = reply.content
      .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const toolUses = reply.content.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use"
    );
    if (reply.stop_reason !== "tool_use" || toolUses.length === 0) break;

    const results: ContentBlock[] = [];
    for (const use of toolUses) {
      const output = await runTool(use.name, use.input, currentDraft).catch((e) => JSON.stringify({ error: String(e) }));
      results.push({ type: "tool_result", tool_use_id: use.id, content: output });
      if (use.name === "draft_dapp_manifest") {
        const v = validateManifest(use.input, creator);
        if (v.ok) {
          draft = v.manifest;
          drafts = null; // a single (re)draft clears any stale variation picker
        }
      }
      if (use.name === "draft_variations") {
        const items = Array.isArray(use.input?.variations) ? (use.input.variations as unknown[]) : [];
        const valid: DappManifest[] = [];
        for (const item of items) {
          const v = validateManifest(item, creator);
          if (v.ok) valid.push(v.manifest);
        }
        if (valid.length >= 2) {
          drafts = valid; // show the picker, not a single card
          draft = null;
        } else if (valid.length === 1) {
          draft = valid[0]; // only one survived validation - fall back to a single draft
        }
      }
    }
    convo.push({ role: "user", content: results });
  }

  return { history: convo, text, draft, drafts, source: hasDirectKey() ? "Claude API" : "Claude Code" };
}

/** Deterministic fallback so the loop works with no model credential. */
function templateManifest(prompt: string, creator: string): DappManifest | null {
  const amount = prompt.match(/\$\s*(\d+(?:\.\d+)?)/)?.[1] ?? "5";
  const recipient = prompt.match(/\b([a-z0-9-]+\.eth)\b/i)?.[1]?.toLowerCase() ?? `treasury.${APP.ensDomain}`;
  const loyalty = /loyal|stamp|punch|reward|coffee|cafe|caf\u00e9/i.test(prompt);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = [
    { type: "amountInput", token: "USDC", default: amount, locked: true },
    { type: "recipient", value: recipient },
  ];
  if (loyalty) components.push({ type: "punchCard", total: 10, reward: "Free item", pointsPerDollar: 100 });
  components.push({ type: "submitButton", label: "Pay" });
  const v = validateManifest(
    {
      name: loyalty ? "Loyalty Card" : "Collect Payment",
      ensLabel: loyalty ? "loyalty" : "collect",
      description: prompt.slice(0, 120),
      category: loyalty ? "Community" : "Finance",
      outcome: `You will pay $${amount}.`,
      components,
      permissions: {
        plainEnglish: ["Read your wallet balance", "Send one USDC payment"],
        spendingCap: `${amount} USDC`,
        requiresWorldId: true,
        worldPolicy: loyalty ? "one-card-per-human" : "one-payment-per-human",
      },
      workflow: {
        steps: [
          { label: "Confirm the payment", detail: "From your World wallet" },
          { label: "Settle on World Chain", detail: "A single payment" },
        ],
      },
    },
    creator
  );
  return v.ok ? v.manifest : null;
}
