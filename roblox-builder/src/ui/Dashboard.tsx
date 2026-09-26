"use client";

import { ArrowRight, Bot, Command, Flame, Moon, MoreHorizontal, Pencil, Plus, Sparkles, Sun, Trash2, Wand2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectMeta } from "@/core/project/types";
import type { ProjectKind } from "@/core/roblox/template";
import { api, type StatusInfo } from "./api";
import { cx, DialogProvider, KIND_META, KindIcon, Logo, Segmented, Spinner, timeAgo, toast, Toaster, useDialog, useThemeToggle } from "./common/ui";

const TARGETS: { kind: ProjectKind; label: string; hint: string }[] = [
  { kind: "roblox-experience", label: "Roblox Experience", hint: "Full game: server, client, UI, data, map" },
  { kind: "roblox-ui", label: "Roblox UI", hint: "ScreenGuis, menus, HUDs, shops" },
  { kind: "roblox-system", label: "Scripting & Systems", hint: "Gameplay systems, modules, remotes" },
  { kind: "roblox-asset", label: "3D Assets & Environments", hint: "Props, buildings, characters, kits" },
  { kind: "roblox-plugin", label: "Plugins & Tooling", hint: "Studio plugins and dev tools" },
  { kind: "web-app", label: "Web App", hint: "Browser tools and interfaces" },
];

const EXAMPLES: { text: string; kind: ProjectKind }[] = [
  { text: "A tycoon with droppers, a conveyor, a collector, upgrade buttons, a rebirth system and a clean HUD", kind: "roblox-experience" },
  { text: "A shop UI with category tabs, item cards, a purchase confirmation modal and coin balance", kind: "roblox-ui" },
  { text: "A round-based obby system with checkpoints, a timer, and a leaderboard of best times", kind: "roblox-system" },
  { text: "A modular medieval market kit: stall, awning, crates, barrels and a lantern", kind: "roblox-asset" },
  { text: "A Studio plugin that snaps selected parts to a configurable grid", kind: "roblox-plugin" },
];

type Mode = "autopilot" | "forge" | "chat";

