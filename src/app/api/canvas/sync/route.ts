import { NextRequest, NextResponse } from "next/server";
import { stripHtml, type CanvasAssignment, type CanvasCourse } from "@/lib/canvas/types";
import {
  CanvasAuthError,
  CanvasForbiddenError,
  canvasReader,
  mapLimit,
  needsRefresh,
  readConnection,
  writeConnection,
} from "@/lib/canvas/server";

// Pulls courses and assignments, normalised into Panda's own shape.
//
// Returns data for the client to merge rather than replacing anything itself:
// a sync that fails halfway must never wipe what is already there, and the
// client is the only place that knows what the student has since marked done.
//
// Three things the first version got wrong, and how they are handled now:
//   - Pagination. Canvas pages every list; the Link header is followed (same
//     origin only, and capped) so the sixty-first assignment is not dropped.
//   - Expiry. Access tokens last about an hour. The refresh token is used
//     before the request when the token is due to expire, and once more on a
//     401, and the fresher token goes back in the cookie.
//   - Speed. Courses are read three at a time instead of one after another.

export const runtime = "nodejs";

/** In flight at once. Polite to a school's Canvas and still quick. */
const CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const stored = readConnection(req);
  if (!stored) {
    return NextResponse.json({ error: "Canvas isn't connected.", needsConnect: true }, { status: 401 });
  }

  const reader = canvasReader(stored);

  try {
    if (needsRefresh(stored)) await reader.refreshNow();

    const courses = await reader.all<CanvasCourse>("/api/v1/courses?enrollment_state=active&per_page=100");

    const perCourse = await mapLimit(courses, CONCURRENCY, async (course) => {
      try {
        return await reader.all<CanvasAssignment>(
          `/api/v1/courses/${course.id}/assignments?per_page=100&order_by=due_at`,
        );
      } catch (err) {
        // A lost session is everyone's problem and goes to the outer handler.
        // One unreadable course is not: the rest of the classes still come back.
        if (err instanceof CanvasAuthError) throw err;
        return [] as CanvasAssignment[];
      }
    });

    const classes = courses.map((course) => ({
      externalId: String(course.id),
      name: course.name || course.course_code || `Course ${course.id}`,
    }));
    const assignments = courses.flatMap((course, i) =>
      perCourse[i].map((a) => ({
        externalId: String(a.id),
        classExternalId: String(course.id),
        title: a.name,
        instructions: stripHtml(a.description),
        dueAt: a.due_at ? new Date(a.due_at).getTime() : null,
        points: a.points_possible ?? undefined,
      })),
    );

    const res = NextResponse.json({ classes, assignments, syncedAt: Date.now() });
    if (reader.refreshed()) writeConnection(res, { ...reader.connection(), lastSyncedAt: Date.now() });
    return res;
  } catch (err) {
    if (err instanceof CanvasAuthError) {
      return NextResponse.json(
        { error: "Canvas signed Panda out. Connect it again.", needsConnect: true },
        { status: 401 },
      );
    }
    if (err instanceof CanvasForbiddenError) {
      return NextResponse.json(
        { error: "Your school's Canvas didn't allow that. Ask a teacher whether Panda is permitted." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Panda couldn't reach Canvas just now. Nothing was changed." }, { status: 502 });
  }
}
