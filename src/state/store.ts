import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { SEED_LISTINGS } from '../data/seeds';
import type { ApiMessage } from '../services/agent';
import { SimulationResult } from '../services/execution';
import { readLoyalty } from '../services/onchain';
import type { WalletSnapshot } from '../services/wallet';
import { setActivePalette, ThemeMode } from '../theme';
import { DappListing, DappManifest } from '../types';

export type UiMessage =
  | { kind: 'chat'; role: 'user' | 'assistant'; text: string }
  | { kind: 'activity'; label: string }
  | { kind: 'card' };

const KEYS = {
  theme: 'dappdock.theme',
  loyalty: 'dappdock.loyalty',
  activity: 'dappdock.activity',
  saved: 'dappdock.saved',
  listings: 'dappdock.listings',
  reviews: 'dappdock.reviews',
  redpackets: 'dappdock.redpackets',
  contacts: 'dappdock.contacts',
  shortcuts: 'dappdock.shortcuts',
  orders: 'dappdock.orders',
};

/** A placed order in a menu/restaurant mini-app (kept for the History tab + QR). */
export type OrderRecord = {
  id: string;
  ens: string; // the dapp's ENS
  items: Array<{ name: string; qty: number }>;
  totalUsd: number;
  points: number;
  userHandle: string; // the buyer's ENS / short address (shown on the pickup QR)
  ts: number;
  live?: boolean;
  explorerUrl?: string;
};

/** A customizable Home tile — an emoji shortcut to a route (action or dapp). */
export type HomeShortcut = { id: string; emoji: string; label: string; route: string };

/** The default Home grid (the user can add/remove tiles from here). */
export const DEFAULT_SHORTCUTS: HomeShortcut[] = [
  { id: 'pay', emoji: '💸', label: 'Pay', route: '/pay' },
  { id: 'swap', emoji: '🔄', label: 'Swap', route: '/detail/swap.dappdock.eth' },
  { id: 'lucky', emoji: '🧧', label: 'Lucky', route: '/redpacket/new' },
  { id: 'fundraise', emoji: '🎗️', label: 'Fundraise', route: '/detail/fundraise.dappdock.eth' },
  { id: 'members', emoji: '🎫', label: 'Members', route: '/detail/members.dappdock.eth' },
  { id: 'agents', emoji: '🤖', label: 'Agents', route: '/store?category=Agents' },
  { id: 'events', emoji: '🎟️', label: 'Events', route: '/store?category=Events' },
  { id: 'rewards', emoji: '🎁', label: 'Rewards', route: '/rewards' },
];

/** Per-dapp loyalty pass: stamps toward the current reward, lifetime points, rewards claimed. */
export type LoyaltyRecord = { punches: number; points: number; redeemed: number };

/** A single entry in the user's activity / receipts feed. */
export type ActivityEntry = {
  id: string;
  ens: string;
  title: string;
  kind: 'purchase' | 'redeem' | 'review' | 'send' | 'receive';
  amountUsd?: number;
  points?: number;
  note?: string;
  ts: number;
  live?: boolean;
  explorerUrl?: string;
};

/** A one-per-human review, keyed by the World ID nullifier that authored it. */
export type Review = { rating: number; text: string; nullifier: string; ts: number };

/** A lucky-money / red packet: a pool split into N shares, one claim per human. */
export type RedPacket = {
  id: string;
  from: string;
  totalUsd: number;
  count: number;
  split: 'equal' | 'lucky';
  shares: number[]; // pre-computed per-claim amounts in USD
  claims: Array<{ nullifier: string; amountUsd: number; ts: number }>;
  createdTs: number;
};

/** A saved payee for pay-by-ENS. */
export type Contact = { ens: string; address: string; ts: number };

/**
 * Split a pool into N shares — even, or WeChat-style "lucky" random partition.
 * Callers must pass `count <= round(totalUsd*100)` (enforced in createRedPacket)
 * so shares always sum to exactly `totalUsd` and never go to zero.
 */
