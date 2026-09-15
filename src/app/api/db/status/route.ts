import { NextResponse } from "next/server";

// Which parts of the schema this database actually has.
//
// Migrations are applied by a human pasting SQL into a console, so "did 0004
// ever run" is a real question with no reliable answer anywhere. Skipping one
// is invisible until a screen fails: a missing column surfaces as a query error
// halfway into a feature, and the person reading it has no way to tell a bug
// from an unapplied migration.
//
// So this asks the database directly. It reads nothing but column and function
// names from the catalog -- no student data passes through it, which is why it
// can be public.

export const runtime = "nodejs";

interface Check {
  migration: string;
  what: string;
  /** A column this migration adds, as "table.column". */
  column?: [table: string, column: string];
  /** A function this migration defines. */
  fn?: string;
}

const CHECKS: Check[] = [
  { migration: "0002", what: "learning signals", column: ["struggle_signals", "id"] },
  { migration: "0002", what: "teacher codes", fn: "redeem_teacher_code" },
  { migration: "0004", what: "assignment priority", column: ["assignments", "teacher_priority"] },
  { migration: "0005", what: "gradebook", column: ["grades", "points"] },
  { migration: "0005", what: "assignment categories", column: ["assignments", "category_id"] },
  { migration: "0005", what: "assignment resources", column: ["assignments", "resources"] },
  { migration: "0008", what: "leaving teacher mode", fn: "leave_teacher_mode" },
  { migration: "0009", what: "teacher-only class creation", fn: "is_teacher" },
];

async function ask(url: string, key: string, path: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    // A missing column or function is a 404 or a 42703/42883 body. Anything
    // else -- including the permission denial an anonymous caller gets on a
    // table that exists -- means the thing is there.
    if (res.status === 404) return false;
    const body = await res.text();
    return !/does not exist|PGRST202|PGRST204|42703|42883/.test(body);
  } catch {
    return false;
  }
}

export async function GET() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { configured: false, note: "SUPABASE_URL and SUPABASE_ANON_KEY are not set." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const results = await Promise.all(
    CHECKS.map(async (check) => {
      const applied = check.column
        ? await ask(url, key, `/rest/v1/${check.column[0]}?select=${check.column[1]}&limit=1`)
        : await ask(url, key, `/rest/v1/rpc/${check.fn}`);
      return { migration: check.migration, what: check.what, applied };
    }),
  );

  const missing = results.filter((r) => !r.applied);

  return NextResponse.json(
    {
      configured: true,
      allApplied: missing.length === 0,
      // Named so the fix is obvious without reading the rest.
      runThese: [...new Set(missing.map((m) => m.migration))].sort(),
      checks: results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
