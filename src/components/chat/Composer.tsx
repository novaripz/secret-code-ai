"use client";

import { useRef, useState } from "react";
import {
  attachmentsFromFiles,
  formatSize,
  screenshotAttachment,
  type Attachment,
} from "@/lib/attachments";
import { useI18n } from "@/lib/i18n";
import { CameraIcon, FileIcon, MonitorIcon, PaperclipIcon, SendIcon, XIcon } from "@/components/icons";
import { downscalePhoto } from "./photo";

// The input the whole app shares. Handles typing, drag-and-drop, paste,
// file picking, taking a photo, and one-frame screen capture — all in-app, no
// browser dialogs except the permission prompts the browser insists on showing.
//
// Photo and screenshot are two different things and now look like it. The
// camera takes a picture of the world (handwritten working, a textbook page, a
// diagram on a whiteboard); the monitor icon shares what is on screen. They
// used to share the camera glyph, which promised a camera and opened a
// screen-share picker — on a phone, where the whole point is photographing
// homework, that promise was simply false.
//
// The camera is a plain `<input type="file" accept="image/*"
// capture="environment">` rather than getUserMedia and a custom viewfinder.
// That single attribute hands a phone straight to its own rear camera app —
// better focus, better exposure, and a preview the student already knows how
// to use. On a laptop with no camera the same input degrades to the file
// picker, which is the right thing to happen, not a bug to work around. It
// also means there is no camera permission to deny in-page: the OS camera app
// owns that conversation, and a student who backs out just returns with no
// file, which is indistinguishable from cancelling a file picker.

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
  placeholder,
  footer,
  autoFocus,
}: ComposerProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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

  /**
   * A taken photo goes through the exact same attachment path as a dropped
   * file — it is only shrunk first, because a phone camera produces a file
   * several times larger than the request body can hold.
   */
  async function ingestPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const shrunk = await Promise.all(Array.from(files).map(downscalePhoto));
      await ingest(shrunk);
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
      const message = err instanceof Error ? err.message : t("composer.screenshotFailed");
      setError(/permission|denied|abort/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 224)}px`;
  }

  /**
   * Keep the composer above the on-screen keyboard.
   *
   * Chromium honours `interactiveWidget: resizes-content` (set in the root
   * layout), so there the dvh column shrinks and the composer is already where
   * it should be. iOS Safari does not: it leaves the layout viewport alone and
   * slides the keyboard over the bottom of the page, which on a chat screen is
   * precisely the input the student just tapped.
   *
   * The rAF-after-timeout is not superstition. The keyboard animates in over
   * roughly 250ms and the visual viewport is not final until it has settled, so
   * scrolling immediately scrolls to the pre-keyboard geometry and lands in the
   * wrong place. `block: "end"` keeps the last message visible above the input
   * rather than centring the composer in what is left.
   */
  function keepVisible() {
    const el = textareaRef.current;
    if (!el) return;
    window.setTimeout(() => {
      requestAnimationFrame(() => el.scrollIntoView({ block: "end", behavior: "smooth" }));
    }, 300);
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
        // `composer-shell` (globals.css) owns the resting and focused border.
        // It was `--line-strong` at rest, which on the light and sepia grounds
        // drew a hard box around the input and made an idle composer look like
        // a form field someone had already tabbed into. The resting border is
        // now `--line`, the same hairline the chips and cards use, so the
        // input reads as part of the surface — and the strong treatment is
        // spent where it means something, on focus. That rule lives in CSS
        // because `:has(:focus-visible)` is the only way to say "the wrapper
        // draws the ring the textarea gave up", and the textarea has to give
        // it up or the ring lands inside the rounded shell.
        //
        // The drag state moved to a data attribute for the same reason: this
        // file's CSS is unlayered and Tailwind's utilities are not, so a bare
        // `border-[...]` class here would lose to the rule below no matter
        // what order it is written in. Both border states now live together.
        data-dragging={dragging || undefined}
        className={`composer-shell rounded-3xl border bg-[var(--surface-1)] transition-colors motion-reduce:transition-none ${
          dragging ? "bg-[var(--surface-2)]" : ""
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

        <div className="flex items-end gap-0.5 p-2 sm:gap-1.5 sm:p-2.5">
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

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            // Rear camera: the student is photographing the page in front of
            // them, not themselves.
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void ingestPhotos(e.target.files);
              // Cleared so taking the same shot twice still fires a change.
              e.target.value = "";
            }}
          />

          <IconButton
            label={t("composer.attach")}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="h-5 w-5" />
          </IconButton>

          <IconButton
            label={t("composer.takePhoto")}
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
          >
            <CameraIcon className="h-5 w-5" />
          </IconButton>

          <IconButton label={t("composer.screenshot")} disabled={busy} onClick={handleScreenshot}>
            <MonitorIcon className="h-5 w-5" />
          </IconButton>

          <textarea
            ref={textareaRef}
            autoFocus={autoFocus}
            value={value}
            rows={1}
            disabled={disabled}
            placeholder={dragging ? t("composer.dropHere") : (placeholder ?? t("composer.placeholder"))}
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
            onFocus={keepVisible}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  onSend();
                  if (textareaRef.current) textareaRef.current.style.height = "auto";
                }
              }
            }}
            // 16px, not the 15px this was. Below 16 iOS zooms the page the
            // instant the field takes focus and never zooms back out, leaving
            // the student panning a composer that no longer fits the screen.
            // One pixel, and it was the difference between usable and not.
            className="max-h-56 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2.5 text-[16px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-50"
          />

          <button
            onClick={() => {
              onSend();
              if (textareaRef.current) textareaRef.current.style.height = "auto";
            }}
            disabled={!canSend}
            aria-label={t("composer.send")}
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-25 md:h-9 md:w-9"
          >
            {loading ? (
              <span className="h-3 w-3 rounded-sm bg-current" />
            ) : (
              <SendIcon className="h-5 w-5 md:h-4 md:w-4" />
            )}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 px-2 text-sm text-[var(--danger)] md:text-xs">{error}</p>}
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
      // 44px square on a phone, the 36px it always was from `sm` up. Three of
      // these plus a send button have to share a 360px row with the text, so
      // the gap between them shrinks instead of the buttons.
      className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors motion-reduce:transition-none hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-30 md:h-9 md:w-9"
    >
      {children}
    </button>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { t } = useI18n();

  return (
    <div className="group relative flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pr-8">
      {attachment.kind === "image" && attachment.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)]">
          <FileIcon className="h-4 w-4 text-[var(--text-dim)]" />
        </span>
      )}
      <div className="min-w-0 max-w-[10rem]">
        <p className="truncate text-[13px] font-medium text-[var(--text)]">{attachment.name}</p>
        <p className="text-xs text-[var(--text-faint)]">{formatSize(attachment.size)}</p>
      </div>
      {/* `tap-pad`, not a bigger button. The × is pinned to the corner of a
          chip barely 44px tall itself, so drawing it at 44 would cover the
          filename it is meant to sit beside; the invisible pad catches the
          thumb instead. */}
      <button
        onClick={onRemove}
        aria-label={t("composer.removeAttachment", { name: attachment.name })}
        className="tap-pad absolute right-0.5 top-0.5 rounded-full p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
