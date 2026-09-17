"use client";

import { useCallback, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudioStore } from "@/store/useStudioStore";
import { useDialog } from "@/components/ui/Dialog";
import { findByPath } from "@/lib/fileSystem";
import { fileName, joinPath, parentPath } from "@/lib/paths";
import { displayPath, duplicatePath } from "./fileMenu";

// Everything a context-menu entry actually DOES, in one place that has nothing
// to do with menus.
//
// This split is the whole reason the menu is allowed to exist. The rule this
// repo learned the hard way is that a right-click is never the only route to an
// action — half the students are on phones and some are on a keyboard — so
// every action here is called from at least two places: the tree's menu and ⋯
// button, and the command palette (Ctrl/Cmd-K), which needs no pointer at all.
// If the behaviour lived inside the menu component, the palette would have to
// reimplement it, and the two copies would drift until one of them stopped
// asking before deleting things.
//
// Everything is async because everything that can go wrong tells the student so
// in an in-app dialog rather than failing quietly.

export function useFileActions() {
  const { t } = useI18n();
  const dialog = useDialog();
  const project = useStudioStore((s) => s.project);
  const openFile = useStudioStore((s) => s.openFile);
  const addFile = useStudioStore((s) => s.addFile);
  const addFolder = useStudioStore((s) => s.addFolder);
  const removeNode = useStudioStore((s) => s.removeNode);
  const renamePath = useStudioStore((s) => s.renamePath);
  const duplicateNode = useStudioStore((s) => s.duplicateNode);
  const undoDelete = useStudioStore((s) => s.undoDelete);

  const report = useCallback(
    async (err: unknown) => {
      await dialog.alert({
        title: t("studio.didntWork"),
        description: err instanceof Error ? err.message : String(err),
      });
    },
    [dialog, t],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("This browser won't let the page copy for you.");
        await navigator.clipboard.writeText(text);
      } catch (err) {
        // Said out loud rather than swallowed. A copy that silently did nothing
        // is worse than one that admits it, because the student pastes whatever
        // was on the clipboard before and blames their own typing.
        await report(err);
      }
    },
    [report],
  );

  return useMemo(
    () => ({
      /**
       * Where a "new file here" belongs: inside a folder, or beside a file.
       * VS Code does the same, and it is the answer that matches what the
       * student pointed at.
       */
      containerFor(path: string): string {
        const node = project ? findByPath(project, path) : undefined;
        return node?.kind === "folder" ? node.path : parentPath(path);
      },

      async create(kind: "file" | "folder", containerPath: string) {
        if (!project) return;
        const name = await dialog.prompt({
          title: t(kind === "file" ? "studio.newFile" : "studio.newFolder"),
          description: containerPath
            ? t("studio.insideFolder", { name: fileName(containerPath) })
            : t("studio.atTopLevel"),
          placeholder: kind === "file" ? "helpers.js" : "images",
          confirmLabel: t("studio.create"),
        });
        if (!name) return;
        const path = containerPath ? joinPath(containerPath, name) : name;
        try {
          if (kind === "file") {
            addFile(path, "");
            // Opened straight away: a new empty file you cannot see is
            // indistinguishable from a new file that was not created.
            openFile(path);
          } else {
            addFolder(path);
          }
        } catch (err) {
          await report(err);
        }
      },

      async rename(path: string) {
        const current = fileName(path);
        const name = await dialog.prompt({
          title: `Rename “${current}”`,
          defaultValue: current,
          confirmLabel: t("action.rename"),
        });
        const trimmed = name?.trim();
        if (!trimmed || trimmed === current) return;
        try {
          renamePath(path, joinPath(parentPath(path), trimmed));
        } catch (err) {
          await report(err);
        }
      },

      async duplicate(path: string) {
        if (!project) return;
        try {
          const target = duplicatePath(path, (candidate) => findByPath(project, candidate) !== undefined);
          const created = duplicateNode(path, target);
          if (created && findByPath(project, created)?.kind === "file") openFile(created);
        } catch (err) {
          await report(err);
        }
      },

      async remove(path: string) {
        if (!project) return;
        const node = findByPath(project, path);
        if (!node) return;
        const confirmed = await dialog.confirm({
          title: t("studio.deleteNode", { name: node.name }),
          description: t(node.kind === "folder" ? "studio.deleteFolderBody" : "studio.deleteFileBody"),
          confirmLabel: t("action.delete"),
          danger: true,
        });
        if (!confirmed) return;
        try {
          removeNode(path);
        } catch (err) {
          await report(err);
        }
      },

      undoDelete,

      /** The project-qualified path, which is the nearest thing to "absolute" here. */
      copyPath(path: string) {
        return copy(displayPath(project?.name ?? "project", path));
      },

      copyRelativePath(path: string) {
        return copy(path);
      },

      /**
       * One file, saved to the student's device. Export-as-zip already exists in
       * the top bar for the whole project; this is for the much commoner "I need
       * to hand in style.css".
       */
      async download(path: string) {
        if (!project) return;
        const node = findByPath(project, path);
        if (!node || node.kind !== "file") return;
        const blob = new Blob([node.content ?? ""], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = node.name;
        a.click();
        URL.revokeObjectURL(url);
      },
    }),
    [project, dialog, t, addFile, addFolder, openFile, renamePath, duplicateNode, removeNode, undoDelete, copy, report],
  );
}

export type FileActions = ReturnType<typeof useFileActions>;
