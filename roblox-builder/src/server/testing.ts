// "Run tests" for a project: everything that can actually be executed or
// verified on this server, reported case by case. A check that cannot run
// here (no Roblox runtime, no Rojo installed, no browser) is reported as
// skipped with the reason, never as passed.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Diagnostic } from "@/core/diagnostics";
import { parseLuau } from "@/core/luau/parser";
import { textOf, type FileMap } from "@/core/project/files";
import { parseRbxmx, writeRobloxXml } from "@/core/roblox/rbxmx";
import { isRobloxKind } from "@/core/roblox/template";
import { validateRobloxProject, type ValidationReport } from "@/core/roblox/validate";
import { smokeTest } from "./browser";
import { isInstalled, runCommand } from "./exec";
import { DATA_DIR, getProject, readTree, treeDir } from "./store";

export interface TestCase {
  id: string;
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail?: string;
  durationMs: number;
}

export interface TestReport {
  projectKind: string;
  startedAt: number;
  durationMs: number;
  cases: TestCase[];
  passed: number;
  failed: number;
  skipped: number;
  warned: number;
  diagnostics?: Diagnostic[];
  screenshotPath?: string;
}

async function timed(id: string, name: string, fn: () => Promise<Omit<TestCase, "id" | "name" | "durationMs">>): Promise<TestCase> {
  const t = Date.now();
  try {
    const r = await fn();
    return { id, name, ...r, durationMs: Date.now() - t };
  } catch (err) {
    return { id, name, status: "fail", detail: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t };
  }
}

