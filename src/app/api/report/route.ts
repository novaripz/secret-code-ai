import { NextRequest, NextResponse } from "next/server";

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

const CATEGORIES = new Set([
  "wrongInfo", "disrespectful", "assignmentWrong", "unexpected",
  "languageMissing", "unfair", "other",
]);

export async function POST(req: NextRequest) {
  let body: { category?: unknown; details?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const category = typeof body.category === "string" && CATEGORIES.has(body.category)
    ? body.category
    : "other";
  const details = typeof body.details === "string" ? body.details.slice(0, 4000) : "";

  // Deliberately no user id, no chat transcript. A report should not quietly
  // hand over the conversation that prompted it.
  console.warn("[report]", JSON.stringify({ category, details, at: new Date().toISOString() }));

  return NextResponse.json({ ok: true });
}
