import type { Metadata } from "next";
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
  description: "Chat with an AI that knows you, drop in files and screenshots, and build real projects in your browser.",
};

// Applies the saved theme before first paint so a light-mode user never sees a
// dark flash (and vice versa). Dark is the default when nothing is saved.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("sca:profile:v1");var t=s?JSON.parse(s).theme:null;document.documentElement.dataset.theme=t==="light"?"light":"dark";}catch(e){document.documentElement.dataset.theme="dark";}})();`;

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