export interface TestOptions {
  /** Absolute origin of this server, for loading the web preview in a browser. */
  origin?: string;
  onOutput?: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function runProjectTests(projectId: string, branch: string, opts: TestOptions = {}): Promise<TestReport> {
  const started = Date.now();
  const meta = await getProject(projectId);
  const files = await readTree(projectId, branch);
  const cases: TestCase[] = [];
  let diagnostics: Diagnostic[] | undefined;
  let screenshotPath: string | undefined;

  if (isRobloxKind(meta.kind)) {
    let report: ValidationReport | undefined;
    cases.push(await timed("luau-syntax", "Luau syntax (every script parses)", async () => {
      const scripts = [...files.keys()].filter((p) => /\.(luau|lua)$/.test(p));
      const errors: string[] = [];
      for (const p of scripts) {
        const r = parseLuau(textOf(files, p) ?? "");
        if (r.error) errors.push(`${p}:${r.error.line}:${r.error.col} ${r.error.message}`);
      }
      return errors.length
        ? { status: "fail", detail: errors.slice(0, 20).join("\n") }
        : { status: "pass", detail: `${scripts.length} scripts parsed` };
    }));
    cases.push(await timed("compat", "Roblox compatibility check", async () => {
      report = validateRobloxProject(files);
      diagnostics = report.diagnostics;
      const { error, warning } = report.summary;
      return {
        status: error ? "fail" : warning ? "warn" : "pass",
        detail: `${error} errors, ${warning} warnings across ${report.stats.instances} instances, ${report.stats.scripts} scripts`,
      };
    }));
    if (report) {
      for (const g of report.checks) {
        cases.push({
          id: `compat-${g.id}`,
          name: `  ${g.label}`,
          status: g.status === "fail" ? "fail" : g.status === "warn" ? "warn" : "pass",
          detail: g.errors || g.warnings ? `${g.errors} errors, ${g.warnings} warnings` : undefined,
          durationMs: 0,
        });
      }
    }
    cases.push(await timed("export", "Place export round-trip (.rbxlx)", async () => {
      if (!report) throw new Error("Validation did not run");
      const root = report.build.root;
      if (root.className !== "DataModel") {
        const xml = writeRobloxXml(root);
        const back = parseRbxmx(xml.xml);
        if (back.error) return { status: "fail", detail: back.error };
        return { status: "pass", detail: `model with ${xml.instanceCount} instances` };
      }
      const xml = writeRobloxXml(root, { place: true });
      const back = parseRbxmx(xml.xml);
      if (back.error) return { status: "fail", detail: back.error };
      const count = (n: { children: unknown[] }): number => 1 + (n.children as { children: unknown[] }[]).reduce((a, c) => a + count(c), 0);
      const total = back.roots.reduce((a, r) => a + count(r), 0);
      if (total !== xml.instanceCount) return { status: "fail", detail: `wrote ${xml.instanceCount} instances, read back ${total}` };
      return { status: xml.warnings.length ? "warn" : "pass", detail: xml.warnings.join("\n") || `${total} instances, ${(xml.xml.length / 1024).toFixed(1)} KB` };
    }));
    cases.push(await timed("rojo", "rojo build", async () => {
      if (!isInstalled("rojo")) return { status: "skip", detail: "Rojo is not installed on this server; the built-in exporter was used instead" };
      const r = await runCommand("rojo build default.project.json -o .rbuild/out.rbxlx", { cwd: treeDir(projectId, branch), timeoutMs: 120_000, signal: opts.signal, onOutput: (_s, c) => opts.onOutput?.(c) });
      await fs.rm(path.join(treeDir(projectId, branch), ".rbuild"), { recursive: true, force: true });
      return r.exitCode === 0 ? { status: "pass", detail: r.stdout.trim().slice(-500) } : { status: "fail", detail: (r.stderr || r.stdout).slice(-2000) };
    }));
    cases.push(await timed("selene", "selene lint", async () => {
      if (!isInstalled("selene")) return { status: "skip", detail: "selene is not installed on this server; the built-in Luau analyzer ran instead" };
      const r = await runCommand("selene src", { cwd: treeDir(projectId, branch), timeoutMs: 120_000, signal: opts.signal });
      return r.exitCode === 0 ? { status: "pass", detail: r.stdout.slice(-500) } : { status: "fail", detail: (r.stdout + r.stderr).slice(-3000) };
    }));
    const specs = [...files.keys()].filter((p) => /\.spec\.(luau|lua)$/.test(p));
    cases.push({
      id: "runtime",
      name: "Runtime tests (TestEZ specs)",
      status: "skip",
      detail: specs.length
        ? `${specs.length} spec file(s) found. They need the Roblox engine to execute: run them in Studio (or with run-in-roblox). Their syntax and references were checked above.`
        : "No *.spec.luau files. Gameplay runs only inside Roblox; everything verifiable outside it was checked above.",
      durationMs: 0,
    });
  } else {
    const pkgText = textOf(files, "package.json");
    let pkg: { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object } | undefined;
    if (pkgText) {
      try {
        pkg = JSON.parse(pkgText);
      } catch {
        cases.push({ id: "package", name: "package.json", status: "fail", detail: "package.json is not valid JSON", durationMs: 0 });
      }
    }
    const cwd = treeDir(projectId, branch);
    if (pkg && (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.devDependencies ?? {}).length)) {
      const hasModules = await fs.access(path.join(cwd, "node_modules")).then(() => true, () => false);
      if (!hasModules) {
        cases.push(await timed("install", "npm install", async () => {
          const r = await runCommand("npm install --no-audit --no-fund", { cwd, timeoutMs: 300_000, signal: opts.signal, onOutput: (_s, c) => opts.onOutput?.(c) });
          return r.exitCode === 0 ? { status: "pass" } : { status: "fail", detail: (r.stderr || r.stdout).slice(-2000) };
        }));
      }
    }
    cases.push(await timed("js-syntax", "JavaScript syntax", async () => {
      const js = [...files.keys()].filter((p) => /\.(m?js)$/.test(p)).slice(0, 100);
      if (!js.length) return { status: "skip", detail: "no .js files" };
      const errors: string[] = [];
      for (const f of js) {
        const r = await runCommand(`node --check ${JSON.stringify(f)}`, { cwd, timeoutMs: 20_000, signal: opts.signal });
        if (r.exitCode !== 0) errors.push(`${f}: ${r.stderr.split("\n").filter(Boolean).slice(0, 4).join(" ")}`);
      }
      return errors.length ? { status: "fail", detail: errors.join("\n") } : { status: "pass", detail: `${js.length} files` };
    }));
    cases.push(await timed("html-refs", "HTML references resolve", async () => checkHtmlRefs(files)));
    if (pkg?.scripts?.test) {
      cases.push(await timed("npm-test", `npm test (${pkg.scripts.test})`, async () => {
        const r = await runCommand("npm test", { cwd, timeoutMs: 300_000, signal: opts.signal, onOutput: (_s, c) => opts.onOutput?.(c) });
        const out = (r.stdout + "\n" + r.stderr).trim();
        return r.exitCode === 0 ? { status: "pass", detail: out.slice(-1500) } : { status: "fail", detail: out.slice(-3000) };
      }));
    } else {
      cases.push({ id: "npm-test", name: "npm test", status: "skip", detail: "package.json has no test script", durationMs: 0 });
    }
    cases.push(await timed("browser", "Browser smoke test (load the app, collect errors)", async () => {
      if (!opts.origin) return { status: "skip", detail: "Server origin unknown" };
      if (!files.has("index.html")) return { status: "skip", detail: "No index.html to load" };
      const r = await smokeTest(`${opts.origin}/api/projects/${projectId}/preview/~${encodeURIComponent(branch)}/index.html`);
      if (!r.ran) return { status: "skip", detail: r.reason };
      if (r.screenshot) {
        const dir = path.join(DATA_DIR, "screens");
        await fs.mkdir(dir, { recursive: true });
        screenshotPath = path.join(dir, `${projectId}-${branch}.png`);
        await fs.writeFile(screenshotPath, r.screenshot);
      }
      const problems = [...r.pageErrors.map((e) => `Uncaught ${e}`), ...r.consoleErrors.map((e) => `console.error: ${e}`), ...r.failedRequests.map((e) => `Failed request: ${e}`)];
      return problems.length
        ? { status: "fail", detail: problems.slice(0, 20).join("\n") }
        : { status: "pass", detail: `Loaded "${r.title ?? ""}" in ${r.durationMs} ms with no errors` };
    }));
  }

