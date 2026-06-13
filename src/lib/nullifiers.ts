/**
 * One-per-human enforcement (World ID Track B): a used-nullifier store keyed by
 * (action, nullifier). In-memory for the hackathon — fine for a single Node
 * process / demo. Production should back this with a real KV/DB and a
 * UNIQUE(action, nullifier) constraint (see the World docs schema).
 */
const used = new Set<string>();

function key(action: string, nullifier: string): string {
  let dec = nullifier;
  try {
    dec = BigInt(nullifier).toString(); // normalize hex/casing → decimal
  } catch {
    /* keep raw */
  }
  return `${action}:${dec}`;
}

export function isUsed(action: string, nullifier: string): boolean {
  return used.has(key(action, nullifier));
}

export function markUsed(action: string, nullifier: string): void {
  used.add(key(action, nullifier));
}
