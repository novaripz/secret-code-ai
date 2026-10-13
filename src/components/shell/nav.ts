import type { StringKey } from "@/lib/i18n";
import {
  BookIcon,
  ChatIcon,
  CalendarCheckIcon,
  HammerIcon,
  SettingsIcon,
  VideoIcon,
  type IconComponent,
} from "@/components/icons";

// The tabs down the side. Everything a student needs lives in here, so they
// never have to leave for a browser tab that has the rest of the internet in it.
// Shared by the sidebar, the header and the command palette, so the three can
// never disagree about what a section is called or where it lives.

export interface NavEntry {
  href: string;
  label: StringKey;
  icon: IconComponent;
}

export const NAV: NavEntry[] = [
  { href: "/", label: "nav.chat", icon: ChatIcon },
  { href: "/classes", label: "nav.classes", icon: BookIcon },
  { href: "/plan", label: "nav.plan", icon: CalendarCheckIcon },
  { href: "/watch", label: "nav.watch", icon: VideoIcon },
  { href: "/build", label: "nav.build", icon: HammerIcon },
  { href: "/settings", label: "nav.settings", icon: SettingsIcon },
];

/**
 * Whether `href` is the section the student is in.
 *
 * Prefix, not equality: `/classes/abc/123` is still Classes, and a nav that
 * goes blank the moment you open a class is a nav that has lost you. The root
 * is the exception — every path starts with "/".
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Which nav entry names the page currently open, for the header. */
export function sectionFor(pathname: string): NavEntry | undefined {
  return NAV.find((n) => isActive(n.href, pathname));
}

/**
 * The routes drawn inside the shell. The build workspace (/project) is a
 * full-screen editor with its own chrome, and /legal has to open signed out
 * with nothing of anyone's around it, so neither is here.
 */
export function usesShell(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return ["/classes", "/plan", "/watch", "/build", "/settings", "/teacher"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
