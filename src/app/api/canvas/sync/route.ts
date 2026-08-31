import { NextRequest, NextResponse } from "next/server";
import { stripHtml, type CanvasAssignment, type CanvasCourse } from "@/lib/canvas/types";

// Pulls courses and assignments, normalised into Panda's own shape.
//
// Returns data for the client to merge rather than replacing anything itself:
// a sync that fails halfway must never wipe what is already there, and the
// client is the only place that knows what the student has since marked done.

export const runtime = "nodejs";

interface Conn {
  baseUrl: string;
  accessToken: string;
}

function readConnection(req: NextRequest): Conn | null {
  const raw = req.cookies.get("canvas_conn")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.baseUrl === "string" && typeof parsed.accessToken === "string") return parsed;
  } catch {
    // Falls through.
  }
  return null;
}

async function canvasGet<T>(conn: Conn, path: string): Promise<T> {
  const res = await fetch(new URL(path, conn.baseUrl), {
    headers: { Authorization: `Bearer ${conn.accessToken}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`canvas ${res.status}`);
  return res.json() as Promise<T>;
}

export async function POST(req: NextRequest) {
  const conn = readConnection(req);
  if (!conn) {
    return NextResponse.json({ error: "Canvas isn't connected.", needsConnect: true }, { status: 401 });
  }

  try {
    const courses = await canvasGet<CanvasCourse[]>(
      conn,
      "/api/v1/courses?enrollment_state=active&per_page=50",
    );

    // Assignments are fetched per course, in parallel but bounded: a student
    // with eight classes should not fire eight simultaneous requests at a
    // school's Canvas and trip its rate limit.
    const out: { classes: unknown[]; assignments: unknown[] } = { classes: [], assignments: [] };

    for (const course of courses) {
      out.classes.push({
        externalId: String(course.id),
        name: course.name || course.course_code || `Course ${course.id}`,
      });

      try {
        const items = await canvasGet<CanvasAssignment[]>(
          conn,
          `/api/v1/courses/${course.id}/assignments?per_page=50&order_by=due_at`,
        );
        for (const a of items) {
          out.assignments.push({
            externalId: String(a.id),
            classExternalId: String(course.id),
            title: a.name,
            instructions: stripHtml(a.description),
            dueAt: a.due_at ? new Date(a.due_at).getTime() : null,
            points: a.points_possible ?? undefined,
          });
        }
      } catch {
        // One unreadable course should not fail the whole sync. The rest of
        // the student's classes still come back.
      }
    }

    return NextResponse.json({ ...out, syncedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "unauthorized") {
      return NextResponse.json(
        { error: "Canvas signed Panda out. Connect it again.", needsConnect: true },
        { status: 401 },
      );
    }
    if (message === "forbidden") {
      return NextResponse.json(
        { error: "Your school's Canvas didn't allow that. Ask a teacher whether Panda is permitted." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Panda couldn't reach Canvas just now. Nothing was changed." }, { status: 502 });
  }
}
