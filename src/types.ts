export type WorkflowStep = {
  id: string;
  label: string;
  detail: string;
};

export type DappManifest = {
  name: string;
  ensName: string;
  creator: string;
  description: string;
  category: string;
  secondaryCategory?: string;
  components: Array<
    | { type: 'amountInput'; token: string; default: string; locked?: boolean }
    | { type: 'sourceChain'; value: string }
    | { type: 'recipient'; value: string }
    | { type: 'memoInput'; default: string }
    | { type: 'punchCard'; total: number; reward: string; pointsPerDollar: number }
    | {
        type: 'menu';
        currency: string;
        items: Array<{ id: string; name: string; priceUsd: number; desc?: string; tag?: string }>;
      }
    | { type: 'submitButton'; label: string }
  >;
  outcome: string;
  permissions: {
    plainEnglish: string[];
    spendingCap: string;
    requiresConfirmation: boolean;
    requiresWorldId: boolean;
    worldPolicy?: string;
  };
  workflow: {
    provider: string;
    flowId: string;
    steps: WorkflowStep[];
    simulated: boolean;
    /**
     * Optional LI.FI Composer target. When present the runtime executes the
     * flow as a single composed transaction (swap/bridge + zap into the vault)
     * instead of a plain payment — see composer.ts.
     */
    composer?: {
      vaultToken: string;
      vaultChainId: number;
      protocol?: string;
      vaultLabel?: string;
    };
  };
  trust: {
    ensVerified: boolean;
    worldVerifiedCreator: boolean;
    simulated: boolean;
    openSource: boolean;
  };
  ensTextRecords: Record<string, string>;
  version: string;
};

/** Store listing wrapper: a manifest plus presentation metadata. */
export type DappListing = {
  manifest: DappManifest;
  monogram: string;
  runtimeTitle: string;
  oneLiner: string;
  rating: number;
  runs: number;
  reviews: number;
  recency?: string;
  featured?: boolean;
  section: 'humans' | 'agents' | 'recent';
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  card?: boolean;
};
