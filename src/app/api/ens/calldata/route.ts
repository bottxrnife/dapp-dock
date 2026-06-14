import { NextResponse } from "next/server";
import {
  agentRecordList,
  setAddrCalldata,
  setAgentRecordsCalldata,
  setSubnameCalldata,
  setTextCalldata,
} from "@/lib/ensWrite";

/**
 * Generate UNSIGNED ENS calldata { to, data, value } for the caller to sign +
 * broadcast (the ens-cli pattern). No keys server-side; nothing hard-coded —
 * the resolver is read live and the calldata is encoded from the inputs.
 */
export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const op = body.op;
  try {
    if (op === "setText" && body.name && body.key) {
      return NextResponse.json(await setTextCalldata(body.name, body.key, body.value ?? ""));
    }
    if (op === "setAddr" && body.name && body.address) {
      return NextResponse.json(await setAddrCalldata(body.name, body.address));
    }
    if (op === "agentRecords" && body.name) {
      const recs = agentRecordList({
        context: body.context,
        mcp: body.mcp,
        a2a: body.a2a,
        web: body.web,
        registrationKey: body.registrationKey,
      });
      if (recs.length === 0) return NextResponse.json({ error: "no records to set" }, { status: 400 });
      return NextResponse.json(await setAgentRecordsCalldata(body.name, recs));
    }
    if (op === "subname" && body.parent && body.label && body.owner) {
      return NextResponse.json(await setSubnameCalldata(body.parent, body.label, body.owner, body.resolver));
    }
    return NextResponse.json({ error: "unknown or incomplete op" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
