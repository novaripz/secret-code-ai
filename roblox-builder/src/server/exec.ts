// Running real commands in a project's working tree.
//
// No shell is involved: the command line is tokenized here and the program is
// spawned directly, so there are no pipes, redirects, globbing or `&&`
// chains to smuggle anything through. Only allow-listed programs run, with a
// scrubbed environment (no API keys), a timeout, and capped output.
//
// This is real execution. Run the server in a container or VM you are
// willing to let project code run in; set ALLOW_COMMANDS=false to turn it off.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const ALLOWED_PROGRAMS = new Set([
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "tsc",
  "rojo",
  "luau",
  "luau-analyze",
  "lune",
  "selene",
  "stylua",
  "wally",
  "rokit",
]);

/** npm/pnpm/yarn subcommands that are allowed. Scripts from package.json are allowed by name via `run`. */
const PACKAGE_MANAGER_SUBCOMMANDS = new Set(["install", "i", "ci", "add", "run", "test", "t", "exec", "ls", "list", "outdated", "why", "init", "build"]);

const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|SESSION/i;

export interface CommandResult {
  command: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
}

export class CommandRejected extends Error {}

export function commandsEnabled(): boolean {
  return process.env.ALLOW_COMMANDS !== "false";
}

/** Shell-like tokenizing with quotes and backslash escapes, but no expansion or operators. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
      continue;
    }
    if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    if ("|&;<>`$(){}".includes(c)) {
      throw new CommandRejected(`Shell operators are not supported ('${c}'). Run one program at a time.`);
    }
    cur += c;
    has = true;
  }
  if (quote) throw new CommandRejected("Unterminated quote");
  if (has || cur) out.push(cur);
  return out;
}

export function checkCommand(argv: string[]): void {
  if (argv.length === 0) throw new CommandRejected("Empty command");
  const program = argv[0];
  if (program.includes("/") || program.includes("\\")) throw new CommandRejected("Run programs by name, not by path");
  if (!ALLOWED_PROGRAMS.has(program)) {
    throw new CommandRejected(`'${program}' is not an allowed program. Allowed: ${[...ALLOWED_PROGRAMS].join(", ")}`);
  }
  if (["npm", "pnpm", "yarn"].includes(program) && argv[1] && !PACKAGE_MANAGER_SUBCOMMANDS.has(argv[1])) {
    throw new CommandRejected(`'${program} ${argv[1]}' is not allowed. Allowed: ${[...PACKAGE_MANAGER_SUBCOMMANDS].join(", ")}`);
  }
  if (program === "node" && argv.some((a) => a === "-e" || a === "--eval" || a === "-p" || a === "--print")) {
    throw new CommandRejected("node -e/-p is not allowed; put the code in a file in the project and run that");
  }
  if (argv.some((a) => a.startsWith("/") || a.includes(".."))) {
    throw new CommandRejected("Arguments may not use absolute paths or '..'; stay inside the project");
  }
}

const found = new Map<string, boolean>();

/** Whether a program is installed on this server (cached). */
export function isInstalled(program: string): boolean {
  const cached = found.get(program);
  if (cached !== undefined) return cached;
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  const ok = dirs.some((d) => d && (existsSync(path.join(d, program)) || existsSync(path.join(d, `${program}.exe`))));
  found.set(program, ok);
  return ok;
}

export function toolAvailability(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of ["node", "npm", "rojo", "luau-analyze", "selene", "stylua", "lune", "wally"]) out[p] = isInstalled(p);
  return out;
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  onOutput?: (stream: "stdout" | "stderr", chunk: string) => void;
  signal?: AbortSignal;
}

const MAX_OUTPUT = 200_000;

export async function runCommand(line: string, opts: RunOptions): Promise<CommandResult> {
  if (!commandsEnabled()) throw new CommandRejected("Command execution is disabled on this server (ALLOW_COMMANDS=false)");
  const argv = tokenize(line);
  checkCommand(argv);
  if (!isInstalled(argv[0])) {
    throw new CommandRejected(`'${argv[0]}' is not installed on this server`);
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !SECRET_ENV.test(k)) env[k] = v;
  }
  env.CI = "1";
  env.FORCE_COLOR = "0";
  env.NO_UPDATE_NOTIFIER = "1";

  const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 120_000, 1_000), 600_000);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd: opts.cwd, env: env as NodeJS.ProcessEnv, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const take = (which: "stdout" | "stderr", buf: Buffer) => {
      const s = buf.toString("utf8");
      opts.onOutput?.(which, s);
      const cur = which === "stdout" ? stdout : stderr;
      if (cur.length >= MAX_OUTPUT) {
        truncated = true;
        return;
      }
      const next = cur + s.slice(0, MAX_OUTPUT - cur.length);
      if (which === "stdout") stdout = next;
      else stderr = next;
    };
    child.stdout.on("data", (b: Buffer) => take("stdout", b));
    child.stderr.on("data", (b: Buffer) => take("stderr", b));
    const kill = () => {
      if (!child.killed) child.kill("SIGTERM");
      setTimeout(() => !child.killed && child.kill("SIGKILL"), 2000).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    opts.signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (err) => {
      stderr += `\n${err.message}`;
    });
    child.on("close", (code, sig) => {
      clearTimeout(timer);
      resolve({
        command: argv.join(" "),
        exitCode: code,
        signal: sig,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        truncated,
      });
    });
  });
}