function titleFrom(prompt: string): string {
  const cleaned = prompt
    .replace(/^\s*(please\s+)?(make|build|create|generate|design|give)\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/[^\w\s'-]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  const title = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return title.slice(0, 40) || "Untitled Project";
}

function DashboardInner() {
  const router = useRouter();
  const dialog = useDialog();
  const [theme, toggleTheme] = useThemeToggle();
  const [status, setStatus] = useState<StatusInfo>();
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ProjectKind>("roblox-experience");
  const [mode, setMode] = useState<Mode>("autopilot");
  const [variants, setVariants] = useState(3);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => undefined);
    api
      .listProjects()
      .then((r) => setProjects(r.projects))
      .catch((e) => {
        toast.error(e.message);
        setProjects([]);
      });
  }, []);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(260, Math.max(96, el.scrollHeight))}px`;
  }, [prompt]);

  const start = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const { project } = await api.createProject({ name: titleFrom(prompt), kind, description: prompt.trim() });
      try {
        sessionStorage.setItem(`rb-start-${project.id}`, JSON.stringify({ prompt: prompt.trim(), mode, count: variants }));
      } catch {
        /* the workspace falls back to an empty composer */
      }
      router.push(`/p/${project.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const createBlank = async () => {
    const name = await dialog.prompt("New empty project", { label: "Name", placeholder: "My Game", confirmLabel: "Create" });
    if (!name) return;
    const { project } = await api.createProject({ name, kind });
    router.push(`/p/${project.id}`);
  };

  const remove = async (p: ProjectMeta) => {
    setMenu(null);
    const ok = await dialog.confirm(`Delete "${p.name}"?`, "This permanently deletes the project, its branches and its whole version history.", { confirmLabel: "Delete forever", danger: true });
    if (!ok) return;
    await api.deleteProject(p.id);
    setProjects((ps) => ps?.filter((x) => x.id !== p.id) ?? null);
    toast.ok(`Deleted ${p.name}`);
  };

  const rename = async (p: ProjectMeta) => {
    setMenu(null);
    const name = await dialog.prompt("Rename project", { initial: p.name, confirmLabel: "Rename" });
    if (!name || name === p.name) return;
    const { project } = await api.updateProject(p.id, { name });
    setProjects((ps) => ps?.map((x) => (x.id === p.id ? project : x)) ?? null);
  };

  const target = useMemo(() => TARGETS.find((t) => t.kind === kind)!, [kind]);

  return (
    <div className="relative min-h-screen overflow-x-hidden" onClick={() => setMenu(null)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-60 [background:radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
        <Logo className="size-7" />
        <span className="text-[15px] font-semibold tracking-tight">Roblox Builder</span>
        <div className="flex-1" />
        {status && (
          <span className={cx("chip", !status.ai.configured && "text-warn")} title={status.ai.active ? `${status.ai.active.label} · ${status.ai.active.model}` : status.ai.hint}>
            <Bot className="size-3" />
            {status.ai.active ? `${status.ai.active.label} · ${status.ai.active.model}` : "AI not configured"}
          </span>
        )}
        <button className="btn btn-ghost size-8 justify-center p-0" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="mx-auto mt-10 max-w-3xl text-center sm:mt-16">
          <div className="chip mx-auto mb-5">
            <Sparkles className="size-3 text-accent" /> Autonomous product engineer · Roblox-first
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Describe it. <span className="accent-text">Watch it get built.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-fg-2">
            Games, systems, UI, 3D assets and tools. Planned, coded, tested and validated for Roblox Studio, with every file yours to edit.
          </p>
        </section>

        <section className="mx-auto mt-10 max-w-3xl">
          <div className="glass rounded-2xl p-2 transition-shadow focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_50%,transparent),var(--shadow)]">
            <textarea
              ref={ta}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
              }}
              placeholder="Make me a Roblox tycoon with a neon HUD, droppers that upgrade, a rebirth system and a secure shop…"
              className="block w-full resize-none bg-transparent px-3 pt-3 text-[15px] leading-relaxed placeholder:text-fg-3 focus:outline-none focus-visible:outline-none"
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2 px-2 pb-1.5 pt-2">
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: "autopilot", label: <><Zap className="size-3.5" /> Autopilot</>, title: "Plan, build, test, fix and polish without stopping" },
                  { value: "forge", label: <><Flame className="size-3.5" /> Forge</>, title: "Generate several distinct versions in parallel" },
                  { value: "chat", label: <><Wand2 className="size-3.5" /> Guided</>, title: "Interactive: asks before destructive actions" },
                ]}
              />
              {mode === "forge" && (
                <Segmented<string>
                  value={String(variants)}
                  onChange={(v) => setVariants(Number(v))}
                  options={[2, 3, 4].map((n) => ({ value: String(n), label: `${n} versions` }))}
                />
              )}
              <div className="flex-1" />
              <span className="hidden text-xs text-fg-3 sm:inline">
                <span className="kbd">⌘</span> <span className="kbd">Enter</span>
              </span>
              <button className="btn btn-primary h-9 px-4" disabled={!prompt.trim() || busy} onClick={start}>
                {busy ? <Spinner /> : <ArrowRight className="size-4" />}
                {mode === "forge" ? `Forge ${variants}` : "Build"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {TARGETS.map((t) => (
              <button
                key={t.kind}
                onClick={() => setKind(t.kind)}
                title={t.hint}
                className={cx(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all",
                  kind === t.kind ? "bg-accent/15 text-fg shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_55%,transparent)]" : "bg-panel/60 text-fg-2 hairline hover:text-fg",
                )}
              >
                <KindIcon kind={t.kind} className="size-3.5" />
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-fg-3">{target.hint}</p>

          {status && !status.ai.configured && (
            <div className="mx-auto mt-5 max-w-2xl rounded-xl bg-warn/10 px-4 py-3 text-xs leading-relaxed text-warn hairline">
              {status.ai.hint} Projects, editing, validation, previews and export all work without it.
            </div>
          )}

          <div className="mt-8 grid gap-2 sm:grid-cols-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.text}
                onClick={() => {
                  setPrompt(ex.text);
                  setKind(ex.kind);
                  ta.current?.focus();
                }}
                className="group flex items-start gap-3 rounded-xl bg-panel/50 p-3 text-left text-[13px] leading-snug text-fg-2 hairline transition-colors hover:bg-panel hover:text-fg"
              >
                <span className={cx("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-fg", KIND_META[ex.kind].tint)}>
                  <KindIcon kind={ex.kind} className="size-3.5" />
                </span>
                {ex.text}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold">Your projects</h2>
            <span className="text-xs text-fg-3">{projects?.length ?? ""}</span>
            <div className="flex-1" />
            <button className="btn" onClick={createBlank}>
              <Plus className="size-3.5" /> Empty {target.label}
            </button>
          </div>
          {projects === null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-32 rounded-2xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl bg-panel/40 p-10 text-center text-sm text-fg-3 hairline">
              <Command className="mx-auto mb-3 size-5" />
              Nothing yet. Describe something above and it will show up here.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(`/p/${p.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && router.push(`/p/${p.id}`)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl bg-panel p-4 hairline transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
                >
                  <div className={cx("pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br opacity-60 blur-2xl", KIND_META[p.kind].tint)} />
                  <div className="relative flex items-start gap-3">
                    <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br", KIND_META[p.kind].tint)}>
                      <KindIcon kind={p.kind} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="text-xs text-fg-3">
                        {KIND_META[p.kind].label} · {timeAgo(p.updatedAt)}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost size-7 justify-center p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === p.id ? null : p.id);
                      }}
                      aria-label="Project actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {menu === p.id && (
                      <div className="glass absolute right-0 top-8 z-20 w-40 rounded-xl p-1 text-sm animate-rise" onClick={(e) => e.stopPropagation()}>
                        <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-raise" onClick={() => rename(p)}>
                          <Pencil className="size-3.5" /> Rename
                        </button>
                        <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-err hover:bg-err/10" onClick={() => remove(p)}>
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {p.description && <p className="relative mt-3 line-clamp-2 text-xs leading-relaxed text-fg-2">{p.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Toaster />
    </div>
  );
}

export default function Dashboard() {
  return (
    <DialogProvider>
      <DashboardInner />
    </DialogProvider>
  );
}
