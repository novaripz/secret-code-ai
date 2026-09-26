// Headless-browser checks for web projects: load the real preview, collect
// console errors and uncaught exceptions, and take a screenshot. Uses
// playwright-core with whatever Chromium the server has; if there is none,
// callers are told the check was skipped rather than that it passed.

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findChromium(): string | undefined {
  const env = process.env.CHROMIUM_PATH;
  if (env && existsSync(env)) return env;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers"].filter(Boolean) as string[];
  for (const root of roots) {
    const direct = path.join(root, "chromium");
    if (isFile(direct)) return direct;
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      const candidate = path.join(root, dir, "chrome-linux", dir.includes("headless_shell") ? "headless_shell" : "chrome");
      if (isFile(candidate)) return candidate;
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) if (existsSync(p)) return p;
  return undefined;
}

export interface SmokeResult {
  ran: boolean;
  reason?: string;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  title?: string;
  screenshot?: Uint8Array;
  durationMs: number;
}

export async function smokeTest(url: string, opts: { waitMs?: number; viewport?: { width: number; height: number } } = {}): Promise<SmokeResult> {
  const { authEnabled, createSessionToken, SESSION_COOKIE } = await import("./auth");
  const started = Date.now();
  const executablePath = findChromium();
  if (!executablePath) {
    return { ran: false, reason: "No Chromium on this server (set CHROMIUM_PATH)", consoleErrors: [], pageErrors: [], failedRequests: [], durationMs: 0 };
  }
  let pw: typeof import("playwright-core");
  try {
    pw = await import("playwright-core");
  } catch {
    return { ran: false, reason: "playwright-core is not installed", consoleErrors: [], pageErrors: [], failedRequests: [], durationMs: 0 };
  }
  const browser = await pw.chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 800 } });
    if (authEnabled()) await context.addCookies([{ name: SESSION_COOKIE, value: await createSessionToken(), url }]);
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    // The browser asks for /favicon.ico on its own; that is not the app's request.
    const isFavicon = (u: string) => /\/favicon\.ico(\?|$)/.test(u);
    page.on("console", (m) => {
      if (m.type() === "error" && !isFavicon(m.location().url ?? "")) consoleErrors.push(m.text().slice(0, 500));
    });
    page.on("pageerror", (e) => pageErrors.push(`${e.name}: ${e.message}`.slice(0, 500)));
    page.on("requestfailed", (r) => {
      if (!isFavicon(r.url())) failedRequests.push(`${r.url()} (${r.failure()?.errorText ?? "failed"})`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !isFavicon(r.url())) failedRequests.push(`${r.url()} (HTTP ${r.status()})`);
    });
    await page.goto(url, { waitUntil: "load", timeout: 20_000 });
    await page.waitForTimeout(opts.waitMs ?? 1500);
    const title = await page.title();
    const screenshot = new Uint8Array(await page.screenshot({ type: "png" }));
    return { ran: true, consoleErrors, pageErrors, failedRequests, title, screenshot, durationMs: Date.now() - started };
  } finally {
    await browser.close();
  }
}
