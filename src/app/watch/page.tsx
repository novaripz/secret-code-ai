import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WatchApp, WatchFallback } from "@/components/watch/WatchApp";
import "@/styles/watch.css";

// Watch: a school-safe, YouTube-shaped place to find and watch videos.
//
// Everything lives on this one route and is chosen by the address bar
// (?q=, ?v=, ?list=, ?c=), so Back, reload and shared links all work. The part
// that reads the address bar sits inside Suspense, as useSearchParams needs: the
// shell around it can render straight away while the view itself waits for the
// URL on the client.

export default function WatchPage() {
  return (
    <AppShell>
      <Suspense fallback={<WatchFallback />}>
        <WatchApp />
      </Suspense>
    </AppShell>
  );
}
