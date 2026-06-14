/**
 * Validate raw agent output into a renderable DappManifest. The runtime only
 * ever renders manifests that pass this gate (no arbitrary user code) - this is
 * also what keeps an AI generator policy-compliant inside World App.
 */
import { APP } from "./config";
import type { DappManifest } from "./types";

export type ValidationResult =
  | { ok: true; manifest: DappManifest; warnings: string[] }
  | { ok: false; errors: string[] };

const COMPONENT_TYPES = ["amountInput", "recipient", "memoInput", "punchCard", "menu", "submitButton"];
const CATEGORIES = ["Finance", "Community", "Agents", "Events", "Tools"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateManifest(input: any, creator = "a human"): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== "object") return { ok: false, errors: ["manifest must be an object"] };
  if (!input.name || typeof input.name !== "string") errors.push("name (string) is required");
  if (!input.description) errors.push("description is required");
  if (!input.outcome) errors.push('outcome (plain-English, starts with "You will") is required');

  const label: string = String(input.ensLabel ?? input.ensName ?? "")
    .split(".")[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!label) errors.push("ensLabel is required (lowercase letters, digits, hyphens)");

  const category = CATEGORIES.includes(input.category) ? input.category : null;
  if (!category) warnings.push(`category defaulted to Finance (got ${JSON.stringify(input.category)})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = Array.isArray(input.components) ? input.components : [];
  const bad = components.filter((c) => !COMPONENT_TYPES.includes(c?.type));
  if (bad.length) errors.push(`unknown component types: ${bad.map((c) => c?.type).join(", ")}`);
  if (!components.some((c) => c?.type === "submitButton")) errors.push("components must include a submitButton");

  for (const c of components) {
    if (c?.type === "punchCard") {
      if (
        typeof c.total !== "number" ||
        c.total <= 0 ||
        !c.reward ||
        typeof c.pointsPerDollar !== "number" ||
        !Number.isFinite(c.pointsPerDollar) ||
        c.pointsPerDollar < 0
      ) {
        errors.push("punchCard needs a positive total, a reward, and a non-negative pointsPerDollar");
      }
    }
    if (c?.type === "menu") {
      const items = Array.isArray(c.items) ? c.items : [];
      if (items.length === 0) errors.push("menu must list at least one item");
      else if (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items.some((it: any) => !it?.id || !it?.name || typeof it?.priceUsd !== "number" || !Number.isFinite(it.priceUsd) || it.priceUsd < 0)
      ) {
        errors.push("every menu item needs an id, a name, and a finite non-negative priceUsd");
      } else if (new Set(items.map((it: { id: string }) => it.id)).size !== items.length) {
        errors.push("menu item ids must be unique");
      }
    }
  }

  const perms = input.permissions ?? {};
  const plainEnglish: string[] = Array.isArray(perms.plainEnglish) ? perms.plainEnglish : [];
  if (plainEnglish.length < 1 || plainEnglish.length > 5) {
    errors.push("permissions.plainEnglish must contain 1-5 plain-English entries");
  }
  if (plainEnglish.some((p) => /0x[a-fA-F0-9]{8,}/.test(p))) {
    errors.push("permissions must not contain raw addresses (plain English only)");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: any[] = Array.isArray(input.workflow?.steps) ? input.workflow.steps : [];
  if (steps.length < 2 || steps.length > 6) errors.push("workflow.steps must have 2-6 steps");
  if (steps.some((s) => !s?.label || !s?.detail)) errors.push("every workflow step needs a label and a detail line");

  if (errors.length) return { ok: false, errors };

  const manifest: DappManifest = {
    name: input.name,
    ensName: `${label}.${APP.ensDomain}`,
    creator,
    description: input.description,
    category: category ?? "Finance",
    secondaryCategory: input.secondaryCategory,
    components,
    outcome: input.outcome,
    permissions: {
      plainEnglish,
      spendingCap: perms.spendingCap ?? "$0.00",
      requiresConfirmation: true,
      requiresWorldId: Boolean(perms.requiresWorldId),
      worldPolicy: perms.worldPolicy,
    },
    workflow: {
      provider: "World Chain",
      flowId: `flow_${label}_${Date.now().toString(36)}`,
      steps: steps.map((s, i) => ({ id: s.id ?? `s${i}`, label: s.label, detail: s.detail })),
    },
    storage: input.storage,
    version: "1.0.0",
  };
  return { ok: true, manifest, warnings };
}
