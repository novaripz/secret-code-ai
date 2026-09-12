import { NextRequest, NextResponse } from "next/server";
import { guardRequest } from "@/lib/security/apiGuard";
import { MAX_SMALL_BODY_BYTES, readJsonBody } from "@/lib/security/requestLimits";

// Student reports.
//
// Recorded, never adjudicated. Panda does not decide whether something was
// discrimination or whether a rule is unfair — it takes the report, says it
// has been taken, and leaves the judgement to a person. Deciding would be both
// beyond what it can know and beyond what it should do.
//
// Storage today is the server log, which is honest about what this is: there
// is no database yet, so there is nowhere durable to put it. When one exists
// this writes a row and a teacher or admin sees a queue. What matters now is
// that the student is not stuck with no way to say something is wrong.

export const runtime = "nodejs";

// Reporting is rare by nature — a student files one when something went wrong,
// not several a minute — so the limit is low. It is still worth having: the
// route writes to the server log, and an unbounded writer is a way to fill a
// log budget and bury real reports under noise. The message is deliberately
// gentle; someone hitting this may already be upset.
const REPORT_USER_RULE = { limit: 10, windowMs: 5 * 60_000 };
const REPORT_GUEST_RULE = { limit: 5, windowMs: 5 * 60_000 };

const CATEGORIES = new Set([
  "wrongInfo", "disrespectful", "assignmentWrong", "unexpected",
  "languageMissing", "unfair", "other",
]);

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, {
    route: "report",
    user: REPORT_USER_RULE,
    guest: REPORT_GUEST_RULE,
    busyMessage: "Panda already has your reports. Give it a few minutes before sending more.",
  });
  if (!guard.ok) return guard.response;

  const read = await readJsonBody(req, MAX_SMALL_BODY_BYTES);
  if (!read.ok) return read.response;
  const body = (read.body ?? {}) as { category?: unknown; details?: unknown };

  const category = typeof body.category === "string" && CATEGORIES.has(body.category)
    ? body.category
    : "other";
  const details = typeof body.details === "string" ? body.details.slice(0, 4000) : "";

  // Deliberately no user id, no chat transcript. A report should not quietly
  // hand over the conversation that prompted it.
  console.warn("[report]", JSON.stringify({ category, details, at: new Date().toISOString() }));

  return NextResponse.json({ ok: true });
}
