"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useShellHeaderSlot } from "@/components/layout/AppShell";
import { useDialog } from "@/components/ui/Dialog";
import { MenuButton } from "@/components/ui/Menu";
import { DownloadIcon, MoreIcon, PencilIcon, PinIcon, TrashIcon } from "@/components/icons";
import { downloadMarkdown } from "./exportChat";

// The open chat's name and its menu, drawn in the shell's header.
//
// Rename, pin and delete used to exist only in the sidebar — on a phone, two
// taps away behind the drawer, for the chat that is right in front of you.
// Export lives here too: a student keeping an explanation for revision wants
// the whole conversation as a file, not a copy-paste of each reply.

export function ChatHeader() {
  const slot = useShellHeaderSlot();
  const { t } = useI18n();
  const router = useRouter();
  const dialog = useDialog();
  const thread = useAssistantStore((s) => s.activeThread);
  const renameThread = useAssistantStore((s) => s.renameThread);
  const pinThread = useAssistantStore((s) => s.pinThread);
  const deleteThread = useAssistantStore((s) => s.deleteThread);
  const displayName = useProfileStore((s) => s.displayName);

  if (!slot) return null;
  const saved = thread !== null && thread.messages.length > 0;

  async function rename() {
    if (!thread) return;
    const title = await dialog.prompt({
      title: t("chats.renameTitle"),
      defaultValue: thread.title,
      placeholder: t("chats.namePlaceholder"),
      confirmLabel: t("action.rename"),
    });
    if (title) await renameThread(thread.id, title);
  }

  async function remove() {
    if (!thread) return;
    const ok = await dialog.confirm({
      title: t("chats.deleteTitle"),
      description: t("chats.deleteBody", { title: thread.title }),
      confirmLabel: t("action.delete"),
      danger: true,
    });
    if (!ok) return;
    await deleteThread(thread.id);
    router.replace("/", { scroll: false });
  }

  return createPortal(
    <>
      <span
        className={`min-w-0 truncate px-1 text-[15px] font-semibold ${saved ? "text-[var(--text)]" : "text-[var(--text-dim)]"}`}
        title={saved ? thread.title : undefined}
      >
        {saved ? thread.title : t("nav.newChat")}
      </span>
      {saved && (
        <MenuButton
          label={t("chats.optionsFor", { title: thread.title })}
          icon={<MoreIcon />}
          className="icon-btn icon-btn-sm tap-pad shrink-0"
          align="start"
          items={[
            { key: "rename", label: t("action.rename"), icon: <PencilIcon />, onSelect: () => void rename() },
            {
              key: "pin",
              label: t(thread.pinned ? "chats.unpin" : "chats.pin"),
              icon: <PinIcon />,
              onSelect: () => void pinThread(thread.id, !thread.pinned),
            },
            {
              key: "export",
              label: t("chat.exportMarkdown"),
              icon: <DownloadIcon />,
              onSelect: () => downloadMarkdown(thread, { you: displayName() || t("chat.you"), panda: "Panda" }),
            },
            { key: "delete", label: t("action.delete"), icon: <TrashIcon />, danger: true, onSelect: () => void remove() },
          ]}
        />
      )}
    </>,
    slot,
  );
}