function computeShares(totalUsd: number, count: number, split: 'equal' | 'lucky'): number[] {
  const cents = Math.round(totalUsd * 100);
  if (split === 'equal') {
    const base = Math.floor(cents / count);
    const shares = Array(count).fill(base);
    let rem = cents - base * count;
    for (let i = 0; rem > 0; i++, rem--) shares[i % count] += 1;
    return shares.map((c) => c / 100);
  }
  // "lucky": each draw takes a random slice of the remaining pool (double-average),
  // leaving at least 1 cent for every packet still to come.
  const shares: number[] = [];
  let remaining = cents;
  for (let i = 0; i < count; i++) {
    const left = count - i;
    if (left === 1) {
      shares.push(remaining);
      break;
    }
    const max = remaining - (left - 1);
    const amt = Math.max(1, Math.floor(Math.random() * ((max / left) * 2)) + 1);
    shares.push(amt);
    remaining -= amt;
  }
  // shuffle so position doesn't reveal size
  for (let i = shares.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shares[i], shares[j]] = [shares[j], shares[i]];
  }
  return shares.map((c) => c / 100);
}

/** Demo head-start so the punch card isn't empty on first open. */
const LOYALTY_SEED: Record<string, LoyaltyRecord> = {
  'burgerblock.dappdock.eth': { punches: 7, points: 6450, redeemed: 2 },
};

/**
 * Generic JSON persistence to the device keychain (expo-secure-store). Every
 * persisted slice goes through these two helpers — the local cache that backs
 * the on-chain (ENS) source of truth and works fully offline.
 */
async function persistJSON(key: string, value: unknown) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch {
    // non-fatal: this slice just won't persist
  }
}

async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Restore the saved theme before first paint settles; called from _layout. */
export async function loadThemePreference() {
  try {
    const saved = await SecureStore.getItemAsync(KEYS.theme);
    if (saved === 'dark' || saved === 'light') {
      setActivePalette(saved);
      useApp.setState({ themeMode: saved });
    }
  } catch {
    // keep default
  }
}

/**
 * Restore every persisted slice (loyalty, activity, saved, user listings,
 * reviews). Called once from _layout. Theme is restored separately so its
 * palette side-effect runs before first paint.
 */
export async function loadPersistedState() {
  const [loyalty, activity, savedEns, userListings, reviews, redPackets, contacts, shortcuts, orders] = await Promise.all([
    loadJSON<Record<string, LoyaltyRecord>>(KEYS.loyalty),
    loadJSON<ActivityEntry[]>(KEYS.activity),
    loadJSON<string[]>(KEYS.saved),
    loadJSON<DappListing[]>(KEYS.listings),
    loadJSON<Record<string, Review[]>>(KEYS.reviews),
    loadJSON<Record<string, RedPacket>>(KEYS.redpackets),
    loadJSON<Contact[]>(KEYS.contacts),
    loadJSON<HomeShortcut[]>(KEYS.shortcuts),
    loadJSON<OrderRecord[]>(KEYS.orders),
  ]);
  const patch: Partial<AppState> = {};
  if (loyalty) patch.loyalty = { ...LOYALTY_SEED, ...loyalty };
  if (activity) patch.activity = activity;
  if (savedEns) patch.savedEns = savedEns;
  if (reviews) patch.reviews = reviews;
  if (redPackets) patch.redPackets = redPackets;
  if (contacts) patch.contacts = contacts;
  if (shortcuts && shortcuts.length) patch.homeShortcuts = shortcuts;
  if (orders) patch.orders = orders;
  if (userListings && userListings.length) {
    patch.userListings = userListings;
    patch.listings = [...userListings, ...SEED_LISTINGS];
  }
  if (Object.keys(patch).length) useApp.setState(patch);
}

/**
 * Hydrate the loyalty map from the user's ENS `dappdock.loyalty` text record
 * (read-through; chain wins over the local cache for shared keys). Pure ENS via
 * viem — safe no-op when the wallet has no primary ENS name or no such record.
 * Call once the wallet address is known (e.g. from Home). The local SecureStore
 * cache remains the writable source of truth (see onchain_service).
 */
