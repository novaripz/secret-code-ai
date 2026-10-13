"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  BrushIcon,
  FileCodeIcon,
  FilesIcon,
  GamepadIcon,
  HelpIcon,
  PlusIcon,
  UserIcon,
} from "./templateIcons";
import { Modal } from "./Modal";
import { TEMPLATES, findTemplate, type TemplateIcon } from "./templates";

// "New project", with somewhere to start from.
//
// There used to be one starter — a page that said "Welcome to your new
// project" — and a name box. A student who wanted to make a game had to know
// what a game loop was before they could see one. Now the dialog offers six
// small working projects, each a minute's read, and the name box fills itself
// in from the one picked until the student types their own.

export const TEMPLATE_ICONS: Record<TemplateIcon, React.ReactNode> = {
  file: <FileCodeIcon />,
  game: <GamepadIcon />,
  quiz: <HelpIcon />,
  user: <UserIcon />,
  pages: <FilesIcon />,
  brush: <BrushIcon />,
};

/** Each template's own tint, so the six cards are told apart at a glance. */
export const TEMPLATE_TINT: Record<TemplateIcon, string> = {
  file: "bg-[var(--accent-soft)] text-[var(--accent-text)]",
  game: "bg-[color-mix(in_srgb,#8b5cf6_18%,transparent)] text-[#8b5cf6]",
  quiz: "bg-[color-mix(in_srgb,#0ea5e9_18%,transparent)] text-[#0ea5e9]",
  user: "bg-[color-mix(in_srgb,#f43f5e_16%,transparent)] text-[#f43f5e]",
  pages: "bg-[color-mix(in_srgb,#f59e0b_18%,transparent)] text-[#d97706]",
  brush: "bg-[color-mix(in_srgb,#10b981_18%,transparent)] text-[#10b981]",
};

export function NewProjectDialog({
  open,
  initialTemplate = "blank",
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  initialTemplate?: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (templateId: string, name: string) => void;
}) {
  if (!open) return null;
  return <Dialog initialTemplate={initialTemplate} busy={busy} onClose={onClose} onCreate={onCreate} />;
}

function Dialog({
  initialTemplate,
  busy,
  onClose,
  onCreate,
}: {
  initialTemplate: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (templateId: string, name: string) => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState(initialTemplate);
  // Null until the student types: until then the name follows the template.
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? findTemplate(picked).defaultName;

  const submit = () => {
    if (!busy) onCreate(picked, name);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={<PlusIcon />}
      title={t("build.templateTitle")}
      description={t("build.templateHint")}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t("action.cancel")}
          </button>
          <button type="button" onClick={submit} disabled={busy || !name.trim()} className="btn btn-primary">
            {busy ? t("build.templateCreating") : t("build.templateCreate")}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("build.templateTitle")} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((template) => {
          const on = picked === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-template={template.id}
              onClick={() => setPicked(template.id)}
              onDoubleClick={() => onCreate(template.id, typed ?? template.defaultName)}
              className={`tap flex items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 text-left transition-[border-color,background-color,box-shadow] ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--glow-accent)]"
                  : "border-[var(--line)] bg-[var(--surface-0)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] [&>svg]:h-5 [&>svg]:w-5 ${TEMPLATE_TINT[template.icon]}`}>
                {TEMPLATE_ICONS[template.icon]}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-[var(--weight-strong)] text-[var(--text)]">{template.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[var(--text-dim)]">{template.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-5 block">
        <span className="eyebrow">{t("build.templateName")}</span>
        <input
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="input mt-1.5"
        />
        <span className="mt-1.5 block text-[13px] text-[var(--text-faint)]">{t("build.nameHint")}</span>
      </label>
    </Modal>
  );
}
