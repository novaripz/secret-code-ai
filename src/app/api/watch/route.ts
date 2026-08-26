import { NextRequest, NextResponse } from "next/server";

// Video search for the Watch tab.
//
// youtube.com itself cannot be framed, and framing it would also hand over the
// whole site to roam around in. Instead we search with the YouTube Data API and
// play results through the embedded player, so a student can find and watch a
// video without ever leaving Pandai.
//
// Uses YOUTUBE_API_KEY, falling back to GEMINI_API_KEY — an AI Studio key often
// works here already, as long as "YouTube Data API v3" is enabled on the
// project behind it.

export const runtime = "nodejs";

export interface Video {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  publishedAt: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "study help";

  const key = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Watch isn't set up yet. Add YOUTUBE_API_KEY and videos will show up here.", needsSetup: true },
      { status: 503 },
    );
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("key", key);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", q);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "12");
  // Embeddable only, so nothing in the list dead-ends on "watch on YouTube".
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "strict");

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      const message = data?.error?.message ?? "Video search failed.";
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const videos: Video[] = (data.items ?? [])
      .filter((i: { id?: { videoId?: string } }) => i.id?.videoId)
      .map((i: {
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
      }) => ({
        id: i.id.videoId,
        title: i.snippet.title,
        channel: i.snippet.channelTitle,
        thumbnail: i.snippet.thumbnails?.medium?.url ?? "",
        publishedAt: i.snippet.publishedAt,
      }));

    return NextResponse.json({ videos });
  } catch (err) {
    console.error("[api/watch] failed:", err);
    return NextResponse.json({ error: "Video search failed." }, { status: 500 });
  }
}
