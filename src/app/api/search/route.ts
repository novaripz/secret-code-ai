import { NextRequest, NextResponse } from "next/server";

// Web search that stays inside Pandai.
//
// Google and Bing both refuse to be put in an iframe, so framing them is not
// an option. Google Programmable Search is the supported way to run a real
// search from your own page: it returns JSON, which we render ourselves.
//
// Setup: make an engine at programmablesearchengine.google.com (set it to
// search the whole web), then set GOOGLE_CSE_ID and GOOGLE_CSE_KEY. The key
// can be the same Google API key used elsewhere, as long as the "Custom
// Search API" is enabled on that project.

export const runtime = "nodejs";

export interface SearchResult {
  title: string;
  link: string;
  displayLink: string;
  snippet: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const id = process.env.GOOGLE_CSE_ID;
  const key = process.env.GOOGLE_CSE_KEY || process.env.GEMINI_API_KEY;

  if (!id || !key) {
    return NextResponse.json(
      {
        error:
          "Search isn't set up yet. Add GOOGLE_CSE_ID and GOOGLE_CSE_KEY, then search will work here.",
        needsSetup: true,
      },
      { status: 503 },
    );
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", id);
  url.searchParams.set("q", q);
  url.searchParams.set("num", "8");
  // Keep results appropriate — this is used at school.
  url.searchParams.set("safe", "active");

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      const message = data?.error?.message ?? "Search failed.";
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const results: SearchResult[] = (data.items ?? []).map(
      (i: { title?: string; link?: string; displayLink?: string; snippet?: string }) => ({
        title: i.title ?? "",
        link: i.link ?? "",
        displayLink: i.displayLink ?? "",
        snippet: i.snippet ?? "",
      }),
    );

    return NextResponse.json({ results, total: data.searchInformation?.formattedTotalResults ?? null });
  } catch (err) {
    console.error("[api/search] failed:", err);
    return NextResponse.json({ error: "Search request failed." }, { status: 500 });
  }
}
