/**
 * onchain_service — read the user's loyalty from ENS text records (sponsor: ENS).
 *
 * This is the "Most Creative Use of ENS" pattern: arbitrary app state (a loyalty
 * punch card) is stored as a verifiable credential inside an ENSIP-5 text record,
 * keyed off the user's portable ENS identity rather than a private database.
 *
 * Pure viem ENS, no third-party subname service: reverse-resolve the wallet to
 * its primary ENS name (via the mainnet Universal Resolver), then read the
 * `dappdock.loyalty` text record (JSON map of dappEns → { punches, points,
 * redeemed }). Users opt in by setting that record on their own name (e.g. in
 * the ENS manager app, or any ENSIP-5 resolver / CCIP-Read gateway they control)
 * — the in-app burner wallet can't write records on a name it doesn't own
 * without an on-chain transaction, so the local SecureStore cache stays the
 * writable source of truth and ENS is the read-through identity overlay. No API
 * key; safe no-op when the wallet has no primary name or no such record.
 */
import type { LoyaltyRecord } from '../state/store';
import { getTextRecord, lookupAddress } from './identity';

export const LOYALTY_RECORD_KEY = 'dappdock.loyalty';

type LoyaltyMap = Record<string, LoyaltyRecord>;

/**
 * Read the user's loyalty map from their primary ENS name's `dappdock.loyalty`
 * text record. Returns null when the wallet has no primary ENS name, no record,
 * or anything fails (the caller keeps using the local cache).
 */
export async function readLoyalty(address: string): Promise<LoyaltyMap | null> {
  if (!address) return null;
  try {
    const name = await lookupAddress(address);
    if (!name) return null;
    const raw = await getTextRecord(name, LOYALTY_RECORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Keep only well-formed records so a malformed/legacy value can't poison the
    // store (e.g. `{ ens: 5 }` would make addStamp's `prev.punches + 1` → NaN).
    const clean: LoyaltyMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const r = v as Partial<LoyaltyRecord> | null;
      if (
        r &&
        typeof r === 'object' &&
        typeof r.punches === 'number' &&
        typeof r.points === 'number' &&
        typeof r.redeemed === 'number'
      ) {
        clean[k] = { punches: r.punches, points: r.points, redeemed: r.redeemed };
      }
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}
