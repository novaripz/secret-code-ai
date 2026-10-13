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
  // Only what the header shows. Subscribing to the whole thread re-rendered
  // the header on every streamed chunk of a reply.
  const id = useAssistantStore((s) => s.activeThread?.id);
  const title = useAssistantStore((s) => s.activeThread?.title ?? "");
  const pinned = useAssistantStore((s) => s.activeThread?.pinned === true);
  const saved = useAssistantStore((s) => (s.activeThread?.messages.length ?? 0) > 0);
  const renameThread = useAssistantStore((s) => s.renameThread);
  const pinThread = useAssistantStore((s) => s.pinThread);
  const deleteThread = useAssistantStore((s) => s.deleteThread);
  const displayName = useProfileStore((s) => s.displayName);

  if (!slot || !id) return null;

  async function rename() {
    const next = await dialog.prompt({
      title: t("chats.renameTitle"),
      defaultValue: title,
      placeholder: t("chats.namePlaceholder"),
      confirmLabel: t("action.rename"),
    });
    if (next && id) await renameThread(id, next);
  }

  async function remove() {
    const ok = await dialog.confirm({
      title: t("chats.deleteTitle"),
      description: t("chats.deleteBody", { title }),
      confirmLabel: t("action.delete"),
      danger: true,
    });
    if (!ok || !id) return;
    await deleteThread(id);
    router.replace("/", { scroll: false });
  }

  function exportChat() {
    // Read at the moment of the click, so the file has the whole reply even
    // if the header last rendered mid-stream.
    const thread = useAssistantStore.getState().activeThread;
    if (thread) downloadMarkdown(thread, { you: displayName() || t("chat.you"), panda: "Panda" });
  }

  return createPortal(
    <>
      <span
        dir="auto"
        className={`min-w-0 truncate px-1 text-[15px] font-semibold ${saved ? "text-[var(--text)]" : "text-[var(--text-dim)]"}`}
        title={saved ? title : undefined}
      >
        {saved ? title : t("nav.newChat")}
      </span>
      {saved && (
        <MenuButton
          label={t("chats.optionsFor", { title })}
          icon={<MoreIcon />}
          className="icon-btn icon-btn-sm tap-pad shrink-0"
          align="start"
          items={[
            { key: "rename", label: t("action.rename"), icon: <PencilIcon />, onSelect: () => void rename() },
            {
              key: "pin",
              label: t(pinned ? "chats.unpin" : "chats.pin"),
              icon: <PinIcon />,
              onSelect: () => void pinThread(id, !pinned),
            },
            {
              key: "export",
              label: t("chat.exportMarkdown"),
              icon: <DownloadIcon />,
              onSelect: exportChat,
            },
            { key: "delete", label: t("action.delete"), icon: <TrashIcon />, danger: true, onSelect: () => void remove() },
          ]}
        />
      )}
    </>,
    slot,
  );
}
