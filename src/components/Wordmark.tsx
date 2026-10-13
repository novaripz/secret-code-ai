import { PandaMark } from "./Panda";

/**
 * The name. The last letter is heavier and carries a soft white glow, which
 * gives the wordmark a focal point without a second colour.
 */
export function Wordmark({
  className = "",
  size = "sm",
  mark = true,
}: {
  className?: string;
  size?: "sm" | "lg";
  mark?: boolean;
}) {
  const text = size === "lg" ? "text-2xl" : "text-[17px]";
  const box = size === "lg" ? "h-11 w-11" : "h-8 w-8";
  const glyph = size === "lg" ? "h-8 w-8" : "h-6 w-6";

  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      {mark && (
        // The mark sits on the brand gradient — the one place the logo
        // carries the brand colour — so the panda's black and white read as a
        // badge rather than a doodle on grey.
        <span
          className={`flex ${box} shrink-0 items-center justify-center rounded-[var(--radius)] shadow-ui-1`}
          style={{ background: "var(--brand-gradient)" }}
        >
          <PandaMark className={glyph} />
        </span>
      )}
      <span className={`wordmark ${text} leading-none text-[var(--text)]`}>
        Pand<span className="wordmark-accent">a</span>
      </span>
    </span>
  );
}
