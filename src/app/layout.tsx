import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The wordmark only. Geist is the interface face; the logo wants something
// with more character standing next to it.
const wordmark = Space_Grotesk({
  variable: "--font-wordmark",
  weight: ["500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panda — chat, build, and ship",
  description: "Chat with Panda, who knows you, drop in files and screenshots, and build real projects in your browser.",
};

// Next already emits a sane default viewport tag; this restates it only to add
// the two parts that matter on a phone.
//
// `interactiveWidget: "resizes-content"` is the important one. By default the
// on-screen keyboard overlays the page without changing the layout viewport,
// so a `100dvh` app column stays full height and the composer ends up behind
// the keyboard. Asking for the CONTENT to be resized makes dvh shrink to the
// space actually left, which is what keeps the input and the last message on
// screen. Chromium honours it; iOS Safari does not, and the composer's own
// focus handler covers that case.
//
// `userScalable` is deliberately NOT set to false. Blocking pinch-zoom is the
// single most common accessibility failure on a phone, and a student who wants
// a closer look at a diagram is entitled to one.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  // Draw into the notch area; the shell pads itself back out with env() insets.
  viewportFit: "cover",
};

// Applies the saved theme before first paint so a light-mode user never sees a
// dark flash (and vice versa). The palette list is duplicated here on purpose:
// this runs before any module loads, so it cannot import THEMES from the store.
// "system", and anyone who has never chosen, follow prefers-color-scheme; dark
// is the fallback when nothing is saved.
//
// The profile key carries the signed-in account's id (see `accountScope` in
// useAuthStore), so the script reads the account first. It used to read only
// the signed-out key, which meant every signed-in student got the guest's
// theme — or dark — for a frame, then a flash to their own. The text size,
// motion settings and language go on <html> here too, for the same reason.
const THEME_SCRIPT = `(function(){var r=document.documentElement;try{var a=localStorage.getItem("sca:account:v1");var id=a?JSON.parse(a).id:null;var k="sca:profile:v1"+(typeof id==="string"&&id?":"+id:"");var s=localStorage.getItem(k);var p=s?JSON.parse(s):{};var t=p.theme;var ok=["dark","light","ocean","forest","sepia"];var d=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";r.dataset.theme=ok.indexOf(t)>=0?t:(t==="system"||!t?d:"dark");var ap=p.appearance||{};if(ap.textSize)r.dataset.textSize=ap.textSize;r.dataset.pandaMotion=ap.pandaMotion===false?"off":"on";r.dataset.reduceMotion=ap.reduceMotion?"on":"off";var l=p.languages&&p.languages.interface;if(typeof l==="string"&&/^[a-z]{2,3}$/.test(l)){r.lang=l;r.dir=l==="ar"?"rtl":"ltr";}}catch(e){r.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script above rewrites data-theme, lang and
    // dir on this element before React hydrates, on purpose. Without it every
    // non-dark or non-English student got a hydration warning on every load.
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${wordmark.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-[var(--bg)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
