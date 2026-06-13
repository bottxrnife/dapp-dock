/**
 * links_service — shared deep-link parsing + builders.
 *
 * Scan is Alipay-style: one QR can trigger many things. `routeForPayload` maps a
 * scanned payload to an in-app route:
 *   - dappdock://detail|runtime|redpacket/<seg>  → that screen
 *   - dappdock://pay?to=|?ens=|/<who>            → Pay (pre-filled recipient)
 *   - dappdock://checkin/<dappEns>               → run that dapp (check-in / interaction)
 *   - a raw EVM address (0x…)                    → Pay that wallet
 *   - a bare ENS: a store dapp opens its page; anyone else → Pay that person
 * Reused by the in-app Scan screen and the share-a-dapp QR generator.
 */
import { useApp } from '../state/store';

export type ResolvedRoute = { path: string; known: boolean };

const KINDS = ['detail', 'runtime', 'redpacket'] as const;

function isDapp(ens: string): boolean {
  return useApp.getState().listings.some((l) => l.manifest.ensName === ens);
}

export function routeForPayload(data: string): ResolvedRoute | null {
  const raw = data.trim();

  // Pay QR: dappdock://pay?to=X | ?ens=X | /X  → the Pay screen (reads ?ens=).
  const pay = raw.match(/^dappdock:\/\/pay(?:\/([^?#]+)|\?(?:to|ens)=([^&#]+))/i);
  if (pay) {
    const who = decodeURIComponent(pay[1] ?? pay[2] ?? '').toLowerCase();
    return { path: who ? `/pay?ens=${encodeURIComponent(who)}` : '/pay', known: true };
  }

  // Check-in / interaction QR: run the dapp it points at.
  const checkin = raw.match(/^dappdock:\/\/checkin\/([a-z0-9.\-]+)/i);
  if (checkin) {
    const seg = checkin[1].toLowerCase();
    return { path: `/runtime/${seg}`, known: isDapp(seg) };
  }

  // detail | runtime | redpacket
  const deepLink = raw.match(new RegExp(`^dappdock://(${KINDS.join('|')})/([a-zA-Z0-9.\\-]+)`, 'i'));
  if (deepLink) {
    const kind = deepLink[1].toLowerCase();
    // ENS-bearing kinds are lowercased; red-packet ids stay verbatim.
    const seg = kind === 'redpacket' ? deepLink[2] : deepLink[2].toLowerCase();
    return { path: `/${kind}/${seg}`, known: true };
  }

  // Raw EVM address → pay that wallet.
  const addr = raw.match(/^(0x[a-fA-F0-9]{40})$/);
  if (addr) return { path: `/pay?ens=${addr[1]}`, known: true };

  // Bare ENS: a store dapp opens its page; anyone else is someone to pay.
  const ens = raw.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth)\b/i);
  if (ens) {
    const name = ens[1].toLowerCase();
    return isDapp(name)
      ? { path: `/detail/${name}`, known: true }
      : { path: `/pay?ens=${name}`, known: true };
  }
  return null;
}

/** Shareable deep link that reopens a dapp's detail page. */
export function shareLink(ens: string): string {
  return `dappdock://detail/${ens}`;
}
