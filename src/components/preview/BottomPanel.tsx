"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudioStore, type StudioConsoleEntry } from "@/store/useStudioStore";
import { buildPreviewDocument, buildStandalonePage, listPages, resolvePreviewPage } from "@/lib/buildPreviewDocument";
import { listAllFiles } from "@/lib/fileSystem";
import { isAssetNode } from "@/lib/assets";
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  HomeIcon,
  InfoIcon,
  MaximizeIcon,
  MinimizeIcon,
  MonitorIcon,
  PlayIcon,
  RefreshIcon,
  SmartphoneIcon,
  SparkleIcon,
  TabletIcon,
  TerminalIcon,
  TrashIcon,
  ZapIcon,
} from "@/components/icons";
import { PaneHeader } from "@/components/build/Pane";
import { FileTypeIcon } from "@/components/build/fileIcons";
import { DEVICE_WIDTH, useEditorSettings, type DevicePreset } from "@/components/build/useEditorSettings";
import { allProblems, useProblems } from "@/components/build/useProblems";
import { WORKSPACE_EVENTS, emit } from "@/components/build/events";
import { askPanda } from "@/components/build/askPanda";
import { useWorkspaceLayout } from "@/components/build/useWorkspaceLayout";

// The preview, its console, and the list of what is wrong.
//
// WHEN IT RUNS
//
// It used to rebuild on every keystroke. Every edit gave the project a new
// identity, the document was rebuilt, and the frame reloaded — so a game
// restarted with each letter typed, and a page with an alert() in it popped
// that alert on every single key. Now it waits until typing has paused for a
// moment, and only reloads if the page that would run is actually different
// from the one already running. "Auto-run" can be switched off for a "press
// Run when I'm ready" workflow, and it switches itself off while the code uses
// alert(), confirm() or prompt(), which would otherwise interrupt the student
// mid-word.
//
// WHERE THINGS WENT WRONG
//
// Every message from the page carries the file and line it came from (see the
// console bridge in lib/buildPreviewDocument.ts), and clicking it opens that
// line. The Problems tab adds Monaco's own red squiggles, so a missing bracket
// shows up before anything runs at all, and files the page asks for that do
// not exist.

type Tab = "preview" | "console" | "problems";
type Filter = "all" | "log" | "warn" | "error";

