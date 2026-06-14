import { NextResponse } from "next/server";
import { getFullProfile, lookupAddress, verifyAgentRegistration } from "@/lib/ens";

/** Live ENS profile (address, resolver, avatar, text records, ENSIP-26 agent
 *  records, forward/reverse verification). Pass `name=` to resolve a name, or
 *  `address=` to reverse-resolve a wallet to its primary name first. Optional
 *  ENSIP-25 registry check via `agentId=`. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let name = searchParams.get("name");
  const address = searchParams.get("address");

  if (!name && address) {
    const primary = await lookupAddress(address);
    if (!primary) return NextResponse.json({ profile: null, address, primary: null });
    name = primary;
  }
  if (!name) return NextResponse.json({ error: "name or address required" }, { status: 400 });

  const profile = await getFullProfile(name);
  if (!profile) return NextResponse.json({ error: "invalid ENS name" }, { status: 400 });
  const agentId = searchParams.get("agentId");
  const registration = agentId ? await verifyAgentRegistration(name, agentId) : null;
  return NextResponse.json({ profile, registration });
}