export async function syncLoyaltyFromChain() {
  const address = useApp.getState().wallet?.address;
  if (!address) return;
  const chain = await readLoyalty(address);
  if (chain) {
    // Reconcile field-wise by the higher value so the ENS read-through can ADD
    // merchants / top up, but never reverts local gains the device earned since
    // the on-chain snapshot was written (local stays the writable source of truth).
    const local = useApp.getState().loyalty;
    const merged: Record<string, LoyaltyRecord> = { ...local };
    for (const [ens, r] of Object.entries(chain)) {
      const prev = local[ens];
      merged[ens] = prev
        ? {
            punches: Math.max(prev.punches, r.punches),
            points: Math.max(prev.points, r.points),
            redeemed: Math.max(prev.redeemed, r.redeemed),
          }
        : r;
    }
    persistJSON(KEYS.loyalty, merged);
    useApp.setState({ loyalty: merged, loyaltyOnchain: true });
  }
}

type AppState = {
  // appearance
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  // Create tab: the persistent tab bar stays until the assistant goes immersive
  // (the user starts interacting), then it slides away for a full-screen chat.
  assistantImmersive: boolean;
  setAssistantImmersive: (v: boolean) => void;

  // session / World ID
  verified: boolean;
  verifiedSimulated: boolean;
  setVerified: (v: { verified: boolean; simulated: boolean }) => void;

  // embedded wallet
  wallet: WalletSnapshot | null;
  setWallet: (w: WalletSnapshot) => void;

  // loyalty passes (punch cards / points per dapp) — mirrored to ENS text records
  loyalty: Record<string, LoyaltyRecord>;
  loyaltyOnchain: boolean; // true once a loyalty card was read from the user's ENS profile
  addStamp: (ens: string, points: number) => void;
  addPoints: (ens: string, points: number) => void;
  redeemReward: (ens: string, cardSize: number) => void;
  spendPoints: (ens: string, cost: number, rewardLabel: string) => boolean;

  // menu / restaurant orders (History tab + pickup QR)
  orders: OrderRecord[];
  placeOrder: (o: Omit<OrderRecord, 'id' | 'ts'>) => OrderRecord;

  // activity / receipts feed
  activity: ActivityEntry[];
  recordActivity: (e: Omit<ActivityEntry, 'id' | 'ts'>) => void;

  // saved / favorite dapps
  savedEns: string[];
  toggleSave: (ens: string) => void;
  isSaved: (ens: string) => boolean;

  // customizable Home tile grid
  homeShortcuts: HomeShortcut[];
  addShortcut: (s: HomeShortcut) => void;
  removeShortcut: (id: string) => void;
  resetShortcuts: () => void;

  // reviews (one per human, keyed by World ID nullifier)
  reviews: Record<string, Review[]>;
  submitReview: (ens: string, r: Review) => void;

  // red packets / lucky money
  redPackets: Record<string, RedPacket>;
  createRedPacket: (opts: {
    from: string;
    totalUsd: number;
    count: number;
    split: 'equal' | 'lucky';
  }) => string;
  claimRedPacket: (
    id: string,
    nullifier: string
  ) => { ok: true; amountUsd: number } | { ok: false; reason: 'not_found' | 'already' | 'empty' };

  // pay-by-ENS contacts
  contacts: Contact[];
  saveContact: (c: Contact) => void;

  // store catalogue
  listings: DappListing[];
  userListings: DappListing[];
  builderCredits: number;
  publishedCount: number;
  addListing: (l: DappListing) => void;
  markPublished: () => void;

  // agent conversation
  apiHistory: ApiMessage[];
  messages: UiMessage[];
  agentBusy: boolean;
  pushMessage: (m: UiMessage) => void;
  setAgentBusy: (b: boolean) => void;

  // generated draft
  draft: DappManifest | null;
  draftPublishedLive: boolean;
  simulation: SimulationResult | null;
  setDraft: (m: DappManifest) => void;
  setDraftPublishedLive: (live: boolean) => void;
  setSimulation: (s: SimulationResult) => void;
};

