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
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("sca:profile:v1");var t=s?JSON.parse(s).theme:null;var ok=["dark","light","ocean","forest","sepia"];var d=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=ok.indexOf(t)>=0?t:(t==="system"||!t?d:"dark");}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${geistSans.variable} ${geistMono.variable} ${wordmark.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-[var(--bg)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
