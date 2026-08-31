// The Panda mascot.
//
// Three forms, all plain inline SVG so they scale and recolor with no assets:
//   PandaMark    — a face, front on and still. The logo.
//   PandaBall    — tucked into a ball, eyes shut. The thinking/streaming shape.
//   PandaSitting — seated, holding bamboo, idling. The greeting and avatar.
//
// Proportions matter here: the head is deliberately small against the body
// (rx 47 vs 58) and the two overlap, so it reads as one animal rather than a
// head balanced on a snowman. The eyes are glossy black orbs on an almost
// black patch — the white shine is what makes them read as eyes.

const FUR = "#fafafa";
const INK = "#1a1a1a";
const EAR_IN = "#4a4a4a";
const PATCH = "#1c1c1c";
const ORB = "#000000";
const ORB_RIM = "#3d3d3d";
const BAMBOO = "#6aa84f";
const BAMBOO_LEAF = "#8fbc6b";

function Eye({ cx, cy, r = 8.4 }: { cx: number; cy: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={ORB} stroke={ORB_RIM} strokeWidth={1} />
      <circle cx={cx - r * 0.34} cy={cy - r * 0.36} r={r * 0.32} fill="#ffffff" opacity={0.92} />
      <circle cx={cx + r * 0.3} cy={cy + r * 0.34} r={r * 0.14} fill="#ffffff" opacity={0.45} />
    </>
  );
}

/**
 * The app mark: a panda face, front on and still.
 *
 * Deliberately not the rolling ball — that shape belongs to the streaming
 * state, and a logo that spins forever reads as a loading spinner. Drawn
 * tighter than the seated panda so it survives being 20px wide.
 */
export function PandaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="24" cy="26" r="15" fill={INK} />
      <circle cx="24" cy="26" r="7" fill={EAR_IN} />
      <circle cx="76" cy="26" r="15" fill={INK} />
      <circle cx="76" cy="26" r="7" fill={EAR_IN} />
      <ellipse cx="50" cy="55" rx="40" ry="37" fill={FUR} />
      <ellipse cx="34" cy="52" rx="12" ry="14" fill={PATCH} transform="rotate(-14 34 52)" />
      <ellipse cx="66" cy="52" rx="12" ry="14" fill={PATCH} transform="rotate(14 66 52)" />
      <Eye cx={34} cy={52} r={7} />
      <Eye cx={66} cy={52} r={7} />
      <ellipse cx="50" cy="70" rx="6.5" ry="4.8" fill={INK} />
      <path d="M50 74 L50 77" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M41 79 Q50 87 59 79" stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The tucked ball, eyes shut. This is the streaming/thinking shape. */
export function PandaBall({ className = "", spin = false }: { className?: string; spin?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} ${spin ? "panda-roll" : ""}`} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={FUR} />
      <circle cx="26" cy="24" r="13" fill={INK} />
      <circle cx="26" cy="24" r="6" fill={EAR_IN} />
      <circle cx="74" cy="24" r="13" fill={INK} />
      <circle cx="74" cy="24" r="6" fill={EAR_IN} />
      <ellipse cx="35" cy="50" rx="12" ry="14" fill={PATCH} />
      <ellipse cx="65" cy="50" rx="12" ry="14" fill={PATCH} />
      <path d="M27 50 Q35 56 43 50" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M57 50 Q65 56 73 50" stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="68" rx="6" ry="4.5" fill={INK} />
      <path d="M43 76 Q50 82 57 76" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="72" rx="11" ry="9" fill={INK} transform="rotate(-24 22 72)" />
      <ellipse cx="78" cy="72" rx="11" ry="9" fill={INK} transform="rotate(24 78 72)" />
    </svg>
  );
}

/**
 * Seated panda. `bamboo` adds the stalk in its paw (the big greeting form);
 * without it the arms are dropped, which suits the small chat avatar.
 */
export function PandaSitting({
  className = "",
  bamboo = true,
  idle = true,
}: {
  className?: string;
  bamboo?: boolean;
  idle?: boolean;
}) {
  return (
    <svg viewBox="0 0 200 250" className={`${className} ${idle ? "panda-idle" : ""}`} aria-hidden="true">
      {bamboo && (
        <g className={idle ? "panda-bamboo" : ""}>
          <rect x="150" y="112" width="11" height="80" rx="5" fill={BAMBOO} />
          <rect x="150" y="136" width="11" height="4" fill="#4e7d3a" />
          <rect x="150" y="164" width="11" height="4" fill="#4e7d3a" />
          <ellipse cx="176" cy="116" rx="18" ry="7" fill={BAMBOO_LEAF} transform="rotate(-24 176 116)" />
          <ellipse cx="137" cy="104" rx="16" ry="6" fill={BAMBOO_LEAF} transform="rotate(20 137 104)" />
        </g>
      )}

      {/* Body first, head over it, so the two overlap into one silhouette. */}
      <ellipse cx="100" cy="180" rx="58" ry="60" fill={FUR} />
      <ellipse cx="52" cy="176" rx="14" ry="23" fill={INK} transform="rotate(20 52 176)" />
      <ellipse cx="148" cy="176" rx="14" ry="23" fill={INK} transform="rotate(-20 148 176)" />
      <ellipse cx="76" cy="235" rx="17" ry="11" fill={INK} />
      <ellipse cx="124" cy="235" rx="17" ry="11" fill={INK} />

      <g className={idle ? "panda-ear-l" : ""}>
        <circle cx="64" cy="54" r="17" fill={INK} />
        <circle cx="64" cy="54" r="8" fill={EAR_IN} />
      </g>
      <g className={idle ? "panda-ear-r" : ""}>
        <circle cx="136" cy="54" r="17" fill={INK} />
        <circle cx="136" cy="54" r="8" fill={EAR_IN} />
      </g>

      <ellipse cx="100" cy="88" rx="47" ry="44" fill={FUR} />
      <ellipse cx="82" cy="86" rx="14" ry="17" fill={PATCH} transform="rotate(-14 82 86)" />
      <ellipse cx="118" cy="86" rx="14" ry="17" fill={PATCH} transform="rotate(14 118 86)" />
      <g className={idle ? "panda-eye" : ""}>
        <Eye cx={82} cy={86} />
      </g>
      <g className={idle ? "panda-eye" : ""}>
        <Eye cx={118} cy={86} />
      </g>
      <ellipse cx="100" cy="106" rx="7.5" ry="5.5" fill={INK} />
      <path d="M100 111 L100 115" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M89 117 Q100 126 111 117" stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />
    </svg>
  );
}
