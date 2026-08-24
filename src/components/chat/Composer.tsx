"use client";

import { useRef, useState } from "react";
import {
  attachmentsFromFiles,
  formatSize,
  screenshotAttachment,
  type Attachment,
} from "@/lib/attachments";
import { CameraIcon, FileIcon, PaperclipIcon, SendIcon, XIcon } from "@/components/icons";

// The input the whole app shares. Handles typing, drag-and-drop, paste,
// file picking, and one-frame screen capture — all in-app, no browser dialogs
// except the screen-share permission prompt the browser insists on showing.

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onSend: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  /** Rendered under the input — mode pills, tips, etc. */
  footer?: React.ReactNode;
  autoFocus?: boolean;
}

export function Composer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSend,
  disabled,
  loading,
  placeholder = "Ask anything…",
  footer,
  autoFocus,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ingest(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { attachments: added, errors } = await attachmentsFromFiles(list);
      if (added.length) onAttachmentsChange([...attachments, ...added]);
      if (errors.length) setError(errors.join(" "));
    } finally {
      setBusy(false);
    }
  }

  async function handleScreenshot() {
    setBusy(true);
    setError(null);
    try {
      onAttachmentsChange([...attachments, await screenshotAttachment()]);
    } catch (err) {
      // A user closing the share picker isn't an error worth shouting about.
      const message = err instanceof Error ? err.message : "Couldn't take that screenshot.";
      setError(/permission|denied|abort/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 224)}px`;
  }

  const canSend = !disabled && !loading && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(e.dataTransfer.files);
        }}
        className={`rounded-3xl border bg-[var(--surface-1)] transition-colors ${
          dragging ? "border-[var(--text)] bg-[var(--surface-2)]" : "border-[var(--line-strong)]"
        }`}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => onAttachmentsChange(attachments.filter((x) => x.id !== a.id))}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5 p-2.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void ingest(e.target.files);
              e.target.value = "";
            }}
          />

          <IconButton
            label="Attach a file or image"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="h-5 w-5" />
          </IconButton>

          <IconButton label="Show me your screen" disabled={busy} onClick={handleScreenshot}>
            <CameraIcon className="h-5 w-5" />
          </IconButton>

          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            value={value}
            rows={1}
            disabled={disabled}
            placeholder={dragging ? "Drop it here…" : placeholder}
            onChange={(e) => {
              onChange(e.target.value);
              autoGrow(e.target);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                void ingest(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  onSend();
                  if (textareaRef.current) textareaRef.current.style.height = "auto";
                }
              }
            }}
            className="max-h-56 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-50"
          />

          <button
            onClick={() => {
              onSend();
              if (textareaRef.current) textareaRef.current.style.height = "auto";
            }}
            disabled={!canSend}
            aria-label="Send"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-25"
          >
            {loading ? (
              <span className="h-3 w-3 rounded-sm bg-current" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 px-2 text-xs text-[var(--danger)]">{error}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  return (
    <div className="group relative flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pr-7">
      {attachment.kind === "image" && attachment.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)]">
          <FileIcon className="h-4 w-4 text-[var(--text-dim)]" />
        </span>
      )}
      <div className="min-w-0 max-w-[10rem]">
        <p className="truncate text-xs font-medium text-[var(--text)]">{attachment.name}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{formatSize(attachment.size)}</p>
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="absolute right-1 top-1 rounded-full p-1 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
