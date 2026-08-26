"use client";

import { useRef, useState } from "react";
import { useProfileStore } from "@/store/useProfileStore";
import { PandaSitting } from "@/components/Panda";

// Profile picture.
//
// The image is downscaled in the browser before it is stored, because the
// profile lives in localStorage and a phone photo would blow the quota on its
// own. 256px square is plenty for something rendered at 40px.

const SIZE = 256;

async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read that image.");

  // Cover-crop to a square so faces don't get squashed.
  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AvatarPicker() {
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    try {
      updateProfile({ avatar: await downscale(file) });
    } catch {
      setError("Couldn't use that image. Try a different one.");
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--line)] p-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-2)]">
        {profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar} alt="" className="h-full w-full object-cover" />
        ) : (
          <PandaSitting className="h-[52px] w-[42px]" bamboo={false} idle={false} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--text)]">Profile picture</p>
        <p className="mt-1 text-sm text-[var(--text-faint)]">
          {error ?? "Shows next to your name. Stays on this device."}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => input.current?.click()}
          className="rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          {profile.avatar ? "Change" : "Upload"}
        </button>
        {profile.avatar && (
          <button
            onClick={() => updateProfile({ avatar: undefined })}
            className="rounded-xl border border-[var(--line-strong)] px-3.5 py-2 text-sm text-[var(--text-faint)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
