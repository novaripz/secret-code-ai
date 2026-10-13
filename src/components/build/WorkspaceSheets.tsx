"use client";

import { Minus } from "lucide-react";
import { KeyboardIcon, PlusIcon, RefreshIcon, SlidersIcon } from "@/components/icons";
import { Kbd } from "@/components/ui/primitives";
import { Modal } from "./Modal";
import { FONT_SIZES, TAB_SIZES, useEditorSettings } from "./useEditorSettings";
import { modKey } from "./events";

// The two reference sheets: every shortcut in one place, and the handful of
// editor settings a student actually changes.

function MinusIcon() {
  return <Minus aria-hidden="true" strokeWidth={1.85} />;
}

interface Shortcut {
  keys: string[];
  does: string;
}

function groups(mod: string): { title: string; items: Shortcut[] }[] {
  return [
    {
      title: "Anywhere",
      items: [
        { keys: [`${mod} K`], does: "Find a file or run a command" },
        { keys: [`${mod} P`], does: "Find a file (works inside the editor too)" },
        { keys: [`${mod} Shift P`], does: "Run a command" },
        { keys: [`${mod} Shift F`], does: "Find in all files" },
        { keys: [`${mod} S`], does: "Save now (it also saves by itself)" },
        { keys: [`${mod} Enter`], does: "Run the preview" },
        { keys: [`${mod} B`], does: "Show or hide the side bar" },
        { keys: [`${mod} ,`], does: "Editor settings" },
        { keys: ["?"], does: "This list" },
      ],
    },
    {
      title: "Writing code",
      items: [
        { keys: [`${mod} F`], does: "Find in this file" },
        { keys: [`${mod} H`], does: "Find and replace in this file" },
        { keys: [`${mod} G`], does: "Go to a line" },
        { keys: [`${mod} /`], does: "Turn a line into a comment, or back" },
        { keys: [`${mod} D`], does: "Also select the next match" },
        { keys: ["Alt ↑", "Alt ↓"], does: "Move a line up or down" },
        { keys: ["Shift Alt ↓"], does: "Copy a line downwards" },
        { keys: ["Shift Alt F"], does: "Tidy up the whole file" },
        { keys: ["Alt Z"], does: "Wrap long lines" },
        { keys: [`${mod} Z`, `${mod} Shift Z`], does: "Undo, redo" },
        { keys: ["! Enter"], does: "A whole web page, in an empty .html file" },
      ],
    },
    {
      title: "Panda",
      items: [
        { keys: [`${mod} Shift E`], does: "Ask Panda about the selected code" },
        { keys: [`${mod} Shift X`], does: "Ask Panda to fix the selected code" },
      ],
    },
    {
      title: "In your files",
      items: [
        { keys: ["↑", "↓"], does: "Move between files" },
        { keys: ["Enter"], does: "Open, or open a folder" },
        { keys: ["F2"], does: "Rename" },
        { keys: [`${mod} D`], does: "Duplicate" },
        { keys: ["Delete"], does: "Delete (Undo is right below the list)" },
        { keys: ["Shift F10"], does: "All the actions for a file" },
      ],
    },
  ];
}

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mod = modKey();
  return (
    <Modal open={open} onClose={onClose} size="xl" icon={<KeyboardIcon />} title="Keyboard shortcuts" description="The quick way to do the things you do most.">
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        {groups(mod).map((group) => (
          <section key={group.title}>
            <h3 className="eyebrow mb-2">{group.title}</h3>
            <dl className="divide-y divide-[var(--line)]">
              {group.items.map((item) => (
                <div key={item.does} className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-[14px] text-[var(--text-dim)]">{item.does}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {item.keys.map((combo, i) => (
                      <span key={combo} className="flex items-center gap-1">
                        {i > 0 && <span className="text-[12px] text-[var(--text-faint)]">/</span>}
                        {combo.split(" ").map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="switch">
      <span className="switch-knob" />
    </button>
  );
}

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-[var(--weight-ui)] text-[var(--text)]">{title}</p>
        {note && <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-faint)]">{note}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function EditorSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useEditorSettings();
  const sizeIndex = FONT_SIZES.indexOf(settings.fontSize as (typeof FONT_SIZES)[number]);
  const step = (by: number) => {
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, sizeIndex + by))];
    settings.update({ fontSize: next });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<SlidersIcon />}
      title="Editor settings"
      description="Saved in this browser, for every project."
      footer={
        <>
          <button type="button" onClick={settings.reset} className="btn btn-ghost btn-sm mr-auto">
            <RefreshIcon />
            Reset
          </button>
          <button type="button" onClick={onClose} className="btn btn-primary btn-sm">
            Done
          </button>
        </>
      }
    >
      <div className="divide-y divide-[var(--line)]">
        <Row title="Text size" note="Bigger is easier on a projector.">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => step(-1)} disabled={sizeIndex <= 0} aria-label="Smaller text" className="icon-btn icon-btn-sm tap-sq border border-[var(--line)]">
              <MinusIcon />
            </button>
            <span className="ide-mono w-12 text-center text-[13px] tabular-nums text-[var(--text)]" aria-live="polite">
              {settings.fontSize}px
            </span>
            <button type="button" onClick={() => step(1)} disabled={sizeIndex >= FONT_SIZES.length - 1} aria-label="Bigger text" className="icon-btn icon-btn-sm tap-sq border border-[var(--line)]">
              <PlusIcon />
            </button>
          </div>
        </Row>
        <p className="ide-mono rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-0)] px-3 py-2 text-[var(--text-dim)]" style={{ fontSize: settings.fontSize }}>
          {"const score = 0; // like this"}
        </p>
        <Row title="Wrap long lines" note="Long lines continue on the next line instead of running off the side.">
          <Switch checked={settings.wordWrap} onChange={(v) => settings.update({ wordWrap: v })} label="Wrap long lines" />
        </Row>
        <Row title="Minimap" note="A tiny overview of the file down the right-hand side.">
          <Switch checked={settings.minimap} onChange={(v) => settings.update({ minimap: v })} label="Minimap" />
        </Row>
        <Row title="Indent size" note="How many spaces one press of Tab makes.">
          <div className="segmented" role="radiogroup" aria-label="Indent size">
            {TAB_SIZES.map((size) => (
              <button key={size} type="button" role="radio" aria-checked={settings.tabSize === size} data-active={settings.tabSize === size || undefined} onClick={() => settings.update({ tabSize: size })}>
                {size} spaces
              </button>
            ))}
          </div>
        </Row>
        <Row title="Run while I type" note="The preview updates a moment after you stop typing. Off means it only runs when you press Run.">
          <Switch checked={settings.autoRun} onChange={(v) => settings.update({ autoRun: v })} label="Run while I type" />
        </Row>
      </div>
    </Modal>
  );
}