export const useApp = create<AppState>((set, get) => ({
  themeMode: 'light',
  setThemeMode: (mode) => {
    setActivePalette(mode);
    // theme is stored as a raw string (loadThemePreference reads it directly)
    SecureStore.setItemAsync(KEYS.theme, mode).catch(() => {});
    set({ themeMode: mode });
  },

  assistantImmersive: false,
  setAssistantImmersive: (assistantImmersive) => set({ assistantImmersive }),

  verified: false,
  verifiedSimulated: false,
  setVerified: ({ verified, simulated }) => set({ verified, verifiedSimulated: simulated }),

  wallet: null,
  setWallet: (wallet) => set({ wallet }),

  loyalty: LOYALTY_SEED,
  loyaltyOnchain: false,
  addStamp: (ens, points) => {
    const prev = get().loyalty[ens] ?? { punches: 0, points: 0, redeemed: 0 };
    const loyalty = {
      ...get().loyalty,
      [ens]: { ...prev, punches: prev.punches + 1, points: prev.points + points },
    };
    persistJSON(KEYS.loyalty, loyalty);
    set({ loyalty });
  },
  addPoints: (ens, points) => {
    const prev = get().loyalty[ens] ?? { punches: 0, points: 0, redeemed: 0 };
    const loyalty = { ...get().loyalty, [ens]: { ...prev, points: prev.points + points } };
    persistJSON(KEYS.loyalty, loyalty);
    set({ loyalty });
  },
  redeemReward: (ens, cardSize) => {
    const prev = get().loyalty[ens] ?? { punches: 0, points: 0, redeemed: 0 };
    const loyalty = {
      ...get().loyalty,
      [ens]: { ...prev, punches: Math.max(0, prev.punches - cardSize), redeemed: prev.redeemed + 1 },
    };
    persistJSON(KEYS.loyalty, loyalty);
    set({ loyalty });
  },
  spendPoints: (ens, cost, rewardLabel) => {
    const prev = get().loyalty[ens] ?? { punches: 0, points: 0, redeemed: 0 };
    if (prev.points < cost) return false;
    const loyalty = {
      ...get().loyalty,
      [ens]: { ...prev, points: prev.points - cost },
    };
    persistJSON(KEYS.loyalty, loyalty);
    set({ loyalty });
    get().recordActivity({
      ens,
      title: rewardLabel,
      kind: 'redeem',
      points: -cost,
    });
    return true;
  },

  orders: [],
  placeOrder: (o) => {
    const record: OrderRecord = {
      id: Math.random().toString(36).slice(2, 8).toUpperCase(),
      ts: Date.now(),
      ...o,
    };
    const orders = [record, ...get().orders].slice(0, 100);
    persistJSON(KEYS.orders, orders);
    set({ orders });
    return record;
  },

  // activity / receipts feed
  activity: [],
  recordActivity: (e) => {
    const entry: ActivityEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      ...e,
    };
    const activity = [entry, ...get().activity].slice(0, 100);
    persistJSON(KEYS.activity, activity);
    set({ activity });
  },

  // saved / favorite dapps
  savedEns: [],
  toggleSave: (ens) => {
    const cur = get().savedEns;
    const savedEns = cur.includes(ens) ? cur.filter((e) => e !== ens) : [ens, ...cur];
    persistJSON(KEYS.saved, savedEns);
    set({ savedEns });
  },
  isSaved: (ens) => get().savedEns.includes(ens),

  homeShortcuts: DEFAULT_SHORTCUTS,
  addShortcut: (s) => {
    if (get().homeShortcuts.some((x) => x.id === s.id)) return;
    const homeShortcuts = [...get().homeShortcuts, s];
    persistJSON(KEYS.shortcuts, homeShortcuts);
    set({ homeShortcuts });
  },
  removeShortcut: (id) => {
    const homeShortcuts = get().homeShortcuts.filter((x) => x.id !== id);
    persistJSON(KEYS.shortcuts, homeShortcuts);
    set({ homeShortcuts });
  },
  resetShortcuts: () => {
    persistJSON(KEYS.shortcuts, DEFAULT_SHORTCUTS);
    set({ homeShortcuts: DEFAULT_SHORTCUTS });
  },

  // reviews (one per human, keyed by World ID nullifier)
  reviews: {},
  submitReview: (ens, r) => {
    const existing = get().reviews[ens] ?? [];
    // one review per verified human: replace any prior review from the same nullifier
    const next = [r, ...existing.filter((x) => x.nullifier !== r.nullifier)];
    const reviews = { ...get().reviews, [ens]: next };
    persistJSON(KEYS.reviews, reviews);
    set({ reviews });
  },

  // red packets / lucky money
  redPackets: {},
  createRedPacket: ({ from, totalUsd, count, split }) => {
    const id = Math.random().toString(36).slice(2, 8);
    // can't split a pool into more packets than it has cents — clamp so shares
    // always sum to exactly totalUsd and never hit zero (see computeShares).
    const safeCount = Math.max(1, Math.min(Math.round(count), Math.round(totalUsd * 100)));
    const packet: RedPacket = {
      id,
      from,
      totalUsd,
      count: safeCount,
      split,
      shares: computeShares(totalUsd, safeCount, split),
      claims: [],
      createdTs: Date.now(),
    };
    const redPackets = { ...get().redPackets, [id]: packet };
    persistJSON(KEYS.redpackets, redPackets);
    set({ redPackets });
    return id;
  },
  claimRedPacket: (id, nullifier) => {
    const packet = get().redPackets[id];
    if (!packet) return { ok: false, reason: 'not_found' };
    if (packet.claims.some((c) => c.nullifier === nullifier)) return { ok: false, reason: 'already' };
    if (packet.claims.length >= packet.count) return { ok: false, reason: 'empty' };
    const amountUsd = packet.shares[packet.claims.length];
    const updated: RedPacket = {
      ...packet,
      claims: [...packet.claims, { nullifier, amountUsd, ts: Date.now() }],
    };
    const redPackets = { ...get().redPackets, [id]: updated };
    persistJSON(KEYS.redpackets, redPackets);
    set({ redPackets });
    return { ok: true, amountUsd };
  },

  // pay-by-ENS contacts
  contacts: [],
  saveContact: (c) => {
    const contacts = [c, ...get().contacts.filter((x) => x.ens !== c.ens)].slice(0, 30);
    persistJSON(KEYS.contacts, contacts);
    set({ contacts });
  },

  listings: SEED_LISTINGS,
  userListings: [],
  builderCredits: 3,
  publishedCount: 0,
  addListing: (l) => {
    const userListings = [l, ...get().userListings];
    persistJSON(KEYS.listings, userListings);
    set({ userListings, listings: [l, ...get().listings] });
  },
  markPublished: () =>
    set({ builderCredits: get().builderCredits - 1, publishedCount: get().publishedCount + 1 }),

  apiHistory: [],
  messages: [],
  agentBusy: false,
  pushMessage: (m) => set({ messages: [...get().messages, m] }),
  setAgentBusy: (agentBusy) => set({ agentBusy }),

  draft: null,
  draftPublishedLive: false,
  simulation: null,
  setDraft: (draft) => set({ draft }),
  setDraftPublishedLive: (live) => set({ draftPublishedLive: live }),
  setSimulation: (simulation) => set({ simulation }),
}));

export function findListing(ens: string | undefined): DappListing {
  const listings = useApp.getState().listings;
  return listings.find((l) => l.manifest.ensName === ens) ?? listings[0];
}

/** True when a listing with this ENS actually exists (vs. findListing's fallback). */
export function hasListing(ens: string | undefined): boolean {
  return useApp.getState().listings.some((l) => l.manifest.ensName === ens);
}

/** Pure store search: match query against name/description/category/creator/one-liner. */
export function filterListings(listings: DappListing[], query: string): DappListing[] {
  const q = query.trim().toLowerCase();
  if (!q) return listings;
  return listings.filter((l) => {
    const m = l.manifest;
    return (
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.creator.toLowerCase().includes(q) ||
      l.oneLiner.toLowerCase().includes(q)
    );
  });
}

/** Wrap a freshly drafted manifest as a store listing once published. */
export function listingFromManifest(manifest: DappManifest): DappListing {
  const monogram = manifest.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return {
    manifest,
    monogram,
    runtimeTitle: manifest.name,
    oneLiner: manifest.description.split('.')[0] + '.',
    rating: 5.0,
    runs: 0,
    reviews: 0,
    recency: 'Just now',
    featured: false,
    section: 'recent',
  };
}
