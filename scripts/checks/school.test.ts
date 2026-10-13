// The school side: Canvas safety, due dates, the planner and the student tools.
//
// Run with `npx tsx scripts/checks/school.test.ts`. No framework: a few
// asserted facts and a non-zero exit, the same shape as the other checks.
//
// Everything here is pure logic, the part that can be wrong without a screen.
// Times are built from local dates (not UTC strings) because every rule under
// test speaks in the student's own days: "due tomorrow" means their tomorrow.

import { allowedCanvasBase, allowedCanvasBases, nextPageUrl } from "../../src/lib/canvas/types";

let failures = 0;
function ok(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}
function eq<T>(name: string, actual: T, expected: T): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(name, same, same ? "" : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------
// Canvas: the client secret only ever goes to an allowed host
// ---------------------------------------------------------------------------

console.log("\nCanvas allowlist");

const ALLOW = "myschool.instructure.com, https://other.instructure.com/ ,not a host";
eq("the allowlist is normalised and junk is dropped", allowedCanvasBases(ALLOW), [
  "https://myschool.instructure.com",
  "https://other.instructure.com",
]);
eq("no setting means nothing is allowed", allowedCanvasBases(undefined), []);
eq("an empty setting means nothing is allowed", allowedCanvasBases(""), []);
eq("a listed host is allowed, however it is typed", allowedCanvasBase("MySchool.Instructure.com/", ALLOW), "https://myschool.instructure.com");
eq("a path on a listed host still means that host", allowedCanvasBase("https://myschool.instructure.com/courses/1", ALLOW), "https://myschool.instructure.com");
eq("an unlisted host is refused", allowedCanvasBase("https://evil.example.com", ALLOW), null);
eq("a look-alike suffix is refused", allowedCanvasBase("https://myschool.instructure.com.evil.example", ALLOW), null);
eq("plain http is refused even for a listed host", allowedCanvasBase("http://myschool.instructure.com", ALLOW), null);
eq("with no allowlist, even a real-looking host is refused", allowedCanvasBase("https://myschool.instructure.com", undefined), null);

console.log("\nCanvas pagination");

const BASE = "https://myschool.instructure.com";
const link =
  '<https://myschool.instructure.com/api/v1/courses?page=1&per_page=100>; rel="current",' +
  '<https://myschool.instructure.com/api/v1/courses?page=2&per_page=100>; rel="next",' +
  '<https://myschool.instructure.com/api/v1/courses?page=1&per_page=100>; rel="first"';
eq("the next page is read from the Link header", nextPageUrl(link, BASE), `${BASE}/api/v1/courses?page=2&per_page=100`);
eq("no next link means the last page", nextPageUrl('<https://myschool.instructure.com/x?page=3>; rel="last"', BASE), null);
eq("no header means one page", nextPageUrl(null, BASE), null);
eq(
  "a next link to another host is not followed (it would carry the token)",
  nextPageUrl('<https://evil.example.com/steal?page=2>; rel="next"', BASE),
  null,
);

// ---------------------------------------------------------------------------

console.log("");
if (failures > 0) {
  console.log(`${failures} school check(s) failed.`);
  process.exit(1);
}
console.log("All school checks passed.");