const DEBOUNCE_MS = 600;
const MODAL_CALL = /\b(alert|confirm|prompt)\s*\(/;

interface RunningDoc {
  html: string;
  nonce: number;
  entryFound: boolean;
  missing: string[];
  page: string;
}

export function BottomPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useI18n();
  const project = useStudioStore((s) => s.project);
  const lastHtmlTab = useStudioStore((s) => s.lastHtmlTab);
  const consoleEntries = useStudioStore((s) => s.consoleEntries);
  const clearConsole = useStudioStore((s) => s.clearConsole);
  const byPath = useProblems((s) => s.byPath);
  const autoRun = useEditorSettings((s) => s.autoRun);
  const device = useEditorSettings((s) => s.device);
  const updateSettings = useEditorSettings((s) => s.update);

  const [tab, setTab] = useState<Tab>("preview");
  const [filter, setFilter] = useState<Filter>("all");
  const [doc, setDoc] = useState<RunningDoc>({ html: "", nonce: 0, entryFound: true, missing: [], page: "index.html" });
  const [fullscreen, setFullscreen] = useState(false);

  // WHICH PAGE IS ON SCREEN
  //
  // The page being edited, unless the student has clicked a link inside the
  // preview since — in which case that page, with a trail back. Changing the
  // page being edited starts a new trail.
  const basePage = lastHtmlTab ?? "index.html";
  const [nav, setNav] = useState<{ base: string; page: string; trail: string[] } | null>(null);
  const page = nav && nav.base === basePage ? nav.page : basePage;
  const trail = useMemo(() => (nav && nav.base === basePage ? nav.trail : []), [nav, basePage]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastHtml = useRef("");
  const pageRef = useRef(page);
  const pending = useRef<Omit<StudioConsoleEntry, "id" | "timestamp">[]>([]);
  const flushFrame = useRef<number | null>(null);
  const evalId = useRef(0);

  // Code that calls alert() reloading on every pause in typing is a dialog box
  // per word. So auto-run waits for the Run button while any is in the project.
  const usesModals = useMemo(
    () =>
      project
        ? listAllFiles(project).some((f) => !isAssetNode(f) && /\.(html?|m?js)$/i.test(f.path) && MODAL_CALL.test(f.content ?? ""))
        : false,
    [project],
  );
  const autoRunning = autoRun && !usesModals;

  /**
   * Rebuilds the page and, if it differs from what is running (or `force`),
   * reloads it. A new page means a fresh console: messages from the last run
   * of half-typed code are not messages about this one.
   */
  const rebuild = useCallback(
    (forPage: string, force: boolean) => {
      const current = useStudioStore.getState().project;
      if (!current) return;
      const next = buildPreviewDocument(current, forPage);
      if (!force && next.html === lastHtml.current) return;
      lastHtml.current = next.html;
      pending.current = [];
      clearConsole();
      setDoc((prev) => ({
        html: next.html,
        nonce: prev.nonce + 1,
        entryFound: next.entryFound,
        missing: next.missing,
        page: next.entryPath ?? forPage,
      }));
    },
    [clearConsole],
  );

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // A different page: show it now, whatever auto-run says.
  useEffect(() => {
    const frame = requestAnimationFrame(() => rebuild(page, false));
    return () => cancelAnimationFrame(frame);
  }, [page, rebuild]);

  // The code changed: run it once typing pauses, if auto-run is on.
  useEffect(() => {
    if (!autoRunning) return;
    const timer = setTimeout(() => rebuild(pageRef.current, false), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [project, autoRunning, rebuild]);

  const run = useCallback(() => {
    setTab("preview");
    rebuild(pageRef.current, true);
  }, [rebuild]);

  // Ctrl/Cmd-Enter and the palette's "Run"; the status bar's problem count.
  useEffect(() => {
    function onTab(e: Event) {
      const next = (e as CustomEvent<{ tab: Tab }>).detail?.tab;
      if (next === "preview" || next === "console" || next === "problems") setTab(next);
    }
    window.addEventListener(WORKSPACE_EVENTS.runPreview, run);
    window.addEventListener(WORKSPACE_EVENTS.showPreviewTab, onTab);
    return () => {
      window.removeEventListener(WORKSPACE_EVENTS.runPreview, run);
      window.removeEventListener(WORKSPACE_EVENTS.showPreviewTab, onTab);
    };
  }, [run]);

  // Messages from the page. Batched to one store update per frame, so a game
  // logging every frame does not re-render the console sixty times a second.
  useEffect(() => {
    function flush() {
      flushFrame.current = null;
      const batch = pending.current;
      pending.current = [];
      useStudioStore.getState().pushConsoleEntries(batch);
    }
    function queue(entry: Omit<StudioConsoleEntry, "id" | "timestamp">) {
      pending.current.push(entry);
      if (flushFrame.current === null) flushFrame.current = requestAnimationFrame(flush);
    }
    function onMessage(e: MessageEvent) {
      // Only our own frame is listened to. Nothing else on the page gets to
      // write into the student's console or move their preview.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const data = e.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || !data.__preview) return;

      // A link inside the preview. The bridge has already decided this is a
      // local page; it is resolved against the page it was clicked on, then
      // looked up in the project — never fetched.
      if (typeof data.navigate === "string") {
        const current = useStudioStore.getState().project;
        if (!current) return;
        const from = pageRef.current;
        const next = resolvePreviewPage(current, from, data.navigate);
        const base = useStudioStore.getState().lastHtmlTab ?? "index.html";
        setNav((prev) => ({
          base,
          page: next,
          trail: [...(prev && prev.base === base ? prev.trail : []), from].slice(-20),
        }));
        return;
      }
      // An external link. Opened rather than followed in place, because
      // replacing the student's own project with somebody's website is never
      // what they meant by clicking a link in it.
      if (typeof data.external === "string") {
        if (/^https?:\/\//i.test(data.external)) window.open(data.external, "_blank", "noopener,noreferrer");
        return;
      }
      if (data.clear === true) {
        pending.current = [];
        useStudioStore.getState().clearConsole();
        return;
      }
      const level = data.level === "warn" || data.level === "error" || data.level === "info" ? data.level : "log";
      queue({
        level: data.level === "result" ? "log" : level,
        text: typeof data.text === "string" ? data.text.slice(0, 4000) : "",
        file: typeof data.file === "string" ? data.file : undefined,
        line: typeof data.line === "number" ? data.line : undefined,
        col: typeof data.col === "number" ? data.col : undefined,
        kind: typeof data.evalId === "number" ? "result" : undefined,
      });
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (flushFrame.current !== null) cancelAnimationFrame(flushFrame.current);
    };
  }, []);

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === stageRef.current && !!stageRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function goBack() {
    const previous = trail[trail.length - 1];
    if (!previous) return;
    setNav({ base: basePage, page: previous, trail: trail.slice(0, -1) });
  }

  function goTo(target: string) {
    setNav({ base: basePage, page: target, trail: [...trail, page].slice(-20) });
  }

  function openInNewTab() {
    const current = useStudioStore.getState().project;
    if (!current) return;
    // The page is a sandboxed frame inside a small wrapper (see
    // buildStandalonePage): a Blob URL carries this app's origin, and the
    // student's code must not.
    const blob = new Blob([buildStandalonePage(current, page)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    // Long enough for the new tab to load it, short enough not to pile up.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // Some school-managed browsers forbid it; the button simply does nothing.
    }
  }

  function evaluate(code: string) {
    const id = ++evalId.current;
    useStudioStore.getState().pushConsoleEntry({ level: "log", text: code, kind: "input" });
    iframeRef.current?.contentWindow?.postMessage({ __pandaEval: code, id }, "*");
  }

  const editorProblems = useMemo(() => allProblems(byPath), [byPath]);
  const runtimeErrors = consoleEntries.filter((e) => e.level === "error" && e.kind !== "result");
  const problemCount = editorProblems.length + runtimeErrors.length + doc.missing.length;
  const errorCount = consoleEntries.filter((e) => e.level === "error").length;
  const warnCount = consoleEntries.filter((e) => e.level === "warn").length;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count?: number; tone?: string }[] = [
    { key: "preview", label: t("ide.tabPreview"), icon: <MonitorIcon /> },
    {
      key: "console",
      label: t("ide.tabConsole"),
      icon: <TerminalIcon />,
      count: errorCount || undefined,
      tone: "bg-[var(--danger-soft)] text-[var(--danger)]",
    },
    {
      key: "problems",
      label: t("ide.tabProblems"),
      icon: <AlertIcon />,
      count: problemCount || undefined,
      tone: editorProblems.some((p) => p.severity === "error") || runtimeErrors.length > 0
        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : "bg-[var(--warn-soft)] text-[var(--warn)]",
    },
  ];

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
      <PaneHeader onClose={onClose} closeLabel={t("ide.closePreview")}
        actions={
          <>
            <button
              type="button"
              role="switch"
              aria-checked={autoRun}
              onClick={() => updateSettings({ autoRun: !autoRun })}
              title={autoRun ? t("ide.autoRunOnTitle") : t("ide.autoRunOffTitle")}
              className={`tap-pad hidden h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-[var(--weight-ui)] transition-colors @sm:inline-flex ${
                autoRun
                  ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-text)]"
                  : "border-[var(--line)] text-[var(--text-faint)] hover:text-[var(--text)]"
              }`}
            >
              <ZapIcon className="h-3.5 w-3.5" />
              {t("ide.autoRun")}
            </button>
            <button type="button" onClick={run} title={t("ide.runTitle")} className="btn btn-primary btn-sm ml-1 !h-7 !px-2.5">
              <PlayIcon />
              {t("studio.run")}
            </button>
            <IconAction label={t("ide.openNewTab")} onClick={openInNewTab}>
              <ExternalLinkIcon />
            </IconAction>
            <IconAction label={fullscreen ? t("ide.exitFullscreen") : t("ide.fullscreen")} onClick={() => void toggleFullscreen()}>
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </IconAction>
          </>
        }
      >
        <div role="tablist" aria-label={t("studio.preview")} className="segmented shrink-0 !p-[2px]">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              title={item.label}
              className="tap-pad !h-7 !px-2.5 !text-[12.5px]"
            >
              {item.icon}
              <span className="hidden @md:inline">{item.label}</span>
              {item.count !== undefined && (
                <span className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[10.5px] font-[var(--weight-strong)] tabular-nums ${item.tone}`}>
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="flex-1" />
      </PaneHeader>

      <div className="relative min-h-0 flex-1">
        <div className={tab === "preview" ? "flex h-full flex-col" : "hidden"}>
          <AddressBar
            page={doc.page}
            canGoBack={trail.length > 0}
            onBack={goBack}
            onHome={() => goTo("index.html")}
            onReload={run}
            onPick={goTo}
            device={device}
            onDevice={(d) => updateSettings({ device: d })}
          />
          {autoRun && usesModals && (
            <p className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--info-soft)] px-3 py-1.5 text-[12.5px] text-[var(--info)]">
              <InfoIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0">{t("ide.modalPause")}</span>
            </p>
          )}
          <Stage
            stageRef={stageRef}
            iframeRef={iframeRef}
            doc={doc}
            device={fullscreen ? "desktop" : device}
            title={t("studio.preview")}
            fullscreen={fullscreen}
            onExitFullscreen={() => void toggleFullscreen()}
            exitLabel={t("ide.exitFullscreen")}
          />
        </div>

        {tab === "console" && (
          <ConsoleView
            entries={consoleEntries}
            filter={filter}
            onFilter={setFilter}
            counts={{ all: consoleEntries.length, error: errorCount, warn: warnCount }}
            onClear={() => {
              pending.current = [];
              clearConsole();
            }}
            onEval={evaluate}
          />
        )}

        {tab === "problems" && (
          <ProblemsView editorProblems={editorProblems} runtimeErrors={runtimeErrors} missing={doc.missing} page={doc.page} />
        )}
      </div>
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="icon-btn icon-btn-sm tap-sq tap-pad">
      {children}
    </button>
  );
}

const DEVICES: { key: DevicePreset; Icon: typeof MonitorIcon }[] = [
  { key: "phone", Icon: SmartphoneIcon },
  { key: "tablet", Icon: TabletIcon },
  { key: "desktop", Icon: MonitorIcon },
];

/** A browser's address bar, in miniature: back, home, reload, the page, and the screen size. */
function AddressBar({
  page,
  canGoBack,
  onBack,
  onHome,
  onReload,
  onPick,
  device,
  onDevice,
}: {
  page: string;
  canGoBack: boolean;
  onBack: () => void;
  onHome: () => void;
  onReload: () => void;
  onPick: (page: string) => void;
  device: DevicePreset;
  onDevice: (device: DevicePreset) => void;
}) {
  const { t } = useI18n();
  const project = useStudioStore((s) => s.project);
  const pages = useMemo(() => (project ? listPages(project) : []), [project]);
  const deviceLabel: Record<DevicePreset, string> = {
    phone: t("ide.devicePhone"),
    tablet: t("ide.deviceTablet"),
    desktop: t("ide.deviceDesktop"),
  };
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--line)] px-1.5">
      <IconAction label={t("ide.back")} onClick={onBack}>
        <span className={canGoBack ? "" : "opacity-40"}>
          <ChevronLeftIcon />
        </span>
      </IconAction>
      <IconAction label={t("ide.home")} onClick={onHome}>
        <HomeIcon />
      </IconAction>
      <IconAction label={t("studio.refresh")} onClick={onReload}>
        <RefreshIcon />
      </IconAction>
      <label className="relative ml-0.5 flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-1)] px-2.5 text-[12.5px] text-[var(--text-dim)]">
        <FileTypeIcon path={page} className="h-3.5 w-3.5" />
        <span className="sr-only">{t("ide.pageLabel")}</span>
        {pages.length > 1 ? (
          <select
            value={pages.includes(page) ? page : ""}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="ide-mono min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent text-[12.5px] text-[var(--text)] outline-none"
          >
            {!pages.includes(page) && <option value="">{page}</option>}
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <span className="ide-mono min-w-0 flex-1 truncate text-[var(--text)]">{page}</span>
        )}
        {pages.length > 1 && <ChevronRightIcon aria-hidden className="h-3.5 w-3.5 rotate-90 text-[var(--text-faint)]" />}
      </label>
      <div className="segmented ml-1 hidden !p-[2px] @md:inline-flex" role="radiogroup" aria-label={t("ide.deviceLabel")}>
        {DEVICES.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={device === key}
            data-active={device === key || undefined}
            onClick={() => onDevice(key)}
            title={`${deviceLabel[key]}${DEVICE_WIDTH[key] ? ` · ${DEVICE_WIDTH[key]}px` : ""}`}
            aria-label={deviceLabel[key]}
            className="tap-pad !h-6 !px-2"
          >
            <Icon />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The frame, sized to the chosen device. A phone or tablet width that does not
 * fit the pane is scaled down to fit rather than cut off — the page still lays
 * itself out at the real width, which is the whole point of choosing one.
 */
function Stage({
  stageRef,
  iframeRef,
  doc,
  device,
  title,
  fullscreen,
  onExitFullscreen,
  exitLabel,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  doc: RunningDoc;
  device: DevicePreset;
  title: string;
  fullscreen: boolean;
  onExitFullscreen: () => void;
  exitLabel: string;
}) {
  const { t } = useI18n();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stageRef]);

  const width = DEVICE_WIDTH[device];
  const pad = 16;
  const scale = width && size.w > 0 ? Math.min(1, (size.w - pad * 2) / width) : 1;
  const frameHeight = width && size.h > 0 ? (size.h - pad * 2) / scale : 0;

  return (
    <div ref={stageRef} className={`relative min-h-0 flex-1 overflow-hidden ${width ? "ide-stage" : "bg-white"}`}>
      {!doc.entryFound ? (
        <NoPage />
      ) : (
        <div
          className={width ? "ide-device absolute left-1/2 top-4" : "h-full w-full"}
          style={
            width
              ? { width, height: frameHeight, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }
              : undefined
          }
        >
          <iframe
            ref={iframeRef}
            key={doc.nonce}
            title={title}
            srcDoc={doc.html}
            sandbox="allow-scripts allow-forms allow-modals"
            allow="fullscreen"
            className="block h-full w-full border-0 bg-white"
          />
        </div>
      )}
      {width && size.w > 0 && (
        <span className="pointer-events-none absolute bottom-1.5 right-2.5 rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[10.5px] tabular-nums text-[var(--text-faint)] shadow-[var(--shadow-1)]">
          {width}px{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        </span>
      )}
      {fullscreen && (
        <button type="button" onClick={onExitFullscreen} className="btn btn-secondary btn-sm absolute right-3 top-3 shadow-[var(--shadow-2)]">
          <MinimizeIcon />
          {exitLabel}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {doc.nonce > 1 ? t("ide.reloaded") : ""}
      </span>
    </div>
  );
}

/** No web page yet: say so, and offer the two ways to get one. */
function NoPage() {
  const { t } = useI18n();
  const addFile = useStudioStore((s) => s.addFile);
  const openFile = useStudioStore((s) => s.openFile);
  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-0)] p-6">
      <div className="max-w-xs text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-dim)]">
          <MonitorIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-[var(--weight-strong)] text-[var(--text)]">{t("ide.noPageTitle")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]">{t("ide.noPageBody")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              try {
                addFile("index.html", STARTER_PAGE);
                openFile("index.html");
              } catch {
                openFile("index.html");
              }
            }}
          >
            {t("ide.makeIndex")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              useWorkspaceLayout.getState().reveal("chat");
              requestAnimationFrame(() => requestAnimationFrame(() => emit(WORKSPACE_EVENTS.focusComposer)));
            }}
          >
            <SparkleIcon /> {t("ide.askForPage")}
          </button>
        </div>
      </div>
    </div>
  );
}

const STARTER_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My page</title>
</head>
<body>
  <h1>Hello!</h1>
  <p>This is your page. Change this text and watch the preview.</p>
</body>
</html>
`;

/** Opens a file at a line, from a console message or a problem. */
function revealAt(file?: string, line?: number, col?: number) {
  if (!file) return;
  emit(WORKSPACE_EVENTS.reveal, { path: file, line, col });
}

function LocationLink({ file, line }: { file?: string; line?: number }) {
  const { t } = useI18n();
  if (!file) return null;
  const project = useStudioStore.getState().project;
  const exists = project ? listAllFiles(project).some((f) => f.path === file) : false;
  const label = `${file}${line ? `:${line}` : ""}`;
  if (!exists) return <span className="ide-mono shrink-0 text-[11.5px] text-[var(--text-faint)]">{label}</span>;
  return (
    <button
      type="button"
      onClick={() => revealAt(file, line)}
      title={t("ide.openAt", { place: label })}
      className="ide-mono shrink-0 rounded px-1 text-[11.5px] text-[var(--accent-text)] underline-offset-2 hover:bg-[var(--surface-2)] hover:underline"
    >
      {label}
    </button>
  );
}

function ConsoleView({
  entries,
  filter,
  onFilter,
  counts,
  onClear,
  onEval,
}: {
  entries: StudioConsoleEntry[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  counts: { all: number; error: number; warn: number };
  onClear: () => void;
  onEval: (code: string) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);

  const shown = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "log") return e.level === "log" || e.level === "info";
    return e.level === filter;
  });

  // Follow the newest message, unless the student has scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: t("ide.filterAll") },
    { key: "log", label: t("ide.filterLogs") },
    { key: "warn", label: t("ide.filterWarnings"), count: counts.warn },
    { key: "error", label: t("ide.filterErrors"), count: counts.error },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-2 py-1.5">
        <div className="scroll-x flex min-w-0 flex-1 items-center gap-1" role="radiogroup" aria-label={t("ide.filterLabel")}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => onFilter(f.key)}
              className={`tap inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-[var(--weight-ui)] transition-colors ${
                filter === f.key ? "bg-[var(--accent-soft)] text-[var(--accent-text)]" : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {f.label}
              {f.count ? <span className="tabular-nums opacity-80">{f.count}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClear} className="btn btn-ghost btn-sm !h-7 shrink-0" title={t("ide.clearConsole")}>
          <TrashIcon />
          <span className="hidden @sm:inline">{t("ide.clear")}</span>
        </button>
      </div>

      <div ref={listRef} className="ide-mono min-h-0 flex-1 overflow-y-auto py-1 text-[12.5px]" role="log" aria-live="polite">
        {shown.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center font-sans">
            <TerminalIcon className="h-6 w-6 text-[var(--text-faint)]" />
            <p className="text-[13px] leading-relaxed text-[var(--text-dim)]">
              {entries.length === 0 ? t("ide.consoleEmpty") : t("ide.consoleFilteredEmpty")}
            </p>
          </div>
        ) : (
          shown.map((entry) => <ConsoleRow key={entry.id} entry={entry} />)
        )}
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-1)] px-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = input.trim();
          if (!code) return;
          onEval(code);
          setHistory((h) => [...h.filter((x) => x !== code), code].slice(-50));
          setCursor(null);
          setInput("");
        }}
      >
        <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent-text)]" />
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setCursor(null);
          }}
          onKeyDown={(e) => {
            // Up and down walk back through what was typed, like a real console.
            if (e.key === "ArrowUp" && history.length > 0) {
              e.preventDefault();
              const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setInput(history[next]);
            } else if (e.key === "ArrowDown" && cursor !== null) {
              e.preventDefault();
              const next = cursor + 1;
              if (next >= history.length) {
                setCursor(null);
                setInput("");
              } else {
                setCursor(next);
                setInput(history[next]);
              }
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label={t("ide.consoleInputLabel")}
          placeholder={t("ide.consoleInput")}
          className="ide-mono h-10 min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
      </form>
    </div>
  );
}

function ConsoleRow({ entry }: { entry: StudioConsoleEntry }) {
  const tone =
    entry.level === "error"
      ? "bg-[var(--danger-soft)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_25%,transparent)]"
      : entry.level === "warn"
        ? "bg-[var(--warn-soft)] text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_25%,transparent)]"
        : "text-[var(--text)] border-[var(--line)]";
  const icon =
    entry.kind === "input" ? (
      <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--accent-text)]" />
    ) : entry.kind === "result" ? (
      <ChevronLeftIcon className="h-3.5 w-3.5 text-[var(--text-faint)]" />
    ) : entry.level === "error" ? (
      <CircleAlertIcon className="h-3.5 w-3.5" />
    ) : entry.level === "warn" ? (
      <AlertIcon className="h-3.5 w-3.5" />
    ) : entry.level === "info" ? (
      <InfoIcon className="h-3.5 w-3.5 text-[var(--info)]" />
    ) : (
      <span className="h-3.5 w-3.5" />
    );
  return (
    <div className={`flex items-start gap-2 border-b px-3 py-1 ${tone}`}>
      <span className="mt-[3px] flex shrink-0">{icon}</span>
      <span
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${
          entry.kind === "input" ? "text-[var(--text-dim)]" : entry.kind === "result" ? "text-[var(--accent-text)]" : ""
        }`}
      >
        {entry.text || " "}
      </span>
      <LocationLink file={entry.file} line={entry.line} />
    </div>
  );
}

function ProblemsView({
  editorProblems,
  runtimeErrors,
  missing,
  page,
}: {
  editorProblems: ReturnType<typeof allProblems>;
  runtimeErrors: StudioConsoleEntry[];
  missing: string[];
  page: string;
}) {
  const { t } = useI18n();
  const total = editorProblems.length + runtimeErrors.length + missing.length;

  function askToFix(message: string, file?: string, line?: number) {
    const where = file ? ` in ${file}${line ? ` on line ${line}` : ""}` : "";
    askPanda(`I'm getting this problem${where}:\n\n${message}\n\nCan you help me understand it and fix it?`);
  }

  if (total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
          <CircleCheckIcon className="h-5 w-5" />
        </span>
        <p className="text-sm font-[var(--weight-strong)] text-[var(--text)]">{t("ide.noProblemsTitle")}</p>
        <p className="max-w-xs text-[13px] leading-relaxed text-[var(--text-dim)]">{t("ide.noProblemsBody")}</p>
      </div>
    );
  }

  return (
    <ul className="h-full overflow-y-auto py-1">
      {missing.map((path) => (
        <ProblemRow
          key={`missing:${path}`}
          severity="error"
          message={t("ide.missingFile", { page, path })}
          file={page}
          onAsk={() => askToFix(t("ide.missingFile", { page, path }), page)}
        />
      ))}
      {runtimeErrors.map((e) => (
        <ProblemRow
          key={e.id}
          severity="error"
          badge={t("ide.whileRunning")}
          message={e.text}
          file={e.file}
          line={e.line}
          onAsk={() => askToFix(e.text, e.file, e.line)}
        />
      ))}
      {editorProblems.map((p, i) => (
        <ProblemRow
          key={`${p.path}:${p.line}:${p.col}:${i}`}
          severity={p.severity}
          message={p.message}
          file={p.path}
          line={p.line}
          onAsk={() => askToFix(p.message, p.path, p.line)}
        />
      ))}
    </ul>
  );
}

function ProblemRow({
  severity,
  message,
  file,
  line,
  badge,
  onAsk,
}: {
  severity: "error" | "warning";
  message: string;
  file?: string;
  line?: number;
  badge?: string;
  onAsk: () => void;
}) {
  const { t } = useI18n();
  return (
    <li className="group flex items-start gap-2.5 border-b border-[var(--line)] px-3 py-2 hover:bg-[var(--surface-1)]">
      {severity === "error" ? (
        <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
      ) : (
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] leading-snug text-[var(--text)]">
          {badge && <span className="badge badge-danger mr-1.5 !h-5 align-[1px]">{badge}</span>}
          {message}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {file && (
            <span className="flex items-center gap-1">
              <FileTypeIcon path={file} className="h-3.5 w-3.5" />
              <LocationLink file={file} line={line} />
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAsk}
        className="btn btn-ghost btn-sm !h-7 shrink-0 text-[var(--accent-text)] opacity-80 group-hover:opacity-100"
        title={t("ide.askFixTitle")}
      >
        <SparkleIcon />
        <span className="hidden @md:inline">{t("ide.askFix")}</span>
      </button>
    </li>
  );
}