  const count = (s: TestCase["status"]) => cases.filter((c) => c.status === s).length;
  return {
    projectKind: meta.kind,
    startedAt: started,
    durationMs: Date.now() - started,
    cases,
    passed: count("pass"),
    failed: count("fail"),
    skipped: count("skip"),
    warned: count("warn"),
    diagnostics,
    screenshotPath,
  };
}

function checkHtmlRefs(files: FileMap): Omit<TestCase, "id" | "name" | "durationMs"> {
  const htmls = [...files.keys()].filter((p) => p.endsWith(".html"));
  if (!htmls.length) return { status: "skip", detail: "no HTML files" };
  const missing: string[] = [];
  for (const h of htmls) {
    const text = textOf(files, h) ?? "";
    const dir = h.includes("/") ? h.slice(0, h.lastIndexOf("/") + 1) : "";
    for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
      const ref = m[1];
      if (/^(https?:|data:|mailto:|\/\/|#)/.test(ref)) continue;
      const target = ref.startsWith("/") ? ref.slice(1) : normalize(dir + ref);
      if (!files.has(target)) missing.push(`${h} -> ${ref}`);
    }
  }
  return missing.length ? { status: "fail", detail: `Missing: ${missing.join(", ")}` } : { status: "pass", detail: `${htmls.length} HTML file(s)` };
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (s === "..") out.pop();
    else if (s && s !== ".") out.push(s);
  }
  return out.join("/");
}
