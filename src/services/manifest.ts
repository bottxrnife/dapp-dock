/**
 * manifest_service — validate raw agent output into a renderable DappManifest.
 * The runtime renderer only ever sees manifests that passed this gate.
 */
import { DappManifest } from '../types';
import { ENV } from './env';

export type ValidationResult =
  | { ok: true; manifest: DappManifest; warnings: string[] }
  | { ok: false; errors: string[] };

const COMPONENT_TYPES = ['amountInput', 'sourceChain', 'recipient', 'memoInput', 'punchCard', 'menu', 'submitButton'];
const CATEGORIES = ['Finance', 'Community', 'Agents', 'Events', 'Tools'];

export function validateManifest(input: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (!input.name || typeof input.name !== 'string') errors.push('name (string) is required');
  if (!input.description) errors.push('description is required');
  if (!input.outcome) errors.push('outcome (plain-English, starts with "You will") is required');

  // ENS label
  let label: string = String(input.ensLabel ?? input.ensName ?? '')
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (!label) errors.push('ensLabel is required (lowercase letters, digits, hyphens)');

  const category = CATEGORIES.includes(input.category) ? input.category : null;
  if (!category) {
    warnings.push(`category defaulted to Finance (got ${JSON.stringify(input.category)})`);
  }

  // components
  const components = Array.isArray(input.components) ? input.components : [];
  const badComponents = components.filter((c: any) => !COMPONENT_TYPES.includes(c?.type));
  if (badComponents.length) {
    errors.push(`unknown component types: ${badComponents.map((c: any) => c?.type).join(', ')}`);
  }
  if (!components.some((c: any) => c?.type === 'submitButton')) {
    errors.push('components must include a submitButton');
  }
  // per-type shape — the runtime reads these fields directly, so guard them here
  for (const c of components) {
    if (c?.type === 'punchCard') {
      if (typeof c.total !== 'number' || c.total <= 0 || !c.reward || typeof c.pointsPerDollar !== 'number') {
        errors.push('punchCard needs a positive total, a reward, and a numeric pointsPerDollar');
      }
    }
    if (c?.type === 'menu') {
      const items = Array.isArray(c.items) ? c.items : [];
      if (items.length === 0) errors.push('menu must list at least one item');
      else if (items.some((it: any) => !it?.id || !it?.name || typeof it?.priceUsd !== 'number')) {
        errors.push('every menu item needs an id, a name, and a numeric priceUsd');
      } else if (new Set(items.map((it: any) => it.id)).size !== items.length) {
        errors.push('menu item ids must be unique');
      }
    }
  }

  // permissions
  const perms = input.permissions ?? {};
  const plainEnglish: string[] = Array.isArray(perms.plainEnglish) ? perms.plainEnglish : [];
  if (plainEnglish.length < 1 || plainEnglish.length > 5) {
    errors.push('permissions.plainEnglish must contain 1–5 plain-English entries');
  }
  if (plainEnglish.some((p) => /0x[a-fA-F0-9]{8,}/.test(p))) {
    errors.push('permissions must not contain raw addresses (plain English only)');
  }

  // workflow
  const steps = Array.isArray(input.workflow?.steps) ? input.workflow.steps : [];
  if (steps.length < 2 || steps.length > 6) errors.push('workflow.steps must have 2–6 steps');
  if (steps.some((s: any) => !s?.label || !s?.detail)) {
    errors.push('every workflow step needs a label and a detail line');
  }

  // optional LI.FI Composer target (save/earn dapps): a destination vault token
  const composerInput = input.workflow?.composer;
  let composer: DappManifest['workflow']['composer'];
  if (composerInput) {
    const vaultToken = String(composerInput.vaultToken ?? '');
    const vaultChainId = Number(composerInput.vaultChainId);
    if (!/^0x[a-fA-F0-9]{40}$/.test(vaultToken) || !Number.isInteger(vaultChainId) || vaultChainId <= 0) {
      errors.push('workflow.composer needs a vaultToken (0x address) and a numeric vaultChainId');
    } else {
      composer = {
        vaultToken,
        vaultChainId,
        protocol: composerInput.protocol ? String(composerInput.protocol) : undefined,
        vaultLabel: composerInput.vaultLabel ? String(composerInput.vaultLabel) : undefined,
      };
    }
  }

  if (errors.length) return { ok: false, errors };

  const manifest: DappManifest = {
    name: input.name,
    ensName: `${label}.${ENV.ensDomain}`,
    creator: 'william.eth',
    description: input.description,
    category: category ?? 'Finance',
    secondaryCategory: input.secondaryCategory,
    components,
    outcome: input.outcome,
    permissions: {
      plainEnglish,
      spendingCap: perms.spendingCap ?? '$0.00',
      requiresConfirmation: true, // non-negotiable boundary
      requiresWorldId: Boolean(perms.requiresWorldId),
      worldPolicy: perms.worldPolicy,
    },
    workflow: {
      provider: 'LI.FI Composer',
      flowId: `flow_${label}_${Date.now().toString(36)}`,
      steps: steps.map((s: any, i: number) => ({ id: s.id ?? `s${i}`, label: s.label, detail: s.detail })),
      simulated: false, // flipped after a passing simulation
      ...(composer ? { composer } : {}),
    },
    trust: { ensVerified: true, worldVerifiedCreator: true, simulated: false, openSource: true },
    ensTextRecords: {
      'dapp.category': category ?? 'Finance',
      'dapp.version': '1.0.0',
      'world.policy': perms.worldPolicy ?? '',
    },
    version: '1.0.0',
  };
  return { ok: true, manifest, warnings };
}
