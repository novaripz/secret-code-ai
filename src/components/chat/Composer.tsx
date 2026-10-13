"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  attachmentsFromFiles,
  formatSize,
  screenshotAttachment,
  type Attachment,
} from "@/lib/attachments";
import { useI18n } from "@/lib/i18n";
import {
  CameraIcon,
  FileIcon,
  MicIcon,
  MonitorIcon,
  PaperclipIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
  XIcon,
} from "@/components/icons";
import { downscalePhoto } from "./photo";
import { useCanListen, useDictation } from "./speech";

// The input the whole app shares. Handles typing, drag-and-drop, paste,
// file picking, taking a photo, one-frame screen capture and (where the
// browser can) voice typing — all in-app, no browser dialogs except the
// permission prompts the browser insists on showing.
//
// The text gets the whole width and the tools sit in a row beneath it. They
// used to share one row with the text, and on a 360px phone three icons and a
// send button left the student a sliver to type into.
//
// Photo and screenshot are two different things and look like it. The camera
// takes a picture of the world (handwritten working, a textbook page, a
// diagram on a whiteboard); the monitor icon shares what is on screen.
//
// The camera is a plain `<input type="file" accept="image/*"
// capture="environment">` rather than getUserMedia and a custom viewfinder.
// That single attribute hands a phone straight to its own rear camera app —
// better focus, better exposure, and a preview the student already knows how
// to use. On a laptop with no camera the same input degrades to the file
// picker, which is the right thing to happen, not a bug to work around.

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  onSend: () => void;
  disabled?: boolean;
  /** A reply is on its way. Sending is blocked until it lands or is stopped. */
  loading?: boolean;
  /**
   * When given, the send button turns into Stop while `loading`, and Escape in
   * the text box does the same. Without it the button just shows it is busy.
   */
  onStop?: () => void;
  placeholder?: string;
  /** Rendered under the input — mode pills, tips, etc. */
  footer?: React.ReactNode;
  autoFocus?: boolean;
  /** The text box, for a parent that needs to focus it (a prefilled draft). */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Shows a microphone for voice typing, in this language, where supported. */
  voiceLang?: string;
}

export function Composer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSend,
  disabled,
  loading,
  onStop,
  placeholder,
  footer,
  autoFocus,
  inputRef,
  voiceLang,
}: ComposerProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canListen = useCanListen();
  const dictation = useDictation({ lang: voiceLang ?? "en", value, onChange });

  // The newest attachments, read AFTER an await. Reading the prop there used
  // the list as it was when the file picker opened, so a chip the student
  // removed while a big file was still being read came back from the dead.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  });

  async function ingest(files: FileList | File[] | null | undefined) {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { attachments: added, errors } = await attachmentsFromFiles(list);
      if (added.length) onAttachmentsChange([...attachmentsRef.current, ...added]);
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
      const shot = await screenshotAttachment();
      onAttachmentsChange([...attachmentsRef.current, shot]);
    } catch (err) {
      // A user closing the share picker isn't an error worth shouting about.
      const message = err instanceof Error ? err.message : t("composer.screenshotFailed");
      setError(/permission|denied|abort/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }

  // Grows with what is in it, including text that arrived from somewhere other
  // than the keyboard — a draft handed over from Watch, an edit, dictation —
  // and shrinks back the moment it is sent and cleared.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 224)}px`;
  }, [value, textareaRef]);

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

  const hasContent = value.trim().length > 0 || attachments.length > 0;
  const canSend = !disabled && !loading && !busy && hasContent;
  const showStop = loading && onStop !== undefined;

  function submit() {
    if (dictation.listening) dictation.stop();
    if (canSend) onSend();
  }

  const dictationMessage =
    dictation.error === "blocked"
      ? t("composer.micBlocked")
      : dictation.error === "network"
        ? t("composer.micOffline")
        : dictation.error
          ? t("composer.micFailed")
          : null;

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
        // `composer-shell` (globals.css) gives up the textarea's own focus
        // ring — the caret already answers "where am I typing?" — and draws
        // the drag state. `chat-composer` (styles/shell-chat.css) is the
        // resting look: a soft lift off the page rather than a hard outline,
        // so it reads as somewhere to type without looking like a form field
        // somebody already tabbed into.
        data-dragging={dragging || undefined}
        className="composer-shell chat-composer border transition-colors motion-reduce:transition-none"
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

        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          rows={1}
          disabled={disabled}
          aria-label={placeholder ?? t("composer.placeholder")}
          placeholder={
            dictation.listening
              ? t("composer.listening")
              : dragging
                ? t("composer.dropHere")
                : (placeholder ?? t("composer.placeholder"))
          }
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void ingest(files);
            }
          }}
          onFocus={keepVisible}
          onKeyDown={(e) => {
            // Enter while composing Japanese/Chinese/Korean text picks the
            // candidate; sending then would send half a word.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && showStop) {
              e.preventDefault();
              onStop?.();
            }
          }}
          // 16px, not the 15px this was. Below 16 iOS zooms the page the
          // instant the field takes focus and never zooms back out, leaving
          // the student panning a composer that no longer fits the screen.
          className="block max-h-56 w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[16px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-50"
        />

        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          <ToolButton label={t("composer.attach")} disabled={busy || disabled} onClick={() => fileInputRef.current?.click()}>
            <PaperclipIcon />
          </ToolButton>
          <ToolButton label={t("composer.takePhoto")} disabled={busy || disabled} onClick={() => cameraInputRef.current?.click()}>
            <CameraIcon />
          </ToolButton>
          <ToolButton label={t("composer.screenshot")} disabled={busy || disabled} onClick={handleScreenshot}>
            <MonitorIcon />
          </ToolButton>
          {voiceLang && canListen && (
            <ToolButton
              label={dictation.listening ? t("composer.stopListening") : t("composer.voice")}
              disabled={disabled}
              pressed={dictation.listening}
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            >
              <MicIcon className={dictation.listening ? "animate-pulse" : undefined} />
            </ToolButton>
          )}
          {busy && <SpinnerIcon className="ms-1 h-4 w-4 animate-spin text-[var(--text-faint)]" aria-label={t("composer.reading")} />}

          {showStop ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("chat.stop")}
              title={t("chat.stopHint")}
              className="composer-send ms-auto"
              data-stop
            >
              <StopIcon className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label={loading ? t("composer.waiting") : t("composer.send")}
              title={t("composer.send")}
              aria-busy={loading || undefined}
              className="composer-send ms-auto"
            >
              {loading ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-[18px] w-[18px]" />}
            </button>
          )}
        </div>
      </div>

      {(error || dictationMessage) && (
        <p role="alert" className="mt-2 px-2 text-[13px] text-[var(--danger)]">
          {error ?? dictationMessage}
        </p>
      )}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      // `.icon-btn` is 44px square on a phone and 36px from `md` up — the
      // phone floor lives in that class, so it cannot drift from the rest of
      // the app's icon buttons.
      className="icon-btn"
    >
      {children}
    </button>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { t } = useI18n();

  return (
    <div className="group relative flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pe-8">
      {attachment.kind === "image" && attachment.dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded-[var(--radius-sm)] object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-3)]">
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
        type="button"
        onClick={onRemove}
        aria-label={t("composer.removeAttachment", { name: attachment.name })}
        title={t("composer.removeAttachment", { name: attachment.name })}
        className="tap-pad absolute end-0.5 top-0.5 rounded-full p-1.5 text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
